import fs from "fs/promises";
import path from "path";
import type { Chunk, ConceptRecord, StoredDocument } from "./types";

/**
 * File-backed store. Everything lives in memory for query speed and is flushed
 * to .data/store.json so ingestion survives a dev-server restart.
 *
 * This is deliberately the smallest thing that works. The retrieval layer only
 * ever talks to it through the functions below, so swapping in Postgres +
 * pgvector means reimplementing this file and nothing else.
 */

interface Snapshot {
  documents: StoredDocument[];
  chunks: Chunk[];
  concepts: ConceptRecord[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const empty = (): Snapshot => ({ documents: [], chunks: [], concepts: [] });

// Survives Next.js dev hot-reloads, which otherwise re-evaluate this module.
const globalRef = globalThis as unknown as {
  __plickStore?: Snapshot;
  __plickLoad?: Promise<Snapshot>;
};

async function load(): Promise<Snapshot> {
  if (globalRef.__plickStore) return globalRef.__plickStore;
  if (!globalRef.__plickLoad) {
    globalRef.__plickLoad = (async () => {
      let snapshot = empty();
      try {
        const raw = await fs.readFile(DATA_FILE, "utf8");
        const parsed = JSON.parse(raw) as Partial<Snapshot>;
        snapshot = {
          documents: parsed.documents ?? [],
          chunks: parsed.chunks ?? [],
          concepts: parsed.concepts ?? [],
        };
      } catch {
        // No store yet — first run.
      }
      globalRef.__plickStore = snapshot;
      return snapshot;
    })();
  }
  return globalRef.__plickLoad;
}

let flushQueue: Promise<void> = Promise.resolve();

async function flush(): Promise<void> {
  // Serialise writes so two concurrent ingests can't interleave partial files.
  flushQueue = flushQueue.then(async () => {
    const snapshot = await load();
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(snapshot), "utf8");
  });
  return flushQueue;
}

export async function listDocuments(ownerId: string): Promise<StoredDocument[]> {
  const { documents } = await load();
  return documents
    .filter((d) => d.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDocument(
  ownerId: string,
  id: string,
): Promise<StoredDocument | undefined> {
  const { documents } = await load();
  return documents.find((d) => d.id === id && d.ownerId === ownerId);
}

export async function listChunks(ownerId: string): Promise<Chunk[]> {
  const snapshot = await load();
  const owned = new Set(
    snapshot.documents.filter((d) => d.ownerId === ownerId).map((d) => d.id),
  );
  return snapshot.chunks.filter((c) => owned.has(c.documentId));
}

export async function listConcepts(ownerId: string): Promise<ConceptRecord[]> {
  const { concepts } = await load();
  return concepts.filter((c) => c.ownerId === ownerId);
}

/**
 * Replaces any existing document with the same owner + externalId, so
 * re-syncing a connector updates in place instead of duplicating.
 */
export async function upsertDocument(
  document: StoredDocument,
  chunks: Chunk[],
): Promise<void> {
  const snapshot = await load();
  const previous = snapshot.documents.find(
    (d) => d.ownerId === document.ownerId && d.externalId === document.externalId,
  );
  if (previous) {
    snapshot.documents = snapshot.documents.filter((d) => d.id !== previous.id);
    snapshot.chunks = snapshot.chunks.filter((c) => c.documentId !== previous.id);
  }
  snapshot.documents.push(document);
  snapshot.chunks.push(...chunks);
  await flush();
}

export async function deleteDocument(ownerId: string, id: string): Promise<boolean> {
  const snapshot = await load();
  const target = snapshot.documents.find((d) => d.id === id && d.ownerId === ownerId);
  if (!target) return false;
  snapshot.documents = snapshot.documents.filter((d) => d.id !== id);
  snapshot.chunks = snapshot.chunks.filter((c) => c.documentId !== id);
  snapshot.concepts = snapshot.concepts
    .map((c) => ({
      ...c,
      documentIds: c.documentIds.filter((d) => d !== id),
      chunkIds: c.chunkIds.filter((chunkId) => !chunkId.startsWith(`${id}:`)),
    }))
    .filter((c) => c.documentIds.length > 0);
  await flush();
  return true;
}

/** Rebuilt after every ingest, since concepts are aggregated across documents. */
export async function replaceConcepts(
  ownerId: string,
  concepts: ConceptRecord[],
): Promise<void> {
  const snapshot = await load();
  snapshot.concepts = snapshot.concepts.filter((c) => c.ownerId !== ownerId);
  snapshot.concepts.push(...concepts);
  await flush();
}

export async function resetOwner(ownerId: string): Promise<void> {
  const snapshot = await load();
  const owned = new Set(
    snapshot.documents.filter((d) => d.ownerId === ownerId).map((d) => d.id),
  );
  snapshot.documents = snapshot.documents.filter((d) => d.ownerId !== ownerId);
  snapshot.chunks = snapshot.chunks.filter((c) => !owned.has(c.documentId));
  snapshot.concepts = snapshot.concepts.filter((c) => c.ownerId !== ownerId);
  await flush();
}
