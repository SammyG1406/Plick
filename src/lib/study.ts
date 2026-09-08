import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describeApiError, getClient, MODEL } from "./llm";
import { retrieve } from "./rag/retrieve";
import { snippet } from "./rag/text";
import type { RetrievalFilters, RetrievedChunk, StudyMode, StudyResult } from "./types";

const SummarySchema = z.object({
  summary: z.string().describe("2-4 paragraphs explaining this material as a whole."),
  key_points: z.array(z.string()).describe("5-8 points worth remembering, one sentence each."),
});

const FlashcardsSchema = z.object({
  flashcards: z
    .array(
      z.object({
        front: z.string().describe("A question or prompt. Never a yes/no question."),
        back: z.string().describe("The answer, 1-3 sentences."),
        concept: z.string().describe("The concept this card tests."),
      }),
    )
    .describe("8-12 cards covering the material without repeating each other."),
});

const QuizSchema = z.object({
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).describe("Exactly 4 options."),
        answer_index: z.number().describe("0-based index of the correct option."),
        explanation: z.string().describe("Why the answer is right and the distractors are not."),
        concept: z.string(),
      }),
    )
    .describe("5-8 questions. Distractors must be plausible, not obviously wrong."),
});

function buildContext(results: RetrievedChunk[]): string {
  return results
    .map((r, i) => {
      const trail = r.chunk.headings.join(" › ");
      return [
        `<source index="${i + 1}" document="${r.document.title}" week="${r.chunk.week.label}">`,
        trail ? `section: ${trail}` : null,
        r.chunk.text,
        `</source>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

const SYSTEM =
  "You make study material from a student's own notes. Work only from the sources provided — " +
  "if the notes do not cover something, leave it out rather than filling the gap from general " +
  "knowledge. Match the notes' terminology and level. Where the notes flag a common mistake or " +
  "a subtlety, that is exactly what to test.";

export interface StudyRequest {
  ownerId: string;
  mode: StudyMode;
  /** Free-text topic, or empty when scoping purely by week/concept filters. */
  query?: string;
  filters?: RetrievalFilters;
}

export async function generateStudyMaterial(request: StudyRequest): Promise<StudyResult> {
  const { ownerId, mode, filters = {} } = request;

  // With no query, the filters themselves describe what to pull, so the week and
  // concept names become the retrieval query.
  const scopeParts = [
    request.query?.trim(),
    ...(filters.concepts ?? []),
    ...(filters.weeks ?? []),
    ...(filters.weekNumbers ?? []).map((n) => `unit ${n}`),
  ].filter(Boolean) as string[];
  const scope = scopeParts.join(", ") || "your whole library";
  const query = request.query?.trim() || (filters.concepts ?? []).join(" ") || scope;

  // More context than a search result list: study material should see the
  // section, not just the best-matching paragraph.
  const { results } = await retrieve(ownerId, query, filters, 14);

  if (results.length === 0) {
    return {
      mode,
      scope,
      sources: [],
      generatedBy: "extractive",
      summary: "Nothing in your library matches that scope yet. Add a source or widen the filters.",
      keyPoints: [],
    };
  }

  const sources = results.map((r) => ({
    chunkId: r.chunk.id,
    documentTitle: r.document.title,
    snippet: snippet(r.chunk.text, 200),
  }));

  const client = getClient();
  if (client) {
    try {
      const context = buildContext(results);
      const instruction =
        mode === "summary"
          ? `Summarise this material. Scope: ${scope}.`
          : mode === "flashcards"
            ? `Write flashcards covering this material. Scope: ${scope}.`
            : `Write a multiple-choice quiz on this material. Scope: ${scope}.`;

      const format =
        mode === "summary"
          ? zodOutputFormat(SummarySchema)
          : mode === "flashcards"
            ? zodOutputFormat(FlashcardsSchema)
            : zodOutputFormat(QuizSchema);

      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format },
        system: SYSTEM,
        messages: [{ role: "user", content: `${instruction}\n\n${context}` }],
      });

      const parsed = response.parsed_output;
      if (parsed) {
        if (mode === "summary" && "summary" in parsed) {
          return {
            mode,
            scope,
            sources,
            generatedBy: "claude",
            summary: parsed.summary,
            keyPoints: parsed.key_points,
          };
        }
        if (mode === "flashcards" && "flashcards" in parsed) {
          return { mode, scope, sources, generatedBy: "claude", flashcards: parsed.flashcards };
        }
        if (mode === "quiz" && "quiz" in parsed) {
          return {
            mode,
            scope,
            sources,
            generatedBy: "claude",
            quiz: parsed.quiz.map((q) => ({
              question: q.question,
              options: q.options,
              answerIndex: q.answer_index,
              explanation: q.explanation,
              concept: q.concept,
            })),
          };
        }
      }
    } catch (error) {
      console.warn("[study]", describeApiError(error));
    }
  }

  return extractiveFallback(mode, scope, results, sources);
}

/**
 * Without a model we can still be useful: surface the retrieved passages
 * organised by concept, and build cloze-style cards from definition sentences.
 * Quizzes need distractors we can't fabricate honestly, so that mode degrades
 * to flashcards with a note rather than inventing wrong answers.
 */
function extractiveFallback(
  mode: StudyMode,
  scope: string,
  results: RetrievedChunk[],
  sources: StudyResult["sources"],
): StudyResult {
  const leadSentence = (text: string): string => {
    const match = /[^.!?]{40,240}[.!?]/.exec(text.replace(/\s+/g, " "));
    return (match?.[0] ?? snippet(text, 200)).trim();
  };

  if (mode === "summary") {
    return {
      mode,
      scope,
      sources,
      generatedBy: "extractive",
      summary:
        `Showing the ${results.length} most relevant passages for ${scope}. ` +
        "Set ANTHROPIC_API_KEY to get a written summary instead of extracted sentences.",
      keyPoints: results.slice(0, 8).map((r) => leadSentence(r.chunk.text)),
    };
  }

  const cards = results.slice(0, 12).map((r) => {
    const concept = r.chunk.concepts[0] ?? r.chunk.headings.at(-1) ?? r.document.title;
    return {
      front: `What do your notes say about ${concept}?`,
      back: leadSentence(r.chunk.text),
      concept,
    };
  });

  return {
    mode,
    scope,
    sources,
    generatedBy: "extractive",
    flashcards: cards,
    summary:
      mode === "quiz"
        ? "Quiz generation needs a model to write plausible distractors — showing extracted flashcards instead. Set ANTHROPIC_API_KEY for real quizzes."
        : undefined,
  };
}
