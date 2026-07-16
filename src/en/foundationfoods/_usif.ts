/**
 * Port of `upstream/ingredient_parser/en/foundationfoods/_usif.py`.
 *
 * Modified uSIF sentence-embedding weighting. Token weights, probabilities and
 * the "a" factor are Python `float` (float64 = JS `number`). All embedding
 * vector arithmetic is numpy `float32`, so it is done through the
 * `Math.fround`-faithful helpers in `_embeddings.ts` (`pairwiseSumF32`, `f32`,
 * `dotF32`, `normF32`).
 */

import { GloVeModel, dotF32, f32, normF32, pairwiseSumF32 } from "../_embeddings.js";
import { loadEmbeddingsModel } from "../_loaders.js";
import { FDCIngredient, FDCIngredientMatch, IngredientToken } from "./_ff_dataclasses.js";
import { loadFdcIngredients } from "./_ff_utils.js";

/** Embedding vector and its (float32) norm. Port of `Embedding`. */
interface Embedding {
  vec: Float32Array;
  norm: number;
}

/** Modified uSIF sentence-embedding ranker. Port of `uSIF`. */
export class USIF {
  embeddings: GloVeModel;
  embeddingsDimension: number;
  fdcIngredients: FDCIngredient[];
  tokenProb: Map<string, number>;
  minProb: number;
  a: number;
  fdcVectors: Embedding[];

  constructor(embeddings: GloVeModel, fdcIngredients: FDCIngredient[]) {
    this.embeddings = embeddings;
    this.embeddingsDimension = embeddings.dimension;
    this.fdcIngredients = fdcIngredients;
    this.tokenProb = this._estimateTokenProbability(fdcIngredients);
    this.minProb = Math.min(...this.tokenProb.values());
    this.a = this._calculateAFactor();
    this.fdcVectors = this._embedFdcIngredients();
  }

  private _estimateTokenProbability(fdcIngredients: FDCIngredient[]): Map<string, number> {
    const tokenCounts = new Map<string, number>();
    for (const ingredient of fdcIngredients) {
      for (const token of ingredient.embeddingTokens) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }
    let total = 0;
    for (const c of tokenCounts.values()) {
      total += c;
    }
    const probs = new Map<string, number>();
    for (const [token, count] of tokenCounts) {
      probs.set(token, count / total);
    }
    return probs;
  }

  private _averageSentenceLength(): number {
    let tokenCount = 0;
    let sentenceCount = 0;
    for (const fdc of this.fdcIngredients) {
      tokenCount += fdc.embeddingTokens.length;
      sentenceCount += 1;
    }
    return Math.trunc(tokenCount / sentenceCount);
  }

  private _calculateAFactor(): number {
    const averageSentenceLength = this._averageSentenceLength();
    const vocabSize = this.tokenProb.size;
    const threshold = 1 - Math.pow(1 - 1 / vocabSize, averageSentenceLength);
    let count = 0;
    for (const prob of this.tokenProb.values()) {
      if (prob > threshold) {
        count += 1;
      }
    }
    const alpha = count / vocabSize;
    const Z = 0.5 * vocabSize;
    return (1 - alpha) / (alpha * Z);
  }

  private _weight(token: string, posTag: string): number {
    const weight = this.a / (0.5 * this.a + (this.tokenProb.get(token) ?? this.minProb));
    if (posTag.startsWith("NN")) {
      return 1.2 * weight;
    } else if (posTag.startsWith("JJ")) {
      return 1.05 * weight;
    } else if (posTag.startsWith("VB")) {
      return 0.7 * weight;
    } else {
      return weight;
    }
  }

  private _embedFdcIngredients(): Embedding[] {
    const embedded: Embedding[] = [];
    for (const fdc of this.fdcIngredients) {
      const vec = this._embed(fdc.embeddingTokens, fdc.embeddingPosTags, fdc.embeddingWeights);
      embedded.push({ vec, norm: normF32(vec, vec.length) });
    }
    return embedded;
  }

  _embed(tokens: string[], posTags: string[], phraseWeight: number[]): Float32Array {
    // zip(tokens, posTags, phraseWeight) truncates to the shortest (Python zip).
    const n = Math.min(tokens.length, posTags.length, phraseWeight.length);
    const inVocab: [string, string, number][] = [];
    for (let i = 0; i < n; i++) {
      if (this.embeddings.has(tokens[i]!)) {
        inVocab.push([tokens[i]!, posTags[i]!, phraseWeight[i]!]);
      }
    }

    const dim = this.embeddingsDimension;
    if (inVocab.length === 0) {
      // np.zeros(dim) + a (float64). Dead in practice for this pipeline.
      const out = new Float32Array(dim);
      out.fill(f32(this.a));
      return out;
    }

    const m = inVocab.length;
    // token_vectors: (m, dim) float32
    const tokenVectors: Float32Array[] = inVocab.map(([token]) => this.embeddings.getitem(token));

    // normalised = token_vectors * (1.0 / norm(token_vectors, axis=0))
    // norm over axis 0 (rows) per column j.
    const invNorm = new Float32Array(dim);
    for (let j = 0; j < dim; j++) {
      const normJ = f32(Math.sqrt(pairwiseSumF32((i) => f32(tokenVectors[i]![j]! * tokenVectors[i]![j]!), 0, m)));
      invNorm[j] = f32(1.0 / normJ);
    }

    // weighted[i][j] = f32(coef_i * f32(tv[i][j] * invNorm[j]))
    const weighted: Float32Array[] = [];
    for (let i = 0; i < m; i++) {
      const [token, posTag, w] = inVocab[i]!;
      const coef = w * this._weight(token, posTag); // float64
      const row = new Float32Array(dim);
      const tv = tokenVectors[i]!;
      for (let j = 0; j < dim; j++) {
        const normalised = f32(tv[j]! * invNorm[j]!);
        row[j] = f32(coef * normalised);
      }
      weighted.push(row);
    }

    // mean(weighted, axis=0): f32(pairwise_sum_i(weighted[i][j]) / m)
    const out = new Float32Array(dim);
    for (let j = 0; j < dim; j++) {
      const s = pairwiseSumF32((i) => weighted[i]![j]!, 0, m);
      out[j] = f32(s / m);
    }
    return out;
  }

  private _cosineSimilarity(vec1: Embedding, vec2: Embedding): number {
    const dot = dotF32(vec1.vec, vec2.vec, vec1.vec.length);
    const ratio = f32(dot / f32(vec1.norm * vec2.norm));
    return 1 - ratio;
  }

  rankMatches(tokens: IngredientToken[]): FDCIngredientMatch[] {
    const vec = this._embed(
      tokens.map((t) => t.token),
      tokens.map((t) => t.posTag),
      new Array(tokens.length).fill(1),
    );
    const inputTokenVector: Embedding = { vec, norm: normF32(vec, vec.length) };

    const candidates: FDCIngredientMatch[] = [];
    for (let idx = 0; idx < this.fdcVectors.length; idx++) {
      const score = this._cosineSimilarity(inputTokenVector, this.fdcVectors[idx]!);
      candidates.push(new FDCIngredientMatch(this.fdcIngredients[idx]!, score));
    }

    candidates.sort((x, y) => x.score - y.score);
    return candidates;
  }
}

let usifRanker: USIF | undefined;

/** Cached uSIF ranker. Port of `get_usif_ranker`. */
export function getUsifRanker(): USIF {
  if (usifRanker === undefined) {
    usifRanker = new USIF(loadEmbeddingsModel(), loadFdcIngredients());
  }
  return usifRanker;
}
