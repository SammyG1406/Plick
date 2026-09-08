export type SourceKind = "upload" | "notion" | "gdocs";

/** A document as it arrives from an upload or a connector, before ingestion. */
export interface RawDocument {
  externalId: string;
  title: string;
  text: string;
  kind: SourceKind;
  /** Original URL for connector-backed docs, or the filename for uploads. */
  origin?: string;
  updatedAt?: string;
}

/** A reference returned by a connector's listDocuments(), before content is pulled. */
export interface DocumentRef {
  externalId: string;
  title: string;
  origin?: string;
  updatedAt?: string;
}

/** Where a chunk sits in the course structure. */
export interface WeekTag {
  /** Normalised ordinal used for sorting and grouping. null = unplaced. */
  number: number | null;
  /** What the source actually called it: "Week 3", "Lecture 7", "Topic 2". */
  label: string;
  /** How the tag was derived, surfaced in the UI so users can trust or correct it. */
  confidence: "explicit" | "inherited" | "inferred";
}

export interface Chunk {
  id: string;
  documentId: string;
  ordinal: number;
  text: string;
  /** Heading trail above this chunk, e.g. ["Week 3", "Bayes' Rule"]. */
  headings: string[];
  week: WeekTag;
  concepts: string[];
  embedding: number[];
  tokensApprox: number;
}

export interface StoredDocument {
  id: string;
  ownerId: string;
  title: string;
  kind: SourceKind;
  origin?: string;
  externalId: string;
  createdAt: string;
  updatedAt?: string;
  charCount: number;
  chunkCount: number;
  /** Distinct weeks and concepts across the document's chunks, for the library view. */
  weeks: WeekTag[];
  concepts: string[];
  /** Set when Claude enrichment ran; false means heuristics only. */
  llmEnriched: boolean;
}

/** A concept promoted to a first-class, searchable entity with its own embedding. */
export interface ConceptRecord {
  id: string;
  ownerId: string;
  name: string;
  /** One-line gloss, used as the embedding text so concepts match semantically. */
  description: string;
  embedding: number[];
  chunkIds: string[];
  documentIds: string[];
  weekNumbers: number[];
}

export interface RetrievalFilters {
  weekNumbers?: number[];
  concepts?: string[];
  documentIds?: string[];
  kinds?: SourceKind[];
}

export interface RetrievedChunk {
  chunk: Chunk;
  document: Pick<StoredDocument, "id" | "title" | "kind" | "origin">;
  /** Final fused score. */
  score: number;
  /** Component scores, exposed so the UI can explain *why* something matched. */
  breakdown: {
    dense: number;
    lexical: number;
    concept: number;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export type StudyMode = "summary" | "flashcards" | "quiz";

export interface Flashcard {
  front: string;
  back: string;
  concept: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  concept: string;
}

export interface StudyResult {
  mode: StudyMode;
  scope: string;
  summary?: string;
  keyPoints?: string[];
  flashcards?: Flashcard[];
  quiz?: QuizQuestion[];
  sources: { chunkId: string; documentTitle: string; snippet: string }[];
  generatedBy: "claude" | "extractive";
}
