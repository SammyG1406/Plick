export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  /** True when vectors come from a trained model rather than the local fallback. */
  readonly semantic: boolean;
  /**
   * `kind` lets providers that distinguish query vs. document encodings (Voyage,
   * most modern retrieval models) do the right thing. Providers that don't care
   * ignore it.
   */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  // All providers return L2-normalised vectors, so the dot product is cosine.
  return dot;
}

export function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}
