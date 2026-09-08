import { tokenise } from "./text";

const K1 = 1.5;
const B = 0.75;

/**
 * BM25 over the candidate set. Built per query rather than persisted — at a few
 * thousand chunks this costs single-digit milliseconds, and it keeps the store
 * free of index state that could drift out of sync with the documents.
 */
export class Bm25Index {
  private readonly postings = new Map<string, Map<number, number>>();
  private readonly lengths: number[] = [];
  private readonly avgLength: number;

  constructor(documents: string[]) {
    let total = 0;
    documents.forEach((text, docIndex) => {
      const terms = tokenise(text);
      this.lengths[docIndex] = terms.length;
      total += terms.length;
      for (const term of terms) {
        let posting = this.postings.get(term);
        if (!posting) {
          posting = new Map();
          this.postings.set(term, posting);
        }
        posting.set(docIndex, (posting.get(docIndex) ?? 0) + 1);
      }
    });
    this.avgLength = documents.length ? total / documents.length : 1;
  }

  score(query: string): number[] {
    const scores = new Array<number>(this.lengths.length).fill(0);
    const total = this.lengths.length;
    if (total === 0) return scores;

    // Deduplicate query terms; repeating a word shouldn't multiply its weight.
    for (const term of new Set(tokenise(query))) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const df = posting.size;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      for (const [docIndex, tf] of posting) {
        const norm = 1 - B + (B * this.lengths[docIndex]) / this.avgLength;
        scores[docIndex] += idf * ((tf * (K1 + 1)) / (tf + K1 * norm));
      }
    }
    return scores;
  }
}
