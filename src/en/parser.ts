/**
 * Port of `upstream/ingredient_parser/en/parser.py`.
 *
 * Wires the pre-processor, CRF inference, and post-processor into the
 * English-language `parseIngredientEn`/`inspectParserEn` entry points, plus the
 * `guessIngredientName` fallback that assigns a name when the model labels none.
 */

import { groupConsecutiveIdx } from "../_common.js";
import {
  LabelledToken,
  ParsedIngredient,
  ParserDebugInfo,
} from "../dataclasses.js";
import { loadParserModel } from "./_loaders.js";
import { PostProcessor } from "./postprocess.js";
import { PreProcessor } from "./preprocess.js";
import type { VolumetricUnitsSystem } from "../units/registry.js";

/** Options accepted by the English parser entry points (camelCased kwargs). */
export interface ParseIngredientEnOptions {
  separateNames?: boolean;
  discardIsolatedStopWords?: boolean;
  expectNameInOutput?: boolean;
  stringUnits?: boolean;
  volumetricUnitsSystem?: VolumetricUnitsSystem;
  foundationFoods?: boolean;
  customUnits?: Record<string, string> | null;
}

/** Minimal tagger interface needed by `guessIngredientName`. */
interface MarginalTagger {
  marginal(label: string, position: number): number;
}

/** Port of Python's `str.capitalize()`: first char upper, remainder lower. */
function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0]!.toUpperCase() + value.slice(1).toLowerCase();
}

/**
 * Expand a custom units dict with capitalised plural/singular variants, then
 * run the pre-processor, CRF inference, and (optionally) the name-guessing
 * fallback. Shared by `parseIngredientEn` and `inspectParserEn`.
 */
function runPipeline(
  sentence: string,
  options: Required<Omit<ParseIngredientEnOptions, "customUnits">> & {
    customUnits: Record<string, string> | null | undefined;
  },
): { preProcessor: PreProcessor; postProcessor: PostProcessor } {
  const TAGGER = loadParserModel();

  let customUnits = options.customUnits ?? {};

  // Generate capitalized version of each entry in the custom units dictionary.
  const capitalizedUnits: Record<string, string> = {};
  for (const [plural, singular] of Object.entries(customUnits)) {
    capitalizedUnits[capitalize(plural)] = capitalize(singular);
  }
  customUnits = { ...customUnits, ...capitalizedUnits };

  const processedSentence = new PreProcessor(sentence, customUnits);
  const features = processedSentence.sentenceFeatures();
  const tagged = TAGGER.tagFromFeatures(features);
  let labels = tagged.map((t) => t[0]);
  let scores = tagged.map((t) => t[1]);

  if (options.expectNameInOutput && labels.every((label) => !label.includes("NAME"))) {
    // No tokens were assigned the NAME label, so guess if there's a name.
    [labels, scores] = guessIngredientName(TAGGER, labels, scores);
  }

  const labelledTokens: LabelledToken[] = processedSentence.tokenizedSentence.map(
    (token, i) => ({
      index: token.index,
      text: token.text,
      posTag: token.posTag,
      label: labels[i]!,
      score: scores[i]!,
      plural: processedSentence.singularisedIndices.includes(token.index),
    }),
  );

  const postProcessor = new PostProcessor(sentence, labelledTokens, customUnits, {
    separateNames: options.separateNames,
    discardIsolatedStopWords: options.discardIsolatedStopWords,
    stringUnits: options.stringUnits,
    volumetricUnitsSystem: options.volumetricUnitsSystem,
    foundationFoods: options.foundationFoods,
  });

  return { preProcessor: processedSentence, postProcessor };
}

/** Apply the English parser defaults to a partial options object. */
function withDefaults(
  options: ParseIngredientEnOptions,
): Required<Omit<ParseIngredientEnOptions, "customUnits">> & {
  customUnits: Record<string, string> | null | undefined;
} {
  return {
    separateNames: options.separateNames ?? true,
    discardIsolatedStopWords: options.discardIsolatedStopWords ?? true,
    expectNameInOutput: options.expectNameInOutput ?? true,
    stringUnits: options.stringUnits ?? false,
    volumetricUnitsSystem: options.volumetricUnitsSystem ?? "us_customary",
    foundationFoods: options.foundationFoods ?? false,
    customUnits: options.customUnits,
  };
}

/** Parse an English-language ingredient sentence. Port of `parse_ingredient_en`. */
export function parseIngredientEn(
  sentence: string,
  options: ParseIngredientEnOptions = {},
): ParsedIngredient {
  const { postProcessor } = runPipeline(sentence, withDefaults(options));
  return postProcessor.parsed();
}

/** Return intermediate parse objects for inspection. Port of `inspect_parser_en`. */
export function inspectParserEn(
  sentence: string,
  options: ParseIngredientEnOptions = {},
): ParserDebugInfo {
  const { preProcessor, postProcessor } = runPipeline(sentence, withDefaults(options));
  return {
    sentence,
    PreProcessor: preProcessor,
    PostProcessor: postProcessor,
    tagger: loadParserModel(),
  };
}

/**
 * Guess an ingredient name from a list of labels and scores. Port of
 * `guess_ingredient_name`.
 *
 * Only applies when no token was assigned the NAME label. For each token,
 * compute the confidence of each *NAME label and select the most likely one
 * whose confidence exceeds `minScore`. The longest run of consecutive
 * candidate tokens is relabelled with those NAME labels and scores.
 */
export function guessIngredientName(
  TAGGER: MarginalTagger,
  labels: string[],
  scores: number[],
  minScore = 0.2,
): [string[], number[]] {
  const NAME_LABELS = ["B_NAME_TOK", "I_NAME_TOK", "NAME_VAR", "NAME_MOD", "NAME_SEP"];

  // Operate on copies (Python mutates the passed lists, but returning fresh
  // arrays keeps callers explicit).
  const newLabels = labels.slice();
  const newScores = scores.slice();

  // For each element, find the most likely *NAME label whose score exceeds the
  // threshold: {element_index: [score, label]}.
  const candidateScoreLabels = new Map<number, [number, string]>();
  for (let i = 0; i < labels.length; i++) {
    // max over NAME_LABELS by score, first-max on ties (matches Python `max`).
    let best: [number, string] = [TAGGER.marginal(NAME_LABELS[0]!, i), NAME_LABELS[0]!];
    for (let j = 1; j < NAME_LABELS.length; j++) {
      const score = TAGGER.marginal(NAME_LABELS[j]!, i);
      if (score > best[0]) {
        best = [score, NAME_LABELS[j]!];
      }
    }
    if (best[0] > minScore) {
      candidateScoreLabels.set(i, best);
    }
  }

  if (candidateScoreLabels.size === 0) {
    return [newLabels, newScores];
  }

  // Group element indices into groups of consecutive indices (insertion order
  // of a Map is ascending, matching Python dict key order here).
  const groups = groupConsecutiveIdx([...candidateScoreLabels.keys()]);

  // Take the longest group of consecutive indices (first on ties, stable sort)
  // and replace labels/scores there with the most likely *NAME labels.
  const indices = [...groups].sort((a, b) => b.length - a.length)[0]!;
  for (const tokenIndex of indices) {
    const [newScore, newLabel] = candidateScoreLabels.get(tokenIndex)!;
    newLabels[tokenIndex] = newLabel;
    newScores[tokenIndex] = newScore;
  }

  return [newLabels, newScores];
}
