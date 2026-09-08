import { createHash, randomUUID } from "crypto";
import { chunkDocument } from "./chunk";
import { getEmbeddingProvider } from "./embeddings";
import { enrichChunks } from "./enrich";
import { approxTokens } from "./text";
import { compareWeeks } from "./weeks";
import {
  listChunks,
  listConcepts,
  listDocuments,
  replaceConcepts,
  upsertDocument,
} from "../store";
import type { Chunk, ConceptRecord, RawDocument, StoredDocument } from "../types";

export interface IngestReport {
  document: StoredDocument;
  chunks: number;
  weeks: string[];
  concepts: string[];
  llmEnriched: boolean;
  note?: string;
}

export async function ingestDocument(
  ownerId: string,
  raw: RawDocument,
): Promise<IngestReport> {
  const text = raw.text.replace(/\r\n/g, "\n").trim();
  if (text.length < 40) {
    throw new Error(`"${raw.title}" has no extractable text.`);
  }

  const drafts = chunkDocument(text, raw.title);
  const enrichment = await enrichChunks(drafts, raw.title);

  const provider = getEmbeddingProvider();
  // Embed the heading trail and concepts alongside the body so a chunk stays
  // findable by its section title even when the body never repeats it.
  const embeddings = await provider.embed(
    enrichment.chunks.map((c) =>
      [c.headings.join(" › "), c.concepts.join(", "), c.text].filter(Boolean).join("\n"),
    ),
    "document",
  );

  const documentId = createHash("sha1")
    .update(`${ownerId}:${raw.kind}:${raw.externalId}`)
    .digest("hex")
    .slice(0, 16);

  const chunks: Chunk[] = enrichment.chunks.map((chunk, i) => ({
    id: `${documentId}:${chunk.ordinal}`,
    documentId,
    ordinal: chunk.ordinal,
    text: chunk.text,
    headings: chunk.headings,
    week: chunk.week,
    concepts: chunk.concepts,
    embedding: embeddings[i],
    tokensApprox: approxTokens(chunk.text),
  }));

  const document: StoredDocument = {
    id: documentId,
    ownerId,
    title: raw.title,
    kind: raw.kind,
    origin: raw.origin,
    externalId: raw.externalId,
    createdAt: new Date().toISOString(),
    updatedAt: raw.updatedAt,
    charCount: text.length,
    chunkCount: chunks.length,
    weeks: enrichment.weeks,
    concepts: enrichment.concepts,
    llmEnriched: enrichment.llmEnriched,
  };

  await upsertDocument(document, chunks);
  await rebuildConceptIndex(ownerId);

  return {
    document,
    chunks: chunks.length,
    weeks: enrichment.weeks.map((w) => w.label),
    concepts: enrichment.concepts,
    llmEnriched: enrichment.llmEnriched,
    note: enrichment.note,
  };
}

/**
 * Concepts are corpus-level, not document-level: "Bayes' theorem" taught in one
 * unit and revisited in another should be a single browsable entity pointing at
 * both. Rebuilt after each ingest because merging changes as documents arrive.
 */
export async function rebuildConceptIndex(ownerId: string): Promise<ConceptRecord[]> {
  const [chunks, documents] = await Promise.all([
    listChunks(ownerId),
    listDocuments(ownerId),
  ]);
  const titles = new Map(documents.map((d) => [d.id, d.title]));

  interface Accumulator {
    name: string;
    chunkIds: string[];
    documentIds: Set<string>;
    weekLabels: Set<string>;
    contexts: string[];
  }

  const merged = new Map<string, Accumulator>();
  for (const chunk of chunks) {
    for (const concept of chunk.concepts) {
      const key = normaliseConcept(concept);
      if (!key) continue;
      const entry = merged.get(key) ?? {
        name: concept,
        chunkIds: [],
        documentIds: new Set<string>(),
        weekLabels: new Set<string>(),
        contexts: [],
      };
      entry.chunkIds.push(chunk.id);
      entry.documentIds.add(chunk.documentId);
      entry.weekLabels.add(chunk.week.label);
      if (entry.contexts.length < 3) {
        entry.contexts.push(`${titles.get(chunk.documentId) ?? ""}: ${chunk.headings.at(-1) ?? ""}`);
      }
      merged.set(key, entry);
    }
  }

  const entries = [...merged.values()];
  if (entries.length === 0) {
    await replaceConcepts(ownerId, []);
    return [];
  }

  const provider = getEmbeddingProvider();
  // The concept vector describes the concept *in this corpus*, so it carries the
  // sections it appears in — that is what makes topic-level matching work.
  const descriptions = entries.map((e) =>
    `${e.name}. Appears in: ${[...new Set(e.contexts)].join("; ")}`.trim(),
  );
  const vectors = await provider.embed(descriptions, "document");

  const records: ConceptRecord[] = entries.map((entry, i) => ({
    id: randomUUID(),
    ownerId,
    name: entry.name,
    description: descriptions[i],
    embedding: vectors[i],
    chunkIds: entry.chunkIds,
    documentIds: [...entry.documentIds],
    weekLabels: [...entry.weekLabels].sort(),
  }));

  await replaceConcepts(ownerId, records);
  return records;
}

/** Collapses casing, punctuation and trivial plurals so near-duplicates merge. */
function normaliseConcept(concept: string): string {
  return concept
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\w)s$/, "$1");
}

/** The week axis for the whole corpus, used by the browser's left rail. */
export async function buildTaxonomy(ownerId: string) {
  const [chunks, documents, concepts] = await Promise.all([
    listChunks(ownerId),
    listDocuments(ownerId),
    listConcepts(ownerId),
  ]);

  const weekMap = new Map<
    string,
    { label: string; number: number | null; chunkCount: number; documentIds: Set<string>; concepts: Set<string> }
  >();

  // The concept index has already merged spelling variants ("Bellman-Ford" and
  // "Bellman Ford"), so the week facet must show those canonical names too —
  // otherwise the same concept appears twice under one unit.
  const canonical = new Map<string, string>();
  for (const record of concepts) canonical.set(normaliseConcept(record.name), record.name);

  for (const chunk of chunks) {
    // Keyed by label, not number: "Week 3" and "Lecture 3" come from different
    // subjects and must not collapse into one facet.
    const key = chunk.week.label;
    const entry = weekMap.get(key) ?? {
      label: chunk.week.label,
      number: chunk.week.number,
      chunkCount: 0,
      documentIds: new Set<string>(),
      concepts: new Set<string>(),
    };
    entry.chunkCount += 1;
    entry.documentIds.add(chunk.documentId);
    for (const c of chunk.concepts) {
      entry.concepts.add(canonical.get(normaliseConcept(c)) ?? c);
    }
    weekMap.set(key, entry);
  }

  const weeks = [...weekMap.values()]
    .sort((a, b) => {
      // Group schemes together ("Week 1..6", then "Lecture 1..8"), each ordered
      // by number, with unplaced material last.
      const schemeA = a.label.split(" ")[0];
      const schemeB = b.label.split(" ")[0];
      if (schemeA !== schemeB) {
        if (a.number === null) return 1;
        if (b.number === null) return -1;
        return schemeA.localeCompare(schemeB);
      }
      return compareWeeks(
        { ...a, confidence: "explicit" },
        { ...b, confidence: "explicit" },
      );
    })
    .map((w) => ({
      label: w.label,
      number: w.number,
      chunkCount: w.chunkCount,
      documentCount: w.documentIds.size,
      concepts: [...w.concepts].sort((a, b) => a.localeCompare(b)),
    }));

  return {
    weeks,
    concepts: concepts
      .map((c) => ({
        name: c.name,
        chunkCount: c.chunkIds.length,
        documentCount: c.documentIds.length,
        weekLabels: c.weekLabels,
      }))
      .sort((a, b) => b.chunkCount - a.chunkCount || a.name.localeCompare(b.name)),
    documentCount: documents.length,
    chunkCount: chunks.length,
  };
}
