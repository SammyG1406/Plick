import { localProvider } from "./local";
import { openAIProvider, voyageProvider } from "./remote";
import type { EmbeddingProvider } from "./types";

export { cosine, normalise } from "./types";
export type { EmbeddingProvider } from "./types";

let cached: EmbeddingProvider | undefined;

/**
 * Resolves the active provider from EMBEDDING_PROVIDER. Falls back to `local`
 * rather than throwing, so a missing key degrades retrieval quality instead of
 * breaking ingestion.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;

  const requested = (process.env.EMBEDDING_PROVIDER ?? "local").toLowerCase();

  if (requested === "voyage") {
    const key = process.env.VOYAGE_API_KEY;
    if (key) {
      cached = voyageProvider(key);
      return cached;
    }
    console.warn("EMBEDDING_PROVIDER=voyage but VOYAGE_API_KEY is unset — using local.");
  }

  if (requested === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      cached = openAIProvider(key);
      return cached;
    }
    console.warn("EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is unset — using local.");
  }

  cached = localProvider;
  return cached;
}
