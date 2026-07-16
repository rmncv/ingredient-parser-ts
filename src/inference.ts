/**
 * CRF Viterbi inference, a faithful port of
 * `upstream/ingredient_parser/inference.py` (`NumpyCRFInference` and
 * `NumpyViterbiInference`).
 *
 * The model weights are affine-quantized integers. Viterbi decoding runs in the
 * quantized (integer) domain for exact tie-breaking parity with numpy; marginal
 * probabilities (used as per-token confidences) are computed on de-quantized
 * float32 weights with float64 log-sum-exp arithmetic.
 */

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

/** Feature dict for a single token, as produced by the pre-processor. */
export type FeatureDict = Record<string, string | boolean>;

interface ParserModelData {
  attributes: Record<string, number>;
  labels: Record<string, number>;
  state_features: Record<string, number>;
  transitions: Record<string, number>;
  quantization_scale: number;
  quantization_zero_offset: number;
}

/**
 * numpy `np.logaddexp(a, b)` semantics, computed in float64.
 *
 * Mirrors numpy's C implementation, including handling of equal values
 * (including infinities of the same sign) and one-sided -Infinity.
 */
function logaddexp(a: number, b: number): number {
  if (a === b) {
    // Handles infinities of the same sign: -inf + ln2 === -inf.
    return a + Math.LN2;
  }
  const tmp = a - b;
  if (tmp > 0) {
    return a + Math.log1p(Math.exp(-tmp));
  } else if (tmp <= 0) {
    return b + Math.log1p(Math.exp(tmp));
  }
  return tmp; // NaN
}

/**
 * Implementation of Viterbi decoding and marginal computation over a
 * quantized linear-chain CRF.
 */
export class NumpyViterbiInference {
  readonly labelToIdx: Record<string, number>;
  readonly idxToLabel: string[];
  readonly nLabels: number;
  readonly featuresToIdx: Record<string, number>;
  readonly nFeatures: number;
  readonly scaleFactor: number;
  readonly zeroOffset: number;
  /** scaleFactor and zeroOffset cast to float32, matching numpy scalar casting. */
  private readonly scaleFactor32: number;
  private readonly zeroOffset32: number;

  /**
   * Emission weights, flattened (nFeatures x nLabels), quantized ints.
   *
   * Note: Python's NumpyViterbiInference branches on the weight dtype
   * (int -> np.int32, float -> np.float32). The shipped model.en.json.gz is
   * quantized to ints, so this port only implements the Int32Array branch;
   * a float-weight model would need Float32Array storage plus float32
   * arithmetic in the Viterbi sums.
   */
  readonly emissionWeights: Int32Array;
  readonly emissionSize: number;
  /** Transition weights, flattened (nLabels x nLabels), quantized ints. */
  readonly transitionWeights: Int32Array;
  readonly transitionSize: number;
  /** De-quantized transition weights (float64 holding float32-rounded values). */
  readonly dqTransitionWeights: Float64Array;

  /** Marginal probabilities from the most recent predictSequence call. */
  marginals: number[][] = [];

  constructor(
    features: Record<string, number>,
    labels: Record<string, number>,
    featureWeights: Record<string, number>,
    transitionWeights: Record<string, number>,
    scaleFactor: number,
    zeroOffset: number,
  ) {
    this.labelToIdx = labels;
    this.nLabels = Object.keys(labels).length;
    this.idxToLabel = new Array(this.nLabels);
    for (const [label, idx] of Object.entries(labels)) {
      this.idxToLabel[idx] = label;
    }
    this.featuresToIdx = features;
    this.nFeatures = Object.keys(features).length;
    this.scaleFactor = scaleFactor;
    this.zeroOffset = zeroOffset;
    // numpy performs the affine ops as float32 array ⊙ scalar, so the scalars
    // are cast to float32 and the arithmetic is single-precision (no
    // intermediate float64 quotient that would double-round).
    this.scaleFactor32 = Math.fround(scaleFactor);
    this.zeroOffset32 = Math.fround(zeroOffset);

    // Emission matrix (nFeatures x nLabels), populated with quantized weights.
    this.emissionSize = this.nFeatures * this.nLabels;
    this.emissionWeights = new Int32Array(this.emissionSize);
    for (const [feat, weight] of Object.entries(featureWeights)) {
      const sep = feat.indexOf("|");
      const feature = feat.slice(0, sep);
      const label = feat.slice(sep + 1);
      const featureIdx = this.featuresToIdx[feature];
      const labelIdx = this.labelToIdx[label];
      this.emissionWeights[featureIdx * this.nLabels + labelIdx] = weight;
    }

    // Transition matrix (nLabels x nLabels), populated with quantized weights.
    this.transitionSize = this.nLabels * this.nLabels;
    this.transitionWeights = new Int32Array(this.transitionSize);
    for (const [feat, weight] of Object.entries(transitionWeights)) {
      const sep = feat.indexOf("|");
      const prevLabel = feat.slice(0, sep);
      const currentLabel = feat.slice(sep + 1);
      const prevIdx = this.labelToIdx[prevLabel];
      const currentIdx = this.labelToIdx[currentLabel];
      this.transitionWeights[prevIdx * this.nLabels + currentIdx] = weight;
    }

    // De-quantized transition weights are constant, so precompute them.
    this.dqTransitionWeights = new Float64Array(this.transitionSize);
    for (let i = 0; i < this.transitionSize; i++) {
      this.dqTransitionWeights[i] = this.dequantizeScalar(this.transitionWeights[i]);
    }
  }

  /**
   * Restore a float value from a quantized weight by reversing affine scaling.
   * `w = (fround(q) - zeroOffset) / scaleFactor` with each numpy float32
   * operation rounded via Math.fround.
   */
  private dequantizeScalar(q: number): number {
    return Math.fround(Math.fround(Math.fround(q) - this.zeroOffset32) / this.scaleFactor32);
  }

  /**
   * Predict the label sequence via Viterbi for a sequence of feature sets.
   *
   * Returns [label, confidence] tuples; confidence is the marginal probability
   * of the chosen label at that position.
   */
  predictSequence(
    featuresSeq: Set<string>[],
    constrainTransitions = true,
  ): [string, number][] {
    const seqLen = featuresSeq.length;
    const nLabels = this.nLabels;

    // Pre-compute state scores (seqLen x nLabels) as float64 integer sums of
    // the emission weights for each token's known features.
    const stateScores: Float64Array[] = new Array(seqLen);
    for (let t = 0; t < seqLen; t++) {
      const row = new Float64Array(nLabels);
      for (const feat of featuresSeq[t]) {
        const featureIdx = this.featuresToIdx[feat];
        if (featureIdx === undefined) continue; // unknown feature skipped
        const base = featureIdx * nLabels;
        for (let l = 0; l < nLabels; l++) {
          row[l] += this.emissionWeights[base + l];
        }
      }
      stateScores[t] = row;
    }

    // Constraint-specific label indices.
    const bNameIdx = this.labelToIdx["B_NAME_TOK"];
    const iNameIdx = this.labelToIdx["I_NAME_TOK"];
    const nameSepIdx = this.labelToIdx["NAME_SEP"];
    // Python truthiness: `if constrain_transitions and b_name_idx:` is falsy
    // when b_name_idx is 0 or undefined.
    const constraintActive =
      constrainTransitions && bNameIdx !== undefined && bNameIdx !== 0;

    // has_b_name[t][label]: whether the best path to this label has seen a
    // B_NAME_TOK since the start or the last NAME_SEP.
    const hasBName: Uint8Array[] = new Array(seqLen);
    for (let t = 0; t < seqLen; t++) hasBName[t] = new Uint8Array(nLabels);

    // Viterbi lattice: scores (float64 holding integer sums or -Infinity) and
    // int8 backpointers.
    const latticeScores: Float64Array[] = new Array(seqLen);
    const backpointers: Int8Array[] = new Array(seqLen);
    for (let t = 0; t < seqLen; t++) {
      latticeScores[t] = new Float64Array(nLabels);
      backpointers[t] = new Int8Array(nLabels);
    }

    // First element: scores come only from emissions.
    for (let l = 0; l < nLabels; l++) latticeScores[0][l] = stateScores[0][l];

    // Initial constraint: I_NAME_TOK cannot be first.
    if (constrainTransitions) {
      latticeScores[0][iNameIdx] = -Infinity;
      hasBName[0][bNameIdx] = 1;
    }

    // Forward pass.
    for (let t = 1; t < seqLen; t++) {
      const prev = latticeScores[t - 1];
      const state = stateScores[t];
      const cur = latticeScores[t];
      const bp = backpointers[t];

      // For each current label, find max & argmax over previous labels.
      for (let c = 0; c < nLabels; c++) {
        let best = -Infinity;
        let bestIdx = 0;
        let first = true;
        for (let p = 0; p < nLabels; p++) {
          let score =
            prev[p] + this.transitionWeights[p * nLabels + c] + state[c];
          // Mask I_NAME_TOK transitions from paths lacking a B_NAME_TOK.
          if (constraintActive && c === iNameIdx && hasBName[t - 1][p] === 0) {
            score = -Infinity;
          }
          if (first || score > best) {
            best = score;
            bestIdx = p;
            first = false;
          }
        }
        cur[c] = best;
        bp[c] = bestIdx;
      }

      // Update has_b_name inheriting from the best predecessor.
      if (constraintActive) {
        const prevHas = hasBName[t - 1];
        const curHas = hasBName[t];
        for (let c = 0; c < nLabels; c++) {
          curHas[c] = prevHas[bp[c]];
        }
        curHas[bNameIdx] = 1;
        curHas[nameSepIdx] = 0;
      }
    }

    // Backtrack.
    const labelIndices = new Array<number>(seqLen).fill(0);
    labelIndices[seqLen - 1] = argmax(latticeScores[seqLen - 1]);
    for (let t = seqLen - 2; t >= 0; t--) {
      labelIndices[t] = backpointers[t + 1][labelIndices[t + 1]];
    }

    const predictedLabels = labelIndices.map((idx) => this.idxToLabel[idx]);

    this.marginals = this.computeMarginals(seqLen, stateScores);
    const confidences = labelIndices.map((idx, t) => this.marginals[t][idx]);

    return predictedLabels.map((label, t) => [label, confidences[t]]);
  }

  /**
   * Compute per-label marginal probabilities via forward/backward with
   * log-sum-exp. All arithmetic is float64; state scores are de-quantized
   * (float32 rounding) first, matching the Python implementation.
   */
  private computeMarginals(seqLen: number, stateScores: Float64Array[]): number[][] {
    const nLabels = this.nLabels;

    // De-quantize state scores.
    const dqState: Float64Array[] = new Array(seqLen);
    for (let t = 0; t < seqLen; t++) {
      const row = new Float64Array(nLabels);
      for (let l = 0; l < nLabels; l++) {
        row[l] = this.dequantizeScalar(stateScores[t][l]);
      }
      dqState[t] = row;
    }

    const logAlpha: Float64Array[] = new Array(seqLen);
    const logBeta: Float64Array[] = new Array(seqLen);
    for (let t = 0; t < seqLen; t++) {
      logAlpha[t] = new Float64Array(nLabels).fill(-Infinity);
      logBeta[t] = new Float64Array(nLabels).fill(-Infinity);
    }

    // Forward pass.
    for (let l = 0; l < nLabels; l++) logAlpha[0][l] = dqState[0][l];
    for (let t = 1; t < seqLen; t++) {
      const prevAlpha = logAlpha[t - 1];
      const state = dqState[t];
      const cur = logAlpha[t];
      // For each current label c, reduce (folding left, ascending prev index)
      // over prev of (prevAlpha[p] + dqTransition[p][c]).
      for (let c = 0; c < nLabels; c++) {
        let acc = prevAlpha[0] + this.dqTransitionWeights[0 * nLabels + c];
        for (let p = 1; p < nLabels; p++) {
          acc = logaddexp(acc, prevAlpha[p] + this.dqTransitionWeights[p * nLabels + c]);
        }
        cur[c] = acc + state[c];
      }
    }

    // Backward pass.
    for (let l = 0; l < nLabels; l++) logBeta[seqLen - 1][l] = 0.0;
    for (let t = seqLen - 2; t >= 0; t--) {
      const nextState = dqState[t + 1];
      const nextBeta = logBeta[t + 1];
      const cur = logBeta[t];
      // For each prev label p, reduce (folding left, ascending cur index)
      // over cur of (dqTransition[p][c] + nextState[c] + nextBeta[c]).
      for (let p = 0; p < nLabels; p++) {
        const base = p * nLabels;
        // numpy evaluates `dq_transition_weights + state` in float32 (both are
        // float32 arrays) before adding the float64 beta, so the transition +
        // emission sum is rounded to float32 first.
        let acc =
          Math.fround(this.dqTransitionWeights[base] + nextState[0]) + nextBeta[0];
        for (let c = 1; c < nLabels; c++) {
          acc = logaddexp(
            acc,
            Math.fround(this.dqTransitionWeights[base + c] + nextState[c]) + nextBeta[c],
          );
        }
        cur[p] = acc;
      }
    }

    // Log partition function Z (reduce over the last alpha row).
    let logZ = logAlpha[seqLen - 1][0];
    for (let l = 1; l < nLabels; l++) {
      logZ = logaddexp(logZ, logAlpha[seqLen - 1][l]);
    }

    // Marginals P(y_t | x) = exp(logAlpha + logBeta - logZ).
    const marginals: number[][] = new Array(seqLen);
    for (let t = 0; t < seqLen; t++) {
      const row = new Array<number>(nLabels);
      for (let l = 0; l < nLabels; l++) {
        row[l] = Math.exp(logAlpha[t][l] + logBeta[t][l] - logZ);
      }
      marginals[t] = row;
    }
    return marginals;
  }
}

/** numpy argmax: index of the first maximal element (strict > when ascending). */
function argmax(arr: Float64Array): number {
  let best = arr[0];
  let bestIdx = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > best) {
      best = arr[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Perform inference using a trained CRF model for ingredient sentence
 * labelling.
 */
export class NumpyCRFInference {
  readonly modelFile: string;
  readonly combinedNameLabels: boolean;
  readonly model: NumpyViterbiInference;

  constructor(modelPath: string | URL, combinedNameLabels = false) {
    this.modelFile =
      typeof modelPath === "string" ? modelPath : modelPath.pathname;
    this.combinedNameLabels = combinedNameLabels;
    this.model = this.load(modelPath);
  }

  /**
   * Tag a sentence given precomputed per-token feature dicts.
   *
   * If combinedNameLabels is true, transition constraints are disabled because
   * they only apply to I_NAME_TOK.
   */
  tagFromFeatures(sentenceFeatures: FeatureDict[]): [string, number][] {
    if (
      this.model.emissionSize === 0 ||
      this.model.transitionSize === 0
    ) {
      throw new Error("NumpyViterbiInference model does not have any weights.");
    }

    const features = sentenceFeatures.map((f) => this.convertFeatures(f));
    return this.model.predictSequence(features, !this.combinedNameLabels);
  }

  /**
   * Convert a feature dict to a set of feature strings.
   *
   * String features become `${key}:${value}`; boolean features become the bare
   * key when true and are skipped when false.
   */
  private convertFeatures(features: FeatureDict): Set<string> {
    const out = new Set<string>();
    for (const [key, value] of Object.entries(features)) {
      if (value === false) continue; // Skip False booleans
      if (typeof value === "boolean") {
        out.add(key); // value is true
      } else {
        out.add(`${key}:${value}`);
      }
    }
    return out;
  }

  /**
   * Return the marginal probability of `label` at `position` for the most
   * recent sequence passed to predictSequence.
   */
  marginal(label: string, position: number): number {
    if (this.model.marginals.length === 0) {
      throw new Error(
        "Cannot return marginals until predict_sequence() has been called.",
      );
    }
    const labelIdx = this.model.labelToIdx[label];
    return this.model.marginals[position][labelIdx];
  }

  private load(path: string | URL): NumpyViterbiInference {
    const pathStr = typeof path === "string" ? path : path.pathname;
    // Python validates via mimetypes.guess_type(path) == ("application/json",
    // "gzip"). Verified against the reference interpreter (tools/.venv,
    // Python 3.14): only lowercase ".json.gz" satisfies that — uppercase
    // variants (e.g. "X.JSON.GZ") return ("application/gzip", None) and are
    // rejected. So this check is deliberately case-sensitive.
    if (!pathStr.endsWith(".json.gz")) {
      throw new Error("Model must be a .json.gz file.");
    }

    const buf = readFileSync(path);
    const data = JSON.parse(gunzipSync(buf).toString("utf-8")) as ParserModelData;

    return new NumpyViterbiInference(
      data.attributes,
      data.labels,
      data.state_features,
      data.transitions,
      data.quantization_scale,
      data.quantization_zero_offset,
    );
  }
}
