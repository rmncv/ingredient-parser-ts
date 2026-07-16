/**
 * Port of `upstream/ingredient_parser/en/foundationfoods/_foundationfoods.py`.
 *
 * Three-stage foundation-food matching: token preparation/normalisation, uSIF
 * down-selection, then fuzzy-embedding arbitration with distribution-based
 * score fusion.
 *
 * Score-distribution statistics (`normalize_scores`, ranker confidences,
 * fusion) are Python `float` (float64 = JS `number`). The raw ranker scores
 * feeding them come from BM25 (float64) and the float32 uSIF/fuzzy rankers.
 */

import { FoundationFood } from "../../dataclasses.js";
import { pyRound } from "../../py/pyops.js";
import { loadEmbeddingsModel } from "../_loaders.js";
import { getBm25Ranker } from "./_bm25.js";
import {
  NON_RAW_FOOD_NOUN_STEMS,
  NON_RAW_FOOD_VERB_STEMS,
  lookupOverride,
} from "./_ff_constants.js";
import { FDCIngredient, FDCIngredientMatch, IngredientToken } from "./_ff_dataclasses.js";
import { normaliseSpelling, prepareTokens, stripAmbiguousLeadingAdjectives } from "./_ff_utils.js";
import { getFuzzyRanker } from "./_fuzzy.js";
import { getUsifRanker } from "./_usif.js";

// Top k matches to use wherever we limit the matches considered.
const TOP_K = 50;
// Minimum agreement between BM25 and uSIF rankings.
const BM25_USIF_AGREEMENT_THRESHOLD = 0.25;
// Minimum percentage difference between top ranked results to be confident.
const TOP_PC_DIFF_THRESHOLD = 0.01;
// Maximum reasonable semantic score.
const SEMANTIC_SCORE_THRESHOLD = 0.275;
// FDC data preferences, least preferred to most preferred.
const DATASET_PREFERENCE = ["survey_fndds_food", "sr_legacy_food", "foundation_food"];

interface MatchQuality {
  quality: "good" | "poor";
  reason: string;
}

/** Match ingredient name to a foundation food. Port of `match_foundation_foods`. */
export function matchFoundationFoods(
  tokens: string[],
  posTags: string[],
  nameIdx: number,
): FoundationFood | null {
  const n = Math.min(tokens.length, posTags.length);
  let nameTokens: IngredientToken[] = [];
  for (let i = 0; i < n; i++) {
    nameTokens.push(new IngredientToken(tokens[i]!, posTags[i]!));
  }

  nameTokens = stripAmbiguousLeadingAdjectives(nameTokens);
  const preparedTokens = prepareTokens(nameTokens);
  if (preparedTokens.length === 0) {
    return null;
  }

  const normalisedTokens = normaliseSpelling(preparedTokens);

  const override = lookupOverride(normalisedTokens.map((t) => t.token));
  if (override !== undefined) {
    return new FoundationFood({
      text: override.text,
      confidence: override.confidence,
      fdcId: override.fdcId,
      category: override.category,
      dataType: override.dataType,
      nameIndex: nameIdx,
    });
  }

  // Determine whether any normalised tokens are in the embeddings model.
  const embeddings = loadEmbeddingsModel();
  const normalisedEmbeddingsTokens = normalisedTokens.filter((t) => embeddings.has(t.token));
  const hasTokenInEmbeddings = normalisedEmbeddingsTokens.length > 0;

  // Bias towards the raw version unless a verb/noun indicates the food is not raw.
  const tokenSet = new Set(normalisedTokens.map((t) => t.token));
  let sharesVerb = false;
  let sharesNoun = false;
  for (const t of tokenSet) {
    if (NON_RAW_FOOD_VERB_STEMS.has(t)) {
      sharesVerb = true;
    }
    if (NON_RAW_FOOD_NOUN_STEMS.has(t)) {
      sharesNoun = true;
    }
  }
  if (!sharesVerb && !sharesNoun) {
    normalisedTokens.push(new IngredientToken("raw", "JJ"));
    normalisedEmbeddingsTokens.push(new IngredientToken("raw", "JJ"));
  }

  const bm25 = getBm25Ranker();
  const bm25Matches = bm25.rankMatches(normalisedTokens);

  if (!hasTokenInEmbeddings) {
    if (bm25Matches.length === 0) {
      return null;
    }
    const bestMatch = bm25Matches[0]!;
    return new FoundationFood({
      text: bestMatch.fdc.description,
      confidence: 1.0,
      fdcId: bestMatch.fdc.fdcId,
      category: bestMatch.fdc.category,
      dataType: bestMatch.fdc.dataType,
      nameIndex: nameIdx,
    });
  }

  const u = getUsifRanker();
  const usifMatches = u.rankMatches(normalisedEmbeddingsTokens);

  // If BM25 and uSIF agree on the top result, return it and skip processing.
  const consistentFdc = consistentTopResult(bm25Matches, usifMatches);
  if (consistentFdc !== null) {
    return new FoundationFood({
      text: consistentFdc.description,
      confidence: 1.0,
      fdcId: consistentFdc.fdcId,
      category: consistentFdc.category,
      dataType: consistentFdc.dataType,
      nameIndex: nameIdx,
    });
  }

  let fuzzyMatches: FDCIngredientMatch[] = [];
  const bm25UsifAgreement = estimateBm25UsifAgreement(bm25Matches, usifMatches);
  if (hasTokenInEmbeddings && bm25UsifAgreement < BM25_USIF_AGREEMENT_THRESHOLD) {
    // Set-order note: upstream builds `candidate_fdc_ids` as a Python set of
    // ints, whose iteration order follows CPython's hash-bucket layout; here a
    // JS Set iterates in insertion order (uSIF top-K first, then BM25 top-K).
    // The fuzzy ranker iterates this set and then stable-sorts by score, so the
    // orders only diverge when two candidates have *exactly* equal fuzzy scores
    // — the theoretical divergence point. Corpus-validated: all 791
    // foundation_foods parity entries reproduce upstream results exactly.
    const candidateFdcIds = new Set<number>();
    for (const m of usifMatches.slice(0, TOP_K)) {
      candidateFdcIds.add(m.fdc.fdcId);
    }
    for (const m of bm25Matches.slice(0, TOP_K)) {
      candidateFdcIds.add(m.fdc.fdcId);
    }
    const fuzzy = getFuzzyRanker();
    fuzzyMatches = fuzzy.rankMatches(normalisedEmbeddingsTokens, candidateFdcIds);
  }

  const fusedMatches = fuseResults(bm25Matches, fuzzyMatches, usifMatches, TOP_K);
  const bestMatch = fusedMatches[0]!;

  // If <1% difference between the best two fused matches (and best < 0.95),
  // assume no suitable match.
  const topPcDiff = percentDifference(fusedMatches[0]!.score, fusedMatches[1]!.score);
  if (bestMatch.score < 0.95 && topPcDiff > 0 && topPcDiff <= TOP_PC_DIFF_THRESHOLD) {
    return null;
  }

  if (topPcDiff === 0) {
    let matchesWithTopScore = 0;
    for (const m of fusedMatches) {
      if (m.score === bestMatch.score) {
        matchesWithTopScore += 1;
      }
    }
    if (matchesWithTopScore > DATASET_PREFERENCE.length) {
      return null;
    }
  }

  const matchQuality = determineMatchQuality(bestMatch, usifMatches, fuzzyMatches);
  if (matchQuality.quality === "poor") {
    return null;
  }

  return new FoundationFood({
    text: bestMatch.fdc.description,
    confidence: bestMatch.score, // already rounded by fuseResults
    fdcId: bestMatch.fdc.fdcId,
    category: bestMatch.fdc.category,
    dataType: bestMatch.fdc.dataType,
    nameIndex: nameIdx,
  });
}

/** Port of `consistent_top_result`. */
function consistentTopResult(
  bm25Matches: FDCIngredientMatch[],
  usifMatches: FDCIngredientMatch[],
): FDCIngredient | null {
  if (bm25Matches.length === 0 || usifMatches.length === 0) {
    return null;
  }

  const best = new Map<number, FDCIngredient>();

  best.set(bm25Matches[0]!.fdc.fdcId, bm25Matches[0]!.fdc);
  let bestScore = bm25Matches[0]!.score;
  for (const m of bm25Matches.slice(1)) {
    if (m.score === bestScore) {
      best.set(m.fdc.fdcId, m.fdc);
    } else {
      break;
    }
  }

  best.set(usifMatches[0]!.fdc.fdcId, usifMatches[0]!.fdc);
  bestScore = usifMatches[0]!.score;
  for (const m of usifMatches.slice(1)) {
    if (m.score === bestScore) {
      best.set(m.fdc.fdcId, m.fdc);
    } else {
      break;
    }
  }

  if (best.size === 1) {
    return best.values().next().value ?? null;
  }
  return null;
}

/** Port of `percent_difference`. */
function percentDifference(score1: number, score2: number): number {
  if (score1 === score2) {
    return 0;
  }
  const maxScore = Math.max(score1, score2);
  const minScore = Math.min(score1, score2);
  return (maxScore - minScore) / maxScore;
}

/** Port of `estimate_bm25_usif_agreement`. */
function estimateBm25UsifAgreement(
  bm25Matches: FDCIngredientMatch[],
  usifMatches: FDCIngredientMatch[],
  p = 0.95,
): number {
  if (p < 0 || p > 1) {
    throw new Error(`p should be between 0 and 1. Provided value is ${p}.`);
  }

  const bm25Ids = bm25Matches.slice(0, TOP_K).map((m) => m.fdc.fdcId);
  const usifIds = usifMatches.slice(0, TOP_K).map((m) => m.fdc.fdcId);

  const bm25Set = new Set<number>();
  const usifSet = new Set<number>();
  let rboSum = 0;
  for (let depth = 1; depth <= bm25Ids.length; depth++) {
    bm25Set.add(bm25Ids[depth - 1]!);
    usifSet.add(usifIds[depth - 1]!);
    let overlap = 0;
    for (const id of bm25Set) {
      if (usifSet.has(id)) {
        overlap += 1;
      }
    }
    const agreement = overlap / depth;
    rboSum += agreement * Math.pow(p, depth);
  }

  return (1 - p) * rboSum;
}

/** Port of `estimate_ranker_confidence`. */
function estimateRankerConfidence(scores: number[]): number {
  if (scores.length < 2) {
    return 0;
  }

  const sortedScores = [...scores].sort((a, b) => b - a);
  const maxScore = sortedScores[0]!;
  let secondMax = 0;
  for (const score of sortedScores) {
    if (score !== maxScore) {
      secondMax = score;
      break;
    }
  }

  const gap = maxScore - secondMax;
  const relativeGap = gap / maxScore;

  let distributionFactor: number;
  if (scores.length > 2) {
    const remaining = sortedScores.slice(1);
    const remainingMean = mean(remaining);
    const remainingStd = std(remaining, remainingMean);
    if (remainingMean > 0) {
      const cv = remainingStd / remainingMean;
      distributionFactor = 1.0 / (1.0 + cv);
    } else {
      distributionFactor = 1.0;
    }
  } else {
    distributionFactor = 1.0;
  }

  return 0.7 * relativeGap + 0.3 * distributionFactor;
}

function mean(values: number[]): number {
  let s = 0;
  for (const v of values) {
    s += v;
  }
  return s / values.length;
}

/** numpy population std (ddof=0). */
function std(values: number[], m: number): number {
  let s = 0;
  for (const v of values) {
    const d = v - m;
    s += d * d;
  }
  return Math.sqrt(s / values.length);
}

/** Port of `normalize_scores`. */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) {
    return [];
  }

  const first = scores[0]!;
  if (scores.every((s) => s === first)) {
    return new Array(scores.length).fill(0.5);
  }

  let min = Infinity;
  let max = -Infinity;
  for (const s of scores) {
    if (s < min) {
      min = s;
    }
    if (s > max) {
      max = s;
    }
  }
  const rangeVal = Math.max(max - min, 1e-9);

  return scores.map((score) => {
    const norm = (score - min) / rangeVal;
    return Math.max(0.0, Math.min(1.0, norm));
  });
}

/** Port of `fuse_results`. */
function fuseResults(
  bm25MatchesIn: FDCIngredientMatch[],
  fuzzyMatchesIn: FDCIngredientMatch[],
  usifMatchesIn: FDCIngredientMatch[],
  topN = 100,
): FDCIngredientMatch[] {
  const bm25Matches = bm25MatchesIn.slice(0, topN);
  const usifMatches = usifMatchesIn.slice(0, topN);
  const fuzzyMatches = fuzzyMatchesIn.slice(0, topN);

  const bm25Normalized = normalizeScores(bm25Matches.map((m) => m.score));
  const usifNormalized = normalizeScores(usifMatches.map((m) => m.score));
  const fuzzyNormalized = normalizeScores(fuzzyMatches.map((m) => m.score));

  const usifDict = new Map<number, number>();
  usifMatches.forEach((m, i) => usifDict.set(m.fdc.fdcId, usifNormalized[i]!));
  const fuzzyDict = new Map<number, number>();
  fuzzyMatches.forEach((m, i) => fuzzyDict.set(m.fdc.fdcId, fuzzyNormalized[i]!));
  const bm25Dict = new Map<number, number>();
  bm25Matches.forEach((m, i) => bm25Dict.set(m.fdc.fdcId, bm25Normalized[i]!));

  let bm25Conf = estimateRankerConfidence(bm25Normalized);
  let fuzzyConf = estimateRankerConfidence(fuzzyNormalized);
  let usifConf = estimateRankerConfidence(usifNormalized);
  const totalConf = bm25Conf + usifConf + fuzzyConf;
  bm25Conf = (bm25Conf / totalConf) * 3;
  fuzzyConf = (fuzzyConf / totalConf) * 3;
  usifConf = (usifConf / totalConf) * 3;

  // fdc_entries = {m.fdc for bm25} | {m.fdc for usif} (dedup by fdc_id).
  const fdcEntries = new Map<number, FDCIngredient>();
  for (const m of bm25Matches) {
    if (!fdcEntries.has(m.fdc.fdcId)) {
      fdcEntries.set(m.fdc.fdcId, m.fdc);
    }
  }
  for (const m of usifMatches) {
    if (!fdcEntries.has(m.fdc.fdcId)) {
      fdcEntries.set(m.fdc.fdcId, m.fdc);
    }
  }

  const fusedMatches: FDCIngredientMatch[] = [];
  for (const fdc of fdcEntries.values()) {
    const bm25NormScore = bm25Dict.get(fdc.fdcId) ?? 0;
    // uSIF/Fuzzy scores are inverted (smaller = better), so subtract from 1.
    const usifNormScore = 1 - (usifDict.get(fdc.fdcId) ?? 1);
    const fuzzyNormScore = 1 - (fuzzyDict.get(fdc.fdcId) ?? 1);

    const fusedScore =
      bm25Conf * bm25NormScore + usifConf * usifNormScore + fuzzyConf * fuzzyNormScore;
    fusedMatches.push(new FDCIngredientMatch(fdc, pyRound(fusedScore / 3, 6)));
  }

  // Descending by (score, dataset preference index); stable for exact ties.
  fusedMatches.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    const ai = DATASET_PREFERENCE.indexOf(a.fdc.dataType);
    const bi = DATASET_PREFERENCE.indexOf(b.fdc.dataType);
    return bi - ai;
  });
  return fusedMatches;
}

/** Port of `determine_match_quality`. */
function determineMatchQuality(
  bestMatch: FDCIngredientMatch,
  usifMatches: FDCIngredientMatch[],
  fuzzyMatches: FDCIngredientMatch[],
): MatchQuality {
  const usifMatch = getMatchingFdcScore(bestMatch.fdc.fdcId, usifMatches);
  const fuzzyMatch = getMatchingFdcScore(bestMatch.fdc.fdcId, fuzzyMatches);

  const usifScore = usifMatch ? usifMatch.score : 1;
  const fuzzyScore = fuzzyMatch ? fuzzyMatch.score : 1;
  const bestSemanticScore = Math.min(usifScore, fuzzyScore);
  if (bestSemanticScore > SEMANTIC_SCORE_THRESHOLD) {
    return { quality: "poor", reason: "best semantic score greater than threshold" };
  }

  return { quality: "good", reason: "" };
}

/** Port of `get_matching_fdc_score`. */
function getMatchingFdcScore(
  fdcId: number,
  matches: FDCIngredientMatch[],
): FDCIngredientMatch | null {
  for (const match of matches) {
    if (match.fdc.fdcId === fdcId) {
      return match;
    }
  }
  return null;
}
