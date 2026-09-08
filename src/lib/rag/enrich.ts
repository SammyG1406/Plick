import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describeApiError, getClient, MODEL } from "../llm";
import { snippet, STOPWORDS, tokenise } from "./text";
import { compareWeeks, tagFor, UNPLACED } from "./weeks";
import type { DraftChunk } from "./chunk";
import type { WeekTag } from "../types";

/**
 * Turns raw chunks into *recognised* material: each chunk gets a week placement
 * and a concept list, and the document gets a rolled-up view of both.
 *
 * Two paths produce the same shape:
 *  - Claude reads the section outline and names concepts the way a human would,
 *    and can place sections the regex missed ("Naive Bayes" belongs with Week 4).
 *  - Without a key, TF-IDF over the corpus surfaces distinctive noun phrases.
 */

const SectionSchema = z.object({
  ordinal: z.number().describe("The chunk ordinal this describes, copied verbatim."),
  week_number: z
    .number()
    .nullable()
    .describe(
      "Which numbered week/lecture/topic this section belongs to. null if the material genuinely has no course placement.",
    ),
  concepts: z
    .array(z.string())
    .describe(
      "1-4 concepts taught in this section. Use the canonical name a lecturer would say ('Bayes' theorem', 'gradient descent'), not a sentence.",
    ),
});

const EnrichmentSchema = z.object({
  scheme: z
    .string()
    .describe("What the source calls its units: Week, Lecture, Topic, Module, or Unit."),
  sections: z.array(SectionSchema),
});

export interface EnrichedChunk extends DraftChunk {
  concepts: string[];
}

export interface Enrichment {
  chunks: EnrichedChunk[];
  weeks: WeekTag[];
  concepts: string[];
  llmEnriched: boolean;
  note?: string;
}

/** Claude sees an outline, not the full corpus — enough to name concepts cheaply. */
function buildOutline(chunks: DraftChunk[]): string {
  return chunks
    .map((c) => {
      const trail = c.headings.length ? c.headings.join(" › ") : "(no heading)";
      return [
        `<section ordinal="${c.ordinal}" detected_week="${c.week.number ?? "none"}">`,
        `heading: ${trail}`,
        `text: ${snippet(c.text, 700)}`,
        `</section>`,
      ].join("\n");
    })
    .join("\n\n");
}

async function enrichWithClaude(
  chunks: DraftChunk[],
  title: string,
): Promise<Map<number, { week: number | null; concepts: string[] }> | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(EnrichmentSchema),
      },
      system:
        "You organise study material. Given an outline of a document's sections, assign each " +
        "section to the course unit (week/lecture/topic) it belongs to and name the concepts it " +
        "teaches. Respect explicit markers in the text; where a section has no marker, infer its " +
        "placement from the surrounding sections and the subject matter. Concept names must be " +
        "reusable across documents, so prefer the standard term over the author's phrasing, and " +
        "return every section you were given exactly once.",
      messages: [
        {
          role: "user",
          content: `Document title: ${title}\n\n${buildOutline(chunks)}`,
        },
      ],
    });

    const parsed = response.parsed_output;
    if (!parsed) return null;

    const map = new Map<number, { week: number | null; concepts: string[] }>();
    for (const section of parsed.sections) {
      map.set(section.ordinal, {
        week: section.week_number,
        concepts: section.concepts.map((c) => c.trim()).filter(Boolean).slice(0, 4),
      });
    }
    return map;
  } catch (error) {
    console.warn("[enrich]", describeApiError(error));
    return null;
  }
}

/**
 * Fallback for when no model is available.
 *
 * The section heading is the highest-signal thing on offer — it is a concept
 * label a human already wrote — so it leads. Beyond that we only accept
 * *recurring bigrams*: two content words that sit together and appear more than
 * once in the document. Requiring recurrence is what separates real terminology
 * ("central limit theorem", "confidence intervals") from one-off phrasing, and
 * it is why this produces a handful of usable tags instead of a wall of noise.
 */
function enrichHeuristically(chunks: DraftChunk[]): Map<number, string[]> {
  const documentBigrams = new Map<string, number>();
  const chunkBigrams = chunks.map((chunk) => {
    const terms = tokenise(chunk.text);
    const local = new Map<string, number>();
    for (let i = 0; i + 1 < terms.length; i++) {
      // Both halves must be substantial; "the cost" and "of n" are not concepts.
      if (terms[i].length < 4 || terms[i + 1].length < 4) continue;
      const bigram = `${terms[i]} ${terms[i + 1]}`;
      local.set(bigram, (local.get(bigram) ?? 0) + 1);
      documentBigrams.set(bigram, (documentBigrams.get(bigram) ?? 0) + 1);
    }
    return local;
  });

  return new Map(
    chunks.map((chunk, i) => {
      const concepts: string[] = [];

      const heading = chunk.headings
        .at(-1)
        ?.replace(/^(week|wk|lecture|lec|topic|module|unit|session|tutorial|lab|chapter)\s*\d+\s*[-–—:.]?\s*/i, "")
        .trim();
      if (heading && heading.length > 3 && heading.split(/\s+/).length <= 7) {
        concepts.push(titleCase(heading));
      }

      const covered = concepts.join(" ").toLowerCase();
      const recurring = [...chunkBigrams[i].entries()]
        .filter(([bigram]) => (documentBigrams.get(bigram) ?? 0) >= 2)
        .filter(([bigram]) => !covered.includes(bigram.split(" ")[0]))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, concepts.length ? 1 : 2)
        .map(([bigram]) => titleCase(bigram));

      concepts.push(...recurring);
      return [chunk.ordinal, concepts];
    }),
  );
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && STOPWORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export async function enrichChunks(
  chunks: DraftChunk[],
  title: string,
): Promise<Enrichment> {
  if (chunks.length === 0) {
    return { chunks: [], weeks: [], concepts: [], llmEnriched: false };
  }

  const fromClaude = await enrichWithClaude(chunks, title);
  const heuristic = fromClaude ? null : enrichHeuristically(chunks);

  // Whatever the source, the scheme label stays whatever the document used.
  const detectedScheme =
    chunks.find((c) => c.week.number !== null)?.week.label.split(" ")[0] ?? "Week";

  const enriched: EnrichedChunk[] = chunks.map((chunk) => {
    const llm = fromClaude?.get(chunk.ordinal);
    const concepts = llm?.concepts ?? heuristic?.get(chunk.ordinal) ?? [];

    let week = chunk.week;
    if (llm && llm.week !== null && llm.week !== chunk.week.number) {
      // Claude placed a section the regex couldn't; mark it as inferred so the
      // UI can show it's a model judgement rather than something the doc said.
      week = tagFor(detectedScheme, llm.week, "inferred");
    } else if (llm && llm.week === null && chunk.week.number === null) {
      week = UNPLACED;
    }

    return { ...chunk, week, concepts };
  });

  const weekMap = new Map<string, WeekTag>();
  for (const chunk of enriched) {
    const key = chunk.week.number === null ? "unplaced" : String(chunk.week.number);
    const existing = weekMap.get(key);
    // Prefer the strongest evidence we have for each week's label.
    if (!existing || rank(chunk.week.confidence) < rank(existing.confidence)) {
      weekMap.set(key, chunk.week);
    }
  }

  const conceptMap = new Map<string, string>();
  for (const chunk of enriched) {
    for (const concept of chunk.concepts) {
      const key = concept.toLowerCase();
      if (!conceptMap.has(key)) conceptMap.set(key, concept);
    }
  }

  return {
    chunks: enriched,
    weeks: [...weekMap.values()].sort(compareWeeks),
    concepts: [...conceptMap.values()].sort((a, b) => a.localeCompare(b)),
    llmEnriched: fromClaude !== null,
    note: fromClaude
      ? undefined
      : "Concepts extracted with TF-IDF. Set ANTHROPIC_API_KEY for model-quality naming.",
  };
}

function rank(confidence: WeekTag["confidence"]): number {
  return confidence === "explicit" ? 0 : confidence === "inherited" ? 1 : 2;
}
