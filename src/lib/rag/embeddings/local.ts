import { rawWords, tokenise } from "../text";
import { normalise, type EmbeddingProvider } from "./types";

const DIMENSIONS = 512;

/**
 * Zero-dependency, zero-key embedder so the app is useful the moment it starts.
 *
 * It is a hashed feature vector, not a trained model: unigrams, bigrams and
 * character 4-grams are hashed into a fixed space with signed buckets. That
 * captures morphology and word order well enough that "gradient descent
 * convergence" lands near "how does gradient descent converge", but it cannot
 * connect "car" to "automobile" the way a trained model does.
 *
 * The retriever compensates by fusing this with BM25 and concept matching. Set
 * EMBEDDING_PROVIDER=voyage for genuinely semantic vectors.
 */
function hash(token: string, salt: number): number {
  // FNV-1a, salted so each feature family occupies its own bucket pattern.
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function add(vector: Float64Array, token: string, salt: number, weight: number): void {
  const h = hash(token, salt);
  const index = h % DIMENSIONS;
  // Signed hashing: the top bit picks the sign, which keeps collisions from
  // systematically inflating similarity.
  const sign = (h >>> 31) & 1 ? -1 : 1;
  vector[index] += sign * weight;
}

function embedOne(text: string): number[] {
  const vector = new Float64Array(DIMENSIONS);
  // Same tokenizer as BM25, so both channels agree on what a term is.
  const content = tokenise(text);
  const words = rawWords(text);

  for (const word of content) {
    add(vector, word, 1, 1);
    // Character 4-grams give partial credit for shared word stems
    // ("optimise"/"optimisation") that exact-token matching would miss.
    const padded = `^${word}$`;
    for (let i = 0; i + 4 <= padded.length; i++) {
      add(vector, padded.slice(i, i + 4), 2, 0.35);
    }
  }

  // Bigrams over the *unfiltered* stream so "law of large numbers" survives.
  for (let i = 0; i + 1 < words.length; i++) {
    add(vector, `${words[i]}~${words[i + 1]}`, 3, 0.6);
  }

  // Sublinear scaling: a term repeated 20 times shouldn't dominate the vector.
  const scaled = Array.from(vector, (v) =>
    v === 0 ? 0 : Math.sign(v) * Math.log1p(Math.abs(v)),
  );
  return normalise(scaled);
}

export const localProvider: EmbeddingProvider = {
  id: "local",
  model: "hashed-ngram-512",
  dimensions: DIMENSIONS,
  semantic: false,
  async embed(texts) {
    return texts.map(embedOne);
  },
};
