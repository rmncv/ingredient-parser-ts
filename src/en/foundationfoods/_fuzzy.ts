/**
 * Port of `upstream/ingredient_parser/en/foundationfoods/_fuzzy.py`.
 *
 * Fuzzy document-distance matcher. Pairwise token distances and sigmoid
 * similarities are numpy `float32` (computed through the `Math.fround`-faithful
 * helpers); the fuzzy-set membership sums that follow are accumulated as
 * `number` (float64).
 */

import { GloVeModel, f32, pairwiseSumF32 } from "../_embeddings.js";
import { loadEmbeddingsModel } from "../_loaders.js";
import { FDCIngredient, FDCIngredientMatch, IngredientToken } from "./_ff_dataclasses.js";
import { loadFdcIngredients } from "./_ff_utils.js";

interface FDCIngredientEmbedding {
  fdc: FDCIngredient;
  vectors: Float32Array[];
}

/** Fuzzy embedding document-distance matcher. Port of `FuzzyEmbeddingMatcher`. */
export class FuzzyEmbeddingMatcher {
  embeddings: GloVeModel;
  fdcVectorCache: Map<number, FDCIngredientEmbedding> = new Map();

  constructor(embeddings: GloVeModel, fdcIngredients: FDCIngredient[]) {
    this.embeddings = embeddings;
    for (const fdc of fdcIngredients) {
      this.fdcVectorCache.set(fdc.fdcId, {
        fdc,
        vectors: fdc.embeddingTokens.map((t) => this.embeddings.getitem(t)),
      });
    }
  }

  private _fuzzyDocumentDistance(
    ingredientTokens: string[],
    fdcTokens: string[],
    ingredientVectors: Float32Array[],
    fdcVectors: Float32Array[],
  ): number {
    const I = ingredientVectors.length;
    const F = fdcVectors.length;
    const dim = I > 0 ? ingredientVectors[0]!.length : 0;

    // similarities[i][f], computed in float32.
    const similarities: Float32Array[] = [];
    for (let i = 0; i < I; i++) {
      const row = new Float32Array(F);
      const iv = ingredientVectors[i]!;
      for (let ff = 0; ff < F; ff++) {
        const fv = fdcVectors[ff]!;
        const dist = f32(
          Math.sqrt(
            pairwiseSumF32((d) => {
              const diff = f32(iv[d]! - fv[d]!);
              return f32(diff * diff);
            }, 0, dim),
          ),
        );
        if (dist === 0) {
          row[ff] = 1.0;
        } else {
          const inner = f32(f32(1) + f32(Math.exp(f32(-1 / dist))));
          row[ff] = f32(1 / inner);
        }
      }
      similarities.push(row);
    }

    let unionMembership = 0.0;
    let ingredMembership = 0.0;
    let fdcMembership = 0.0;

    // token_union = set(ingredient_tokens) | set(fdc_tokens), preserving a
    // deterministic order (ingredient tokens first, then new fdc tokens).
    const seen = new Set<string>();
    const tokenUnion: string[] = [];
    for (const t of ingredientTokens) {
      if (!seen.has(t)) {
        seen.add(t);
        tokenUnion.push(t);
      }
    }
    for (const t of fdcTokens) {
      if (!seen.has(t)) {
        seen.add(t);
        tokenUnion.push(t);
      }
    }

    for (const token of tokenUnion) {
      let tokenIngredScore = 0.0;
      let tokenFdcScore = 0.0;
      const inIngred = ingredientTokens.includes(token);
      const inFdc = fdcTokens.includes(token);
      if (inIngred && inFdc) {
        tokenIngredScore = 1.0;
        tokenFdcScore = 1.0;
      } else if (inIngred && !inFdc) {
        tokenIngredScore = 1.0;
        const ingredIdx = ingredientTokens.indexOf(token);
        let best = -Infinity;
        for (let ff = 0; ff < F; ff++) {
          if (similarities[ingredIdx]![ff]! > best) {
            best = similarities[ingredIdx]![ff]!;
          }
        }
        tokenFdcScore = best;
      } else if (!inIngred && inFdc) {
        tokenFdcScore = 1.0;
        const fdcIdx = fdcTokens.indexOf(token);
        let best = -Infinity;
        for (let i = 0; i < I; i++) {
          if (similarities[i]![fdcIdx]! > best) {
            best = similarities[i]![fdcIdx]!;
          }
        }
        tokenIngredScore = best;
      }

      unionMembership += tokenIngredScore * tokenFdcScore;
      ingredMembership += tokenIngredScore;
      fdcMembership += tokenFdcScore;
    }

    let res: number;
    if (ingredMembership + fdcMembership - unionMembership > 0) {
      res = unionMembership / (ingredMembership + fdcMembership - unionMembership);
    } else {
      res = 0;
    }

    return 1 - res;
  }

  rankMatches(tokens: IngredientToken[], fdcIds: Iterable<number> | null): FDCIngredientMatch[] {
    const ids = fdcIds === null ? [...this.fdcVectorCache.keys()] : [...fdcIds];
    const tokenVectors = tokens.map((t) => this.embeddings.getitem(t.token));
    const tokenStrings = tokens.map((t) => t.token);

    const scored: FDCIngredientMatch[] = [];
    for (const fdcId of ids) {
      const fdcEmbedding = this.fdcVectorCache.get(fdcId)!;
      const score = this._fuzzyDocumentDistance(
        tokenStrings,
        fdcEmbedding.fdc.embeddingTokens,
        tokenVectors,
        fdcEmbedding.vectors,
      );
      scored.push(new FDCIngredientMatch(fdcEmbedding.fdc, score));
    }

    scored.sort((a, b) => a.score - b.score);
    return scored;
  }
}

let fuzzyRanker: FuzzyEmbeddingMatcher | undefined;

/** Cached fuzzy ranker. Port of `get_fuzzy_ranker`. */
export function getFuzzyRanker(): FuzzyEmbeddingMatcher {
  if (fuzzyRanker === undefined) {
    fuzzyRanker = new FuzzyEmbeddingMatcher(loadEmbeddingsModel(), loadFdcIngredients());
  }
  return fuzzyRanker;
}
