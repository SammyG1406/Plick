import { Bm25Index } from "./bm25";
import { cosine, getEmbeddingProvider } from "./embeddings";
import { minMax } from "./text";
import { findMarkers } from "./weeks";
import { listChunks, listConcepts, listDocuments } from "../store";
import type { Chunk, RetrievalFilters, RetrievedChunk } from "../types";

/**
 * Hybrid retrieval over three channels, because each one fails differently:
 *
 *  - dense    catches paraphrase ("how do we stop overfitting" → regularisation)
 *  - lexical  catches exact terms dense embeddings blur (BM25 on symbols, names)
 *  - concept  catches material whose *topic* matches even when the wording doesn't,
 *             by scoring the query against concept vectors rather than chunk text
 *
 * Scores are min-max normalised per channel before fusing, since BM25 is
 * unbounded while cosine sits in [-1, 1].
 */

export interface QueryIntent {
  /** Week numbers named in the query itself, e.g. "revise week 3 and 4". */
  weekNumbers: number[];
  /** The query with week phrases stripped, used for embedding and BM25. */
  cleaned: string;
}

export function parseQueryIntent(query: string): QueryIntent {
  const markers = findMarkers(query);
  const weekNumbers = [...new Set(markers.map((m) => m.number))];
  const cleaned = query
    .replace(
      /\b(?:week|wk|lecture|lec|topic|module|unit|session|tutorial|lab|chapter)\s*[-–—:.]?\s*\d{1,2}\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  // Never hand an empty string to the embedder — fall back to the original.
  return { weekNumbers, cleaned: cleaned.length >= 3 ? cleaned : query };
}

/** Human-readable form of whichever week filter actually applied. */
function describeWeekFilter(filters: RetrievalFilters): string[] {
  if (filters.weeks?.length) return filters.weeks;
  return (filters.weekNumbers ?? []).map((n) => `unit ${n}`);
}

function passesFilters(chunk: Chunk, filters: RetrievalFilters): boolean {
  // Exact label wins when the UI supplied one; the numeric form is the looser
  // fallback used for units named in free text.
  if (filters.weeks?.length) {
    if (!filters.weeks.includes(chunk.week.label)) return false;
  } else if (filters.weekNumbers?.length) {
    if (chunk.week.number === null || !filters.weekNumbers.includes(chunk.week.number)) {
      return false;
    }
  }
  if (filters.documentIds?.length && !filters.documentIds.includes(chunk.documentId)) {
    return false;
  }
  if (filters.concepts?.length) {
    const wanted = filters.concepts.map((c) => c.toLowerCase());
    const has = chunk.concepts.some((c) => wanted.includes(c.toLowerCase()));
    if (!has) return false;
  }
  return true;
}

export interface RetrievalResult {
  results: RetrievedChunk[];
  /** Units the query itself named, so the UI can show the filter it applied. */
  appliedWeeks: string[];
  /** Concepts whose vectors matched the query, regardless of chunk text. */
  matchedConcepts: string[];
  provider: { id: string; model: string; semantic: boolean };
  /** Set when the index was built by a different provider than the active one. */
  staleIndex: boolean;
}

export async function retrieve(
  ownerId: string,
  query: string,
  filters: RetrievalFilters = {},
  topK = 8,
): Promise<RetrievalResult> {
  const provider = getEmbeddingProvider();
  const providerMeta = {
    id: provider.id,
    model: provider.model,
    semantic: provider.semantic,
  };

  const [allChunks, documents, concepts] = await Promise.all([
    listChunks(ownerId),
    listDocuments(ownerId),
    listConcepts(ownerId),
  ]);

  const intent = parseQueryIntent(query);
  const effectiveFilters: RetrievalFilters = {
    ...filters,
    // A unit named in the query only applies when the UI hasn't already pinned one.
    weekNumbers:
      filters.weeks?.length || filters.weekNumbers?.length
        ? filters.weekNumbers
        : intent.weekNumbers.length
          ? intent.weekNumbers
          : undefined,
  };

  const byId = new Map(documents.map((d) => [d.id, d]));
  const candidates = allChunks.filter((chunk) => {
    const document = byId.get(chunk.documentId);
    if (!document) return false;
    if (effectiveFilters.kinds?.length && !effectiveFilters.kinds.includes(document.kind)) {
      return false;
    }
    return passesFilters(chunk, effectiveFilters);
  });

  if (candidates.length === 0) {
    return {
      results: [],
      appliedWeeks: describeWeekFilter(effectiveFilters),
      matchedConcepts: [],
      provider: providerMeta,
      staleIndex: false,
    };
  }

  const [queryVector] = await provider.embed([intent.cleaned], "query");

  // A dimension mismatch means the corpus was indexed under a different
  // provider. Rather than silently comparing incompatible vectors, drop the
  // dense channel and tell the caller to re-index.
  const staleIndex = candidates.some((c) => c.embedding.length !== queryVector.length);

  const dense = candidates.map((chunk) =>
    staleIndex || chunk.embedding.length !== queryVector.length
      ? 0
      : cosine(queryVector, chunk.embedding),
  );

  const lexical = new Bm25Index(
    candidates.map((c) => `${c.headings.join(" ")} ${c.concepts.join(" ")} ${c.text}`),
  ).score(intent.cleaned);

  // Concept channel: score the query against concept vectors once, then give
  // each chunk the best score among the concepts it carries.
  const conceptScores = new Map<string, number>();
  const matchedConcepts: string[] = [];
  if (!staleIndex) {
    const scored = concepts
      .filter((c) => c.embedding.length === queryVector.length)
      .map((c) => ({ name: c.name, score: cosine(queryVector, c.embedding) }))
      .sort((a, b) => b.score - a.score);
    for (const { name, score } of scored) conceptScores.set(name.toLowerCase(), score);
    matchedConcepts.push(...scored.filter((s) => s.score > 0.25).slice(0, 6).map((s) => s.name));
  }
  const concept = candidates.map((chunk) =>
    chunk.concepts.reduce(
      (best, name) => Math.max(best, conceptScores.get(name.toLowerCase()) ?? 0),
      0,
    ),
  );

  const nDense = minMax(dense);
  const nLexical = minMax(lexical);
  const nConcept = minMax(concept);

  // Without a trained embedder the dense channel is weak, so lean on BM25.
  const weights = provider.semantic
    ? { dense: 0.5, lexical: 0.35, concept: 0.15 }
    : { dense: 0.35, lexical: 0.5, concept: 0.15 };

  const scored = candidates.map((chunk, i) => {
    const document = byId.get(chunk.documentId)!;
    return {
      chunk,
      document: {
        id: document.id,
        title: document.title,
        kind: document.kind,
        origin: document.origin,
      },
      score:
        weights.dense * nDense[i] +
        weights.lexical * nLexical[i] +
        weights.concept * nConcept[i],
      breakdown: { dense: dense[i], lexical: lexical[i], concept: concept[i] },
    } satisfies RetrievedChunk;
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversity pass: one exhaustive document shouldn't crowd out every other
  // source, so each additional hit from the same document is progressively
  // discounted before the final cut.
  const seen = new Map<string, number>();
  const diversified = scored
    .map((item) => {
      const count = seen.get(item.chunk.documentId) ?? 0;
      seen.set(item.chunk.documentId, count + 1);
      return { ...item, score: item.score * (count === 0 ? 1 : 1 / (1 + 0.35 * count)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    results: diversified,
    appliedWeeks: describeWeekFilter(effectiveFilters),
    matchedConcepts,
    provider: providerMeta,
    staleIndex,
  };
}
