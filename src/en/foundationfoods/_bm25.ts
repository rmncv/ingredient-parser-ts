/**
 * Port of `upstream/ingredient_parser/en/foundationfoods/_bm25.py`.
 *
 * ATIRE BM25 ranking. All arithmetic is Python `float` (float64 = JS `number`).
 * Insertion order of `t2d`/`scores` (Python dict/`defaultdict`) is preserved
 * with `Map`, so the stable descending sort reproduces upstream tie order.
 */

import { FDCIngredient, FDCIngredientMatch, IngredientToken } from "./_ff_dataclasses.js";
import { loadFdcIngredients } from "./_ff_utils.js";

/** ATIRE BM25 ranking function. Port of `BM25`. */
export class BM25 {
  k1: number;
  b: number;
  avgdl = 0;
  t2d: Map<string, Map<number, number>> = new Map();
  idf: Map<string, number> = new Map();
  docLen: number[] = [];
  corpus: FDCIngredient[] = [];

  constructor(fdcIngredients: FDCIngredient[], k1: number, b: number) {
    this.k1 = k1;
    this.b = b;
    this._initialize(fdcIngredients);
  }

  get corpusSize(): number {
    return this.docLen.length;
  }

  private _initialize(fdcIngredients: FDCIngredient[]): void {
    this.corpus = fdcIngredients;

    for (let i = 0; i < fdcIngredients.length; i++) {
      const ingredient = fdcIngredients[i]!;
      this.docLen.push(ingredient.tokens.length);
      for (const token of ingredient.tokens) {
        let m = this.t2d.get(token);
        if (m === undefined) {
          m = new Map();
          this.t2d.set(token, m);
        }
        m.set(i, (m.get(i) ?? 0) + 1);
      }
    }

    let sum = 0;
    for (const l of this.docLen) {
      sum += l;
    }
    this.avgdl = sum / this.docLen.length;

    for (const [token, ingredients] of this.t2d) {
      this.idf.set(token, Math.log(this.corpusSize / ingredients.size));
    }
  }

  rankMatches(tokens: IngredientToken[]): FDCIngredientMatch[] {
    const ingredientNouns = new Set<string>();
    for (const t of tokens) {
      if (t.posTag.startsWith("N")) {
        ingredientNouns.add(t.token);
      }
    }

    const scores = new Map<number, number>();
    for (const ingToken of tokens) {
      const postings = this.t2d.get(ingToken.token);
      if (postings !== undefined) {
        const idf = this.idf.get(ingToken.token)!;
        for (const [index, freq] of postings) {
          const denomConstant = this.k1 * (1 - this.b + (this.b * this.docLen[index]!) / this.avgdl);
          const inc = (idf * freq * (this.k1 + 1)) / (denomConstant + freq);
          scores.set(index, (scores.get(index) ?? 0) + inc);
        }
      }
    }

    // Stable descending sort by score (Map preserves insertion order for ties).
    const entries = [...scores.entries()];
    entries.sort((a, b) => b[1] - a[1]);

    const matches: FDCIngredientMatch[] = [];
    for (const [index] of entries) {
      const fdc = this.corpus[index]!;
      let shares = false;
      for (const tok of fdc.tokens) {
        if (ingredientNouns.has(tok)) {
          shares = true;
          break;
        }
      }
      if (!shares) {
        continue;
      }
      matches.push(new FDCIngredientMatch(fdc, scores.get(index)!));
    }

    return matches;
  }
}

let bm25Ranker: BM25 | undefined;

/** Cached BM25 ranker. Port of `get_bm25_ranker`. */
export function getBm25Ranker(): BM25 {
  if (bm25Ranker === undefined) {
    bm25Ranker = new BM25(loadFdcIngredients(), 1.5, 0.75);
  }
  return bm25Ranker;
}
