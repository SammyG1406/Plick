import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describeApiError, getClient, MODEL } from "../llm";
import { snippet, STOPWORDS } from "./text";
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
/**
 * Concept names are read by people, so they are built from the text's own
 * surface forms — "NP-complete problem", not the retrieval tokenizer's
 * "npcomplete complete". Frequency is still counted case-insensitively.
 */
const SURFACE_WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

function enrichHeuristically(chunks: DraftChunk[]): Map<number, string[]> {
  const documentBigrams = new Map<string, number>();
  const chunkBigrams = chunks.map((chunk) => {
    const words = chunk.text.match(SURFACE_WORD) ?? [];
    const local = new Map<string, string>();
    const counts = new Map<string, number>();

    for (let i = 0; i + 1 < words.length; i++) {
      const [a, b] = [words[i], words[i + 1]];
      // Both halves must be substantial; "the cost" and "of n" are not concepts.
      if (a.length < 4 || b.length < 4) continue;
      if (!isConceptWord(a.toLowerCase()) || !isConceptWord(b.toLowerCase())) continue;

      const key = `${a} ${b}`.toLowerCase();
      if (!local.has(key)) local.set(key, `${a} ${b}`);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      documentBigrams.set(key, (documentBigrams.get(key) ?? 0) + 1);
    }
    return { surface: local, counts };
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
      const recurring = [...chunkBigrams[i].counts.entries()]
        .filter(([key]) => (documentBigrams.get(key) ?? 0) >= 2)
        .filter(([key]) => !covered.includes(key.split(" ")[0]))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, concepts.length ? 1 : 2)
        .map(([key]) => titleCase(chunkBigrams[i].surface.get(key) ?? key));

      concepts.push(...recurring);
      return [chunk.ordinal, concepts];
    }),
  );
}

/**
 * Words that are perfectly good for retrieval but never name a concept. Kept
 * separate from STOPWORDS, which the embedder and BM25 also read — removing
 * "number" or "test" there would damage matching on "law of large numbers".
 */
const CONCEPT_STOPWORDS = new Set(
  `nothing else something anything everything thing things true false null given
   means makes make need needs take takes comes goes gives based way ways case
   cases point points kind sort part parts time times number numbers test tests
   result results value values term terms example examples note notes here there
   this that these those every each same different following above below less
   least most more many much often always never without within whether rather
   enough still even just only both either neither`
    .split(/\s+/)
    .filter(Boolean),
);

/** Adverbs and fillers make poor concept names; nouns and adjectives carry them. */
function isConceptWord(token: string): boolean {
  // Surface-form bigrams skip the retrieval tokenizer, so both lists apply here.
  if (STOPWORDS.has(token) || CONCEPT_STOPWORDS.has(token)) return false;
  // "approximately normal", "sufficiently large" — the adverb is never the topic.
  if (token.endsWith("ly") && token.length > 5) return false;
  return true;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word, i) => {
      // Acronyms and mixed-case terms keep their own casing: NP, BFS, McNemar.
      if (/[A-Z]/.test(word.slice(1))) return word;
      const lower = word.toLowerCase();
      if (i > 0 && STOPWORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
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
