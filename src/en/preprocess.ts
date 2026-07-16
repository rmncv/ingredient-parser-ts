/**
 * Port of `upstream/ingredient_parser/en/preprocess.py`.
 *
 * `PreProcessor` normalises an ingredient sentence into a standardised form,
 * tokenises it, and computes the per-token feature dictionaries consumed by the
 * CRF model.
 *
 * Porting notes:
 * - Method / property names are camelCased from the Python originals. The
 *   private `_replace_*` / `_identify_*` / `_is_*` helpers are ported as public
 *   methods (without the leading underscore) so the unit tests, which call them
 *   directly, can reach them.
 * - Python `str.replace(old, new)` replaces ALL occurrences; JS
 *   `String.replace(string, ...)` only replaces the first, so literal-string
 *   replacements use `replaceAll` / `split().join()`.
 * - `custom_units` is ported as the optional `customUnits` constructor
 *   argument (Python's second positional parameter), not the brief's
 *   `showDebugOutput` (which has no Python counterpart — logging is dropped).
 */

import type { FeatureDict } from "../inference.js";
import type { Token, TokenFeatures } from "../dataclasses.js";
import { isFloat } from "../_common.js";
import { htmlUnescape } from "../nlp/html_unescape.js";
import {
  AMBIGUOUS_UNITS,
  DIMENSIONS,
  FLATTENED_UNITS_LIST,
  LENGTH_UNITS,
  STRING_NUMBERS,
  UNICODE_FRACTIONS,
  UNITS,
} from "./_constants.js";
import {
  CAPITALISED_PATTERN,
  CURRENCY_PATTERN,
  DIGIT_PATTERN,
  DUPE_UNIT_RANGES_PATTERN,
  EXPANDED_RANGE,
  FRACTION_PARTS_PATTERN,
  FRACTION_TOKEN_PATTERN,
  LOWERCASE_PATTERN,
  QUANTITY_UNITS_PATTERN,
  QUANTITY_X_PATTERN,
  STRING_QUANTITY_HYPHEN_PATTERN,
  UNITS_HYPHEN_QUANTITY_PATTERN,
  UNITS_QUANTITY_PATTERN,
  UPPERCASE_PATTERN,
} from "./_regex.js";
import { SentenceStructureFeatures } from "./_structure_features.js";
import {
  combineQuantitiesSplitByAnd,
  isUnitSynonym,
  posTag,
  replaceStringRange,
  stemToken,
  tokenize,
} from "./_utils.js";

export type { FeatureDict } from "../inference.js";

// Python: re.compile(r"\s+")
const CONSECUTIVE_SPACES = /\s+/gu;

// Python string.punctuation.
const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/** Python str.capitalize(): first char upper, remaining lower. */
function capitalize(s: string): string {
  if (s.length === 0) {
    return s;
  }
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Recipe ingredient sentence PreProcessor.
 *
 * Performs the necessary preprocessing on a sentence to generate the features
 * required for the ingredient parser model.
 */
export class PreProcessor {
  readonly input: string;
  readonly sentence: string;
  readonly tokenizedSentence: Token[];
  readonly sentenceStructure: SentenceStructureFeatures;
  singularisedIndices: number[] = [];

  private readonly units: Map<string, string>;
  private readonly unitValues: Set<string>;

  constructor(inputSentence: string, customUnits?: Record<string, string> | null) {
    this.input = inputSentence;
    this.sentence = this.normalise(inputSentence);

    if (customUnits != null) {
      this.units = new Map(UNITS);
      for (const [plural, singular] of Object.entries(customUnits)) {
        this.units.set(plural, singular);
      }
    } else {
      this.units = UNITS;
    }
    this.unitValues = new Set(this.units.values());

    this.tokenizedSentence = this.calculateTokens(this.sentence);
    this.sentenceStructure = new SentenceStructureFeatures(this.tokenizedSentence);
  }

  /** Alias for the tokenized sentence (list of Token objects). */
  get tokens(): Token[] {
    return this.tokenizedSentence;
  }

  repr(): string {
    return `PreProcessor("${this.input}")`;
  }

  toString(): string {
    const tokenList = this.tokenizedSentence.map((t) => `'${t.text}'`).join(", ");
    return [
      "Pre-processed recipe ingredient sentence",
      `\t  Input: ${this.input}`,
      `\tCleaned: ${this.sentence}`,
      `\t Tokens: [${tokenList}]`,
    ].join("\n");
  }

  private normalise(sentence: string): string {
    const funcs: ((s: string) => string)[] = [
      (s) => this.removePriceAnnotations(s),
      (s) => this.replaceEnEmDash(s),
      (s) => this.replaceHtmlFractions(s),
      (s) => this.replaceUnicodeFractions(s),
      combineQuantitiesSplitByAnd,
      (s) => this.identifyFractions(s),
      (s) => this.splitQuantityAndUnits(s),
      (s) => this.removeUnitTrailingPeriod(s),
      replaceStringRange,
      (s) => this.replaceDupeUnitsRanges(s),
      (s) => this.mergeQuantityX(s),
      (s) => this.collapseRanges(s),
    ];

    for (const func of funcs) {
      sentence = func(sentence);
    }

    return sentence.trim();
  }

  removePriceAnnotations(sentence: string): string {
    return sentence.replace(CURRENCY_PATTERN, "");
  }

  replaceEnEmDash(sentence: string): string {
    return sentence.replaceAll("–", "-").replaceAll("—", " - ");
  }

  replaceHtmlFractions(sentence: string): string {
    return htmlUnescape(sentence);
  }

  identifyFractions(sentence: string): string {
    // Replace unicode FRACTION SLASH (U+2044) with forward slash.
    sentence = sentence.replaceAll("⁄", "/");

    let matches = [...sentence.matchAll(FRACTION_PARTS_PATTERN)].map((m) => m[1]);

    if (matches.length === 0) {
      return sentence;
    }

    // Strip surrounding whitespace, then replace the longest matches first so
    // that "1 1/2" is not clobbered by an earlier "1/2" replacement.
    matches = matches.map((m) => m.trim());
    matches.sort((a, b) => b.length - a.length);

    for (const match of matches) {
      // Skip percentage-breakdown ratios like 80/20 where X+Y==100.
      if (!match.includes(" ")) {
        const parts = match.split("/");
        if (parts.length === 2) {
          const n = Number.parseInt(parts[0], 10);
          const d = Number.parseInt(parts[1], 10);
          if (Number.isInteger(n) && Number.isInteger(d) && n + d === 100) {
            continue;
          }
        }
      }

      // Replace / with $.
      let replacement = match.replaceAll("/", "$");
      // If there's a space in the match, replace with #, otherwise prepend #.
      if (replacement.includes(" ")) {
        replacement = replacement.replace(CONSECUTIVE_SPACES, "#");
      } else {
        replacement = "#" + replacement;
      }
      sentence = sentence.split(match).join(replacement);
    }

    return sentence;
  }

  replaceUnicodeFractions(sentence: string): string {
    for (const [fUnicode, fAscii] of UNICODE_FRACTIONS) {
      sentence = sentence.replaceAll(fUnicode, fAscii);
    }
    return sentence;
  }

  splitQuantityAndUnits(sentence: string): string {
    sentence = sentence.replace(QUANTITY_UNITS_PATTERN, "$1 $2");
    sentence = sentence.replace(UNITS_QUANTITY_PATTERN, "$1 $2");
    sentence = sentence.replace(UNITS_HYPHEN_QUANTITY_PATTERN, "$1 - $2");
    return sentence.replace(STRING_QUANTITY_HYPHEN_PATTERN, "$1 $2");
  }

  removeUnitTrailingPeriod(sentence: string): string {
    const baseUnits = [
      "tsp.",
      "tsps.",
      "tbsp.",
      "tbsps.",
      "tbs.",
      "tb.",
      "lb.",
      "lbs.",
      "oz.",
    ];
    const units = [...baseUnits, ...baseUnits.map((u) => capitalize(u))];
    for (const unit of units) {
      const unitNoPeriod = unit.replaceAll(".", "");
      sentence = sentence.replaceAll(unit, unitNoPeriod);
    }
    return sentence;
  }

  replaceDupeUnitsRanges(sentence: string): string {
    const matches = [...sentence.matchAll(DUPE_UNIT_RANGES_PATTERN)];

    if (matches.length === 0) {
      return sentence;
    }

    for (const m of matches) {
      const fullMatch = m[1];
      const quantity1 = m[2];
      const unit1 = m[3];
      const quantity2 = m[4];
      const unit2 = m[5];

      // We are only interested if the both captured units are the same.
      if (unit1 !== unit2 && !isUnitSynonym(unit1, unit2)) {
        continue;
      }

      // If capture unit not in units list, abort.
      if (!FLATTENED_UNITS_LIST.has(unit1) && !LENGTH_UNITS.has(unit1)) {
        continue;
      }

      sentence = sentence.split(fullMatch).join(`${quantity1}-${quantity2} ${unit1}`);
    }

    return sentence;
  }

  mergeQuantityX(sentence: string): string {
    return sentence.replace(QUANTITY_X_PATTERN, "$1x ");
  }

  collapseRanges(sentence: string): string {
    return sentence.replace(EXPANDED_RANGE, "$1-$2");
  }

  private calculateTokens(sentence: string): Token[] {
    const tokens: Token[] = [];
    const tagged = posTag(tokenize(sentence));

    tagged.forEach(([text, pos], i) => {
      let featText: string;
      const singular = this.units.get(text);
      if (singular) {
        this.singularisedIndices.push(i);
        featText = singular;
        text = singular;
      } else if (this.isNumeric(text)) {
        featText = "!num";
      } else {
        featText = text;
      }

      // Get part of speech tag, with overrides for certain tokens.
      if (this.isNumeric(text)) {
        pos = "CD";
      } else if (["c", "g"].includes(text.toLowerCase())) {
        pos = "NN";
      } else if (["and/or", "or", "and"].includes(text.toLowerCase())) {
        pos = "CC";
      } else if (text.toLowerCase() === "e.g.") {
        pos = "IN";
      } else if (text.toLowerCase() === "/") {
        pos = "SYM";
      } else if (text === "in" && i > 0 && tokens[i - 1].featText === "!num") {
        pos = "NN";
      }

      const features: TokenFeatures = {
        stem: stemToken(featText),
        shape: this.wordShape(featText),
        isCapitalised: this.isCapitalised(featText),
        isUnit: this.isUnit(featText),
        isPunc: this.isPunc(featText),
        isAmbiguousUnit: this.isAmbiguousUnit(featText),
      };

      tokens.push({ index: i, text, featText, posTag: pos, features });
    });

    return tokens;
  }

  isUnit(token: string): boolean {
    return (
      this.unitValues.has(token.toLowerCase()) && !LENGTH_UNITS.has(token.toLowerCase())
    );
  }

  isDimension(token: string): boolean {
    return DIMENSIONS.has(token.toLowerCase());
  }

  isLengthUnit(index: number): boolean {
    const token = this.tokenizedSentence[index].featText;
    if (token === "in") {
      if (index > 0 && this.tokenizedSentence[index - 1].featText === "!num") {
        return true;
      }
      return false;
    }
    return LENGTH_UNITS.has(token.toLowerCase());
  }

  isPunc(token: string): boolean {
    return PUNCTUATION.includes(token) || token === "--";
  }

  isNumeric(token: string): boolean {
    if (token === "00") {
      // Special cases of digits that don't represent numbers.
      return false;
    }

    if (FRACTION_TOKEN_PATTERN.test(token)) {
      // Fraction tokens e.g. #1$4 or 1#2$3.
      return true;
    }

    if (STRING_NUMBERS.has(token.toLowerCase())) {
      return true;
    }

    if (token.includes("-")) {
      const parts = token.split("-");
      return parts.every((part) => this.isNumeric(part));
    }

    if (token === "dozen") {
      return true;
    }

    if (token.endsWith("x")) {
      return isFloat(token.slice(0, -1));
    }

    return isFloat(token);
  }

  followsComma(index: number): boolean {
    return this.tokenizedSentence.slice(0, index).some((t) => t.featText === ",");
  }

  followsPlus(index: number): boolean {
    return this.tokenizedSentence.slice(0, index).some((t) => t.featText === "plus");
  }

  isCapitalised(token: string): boolean {
    return CAPITALISED_PATTERN.test(token);
  }

  isInsideParentheses(index: number): boolean {
    // If it's "(" or ")" (or square brackets), return True.
    if (["(", ")", "[", "]"].includes(this.tokenizedSentence[index].featText)) {
      return true;
    }

    const openParens: number[] = [];
    const closedParens: number[] = [];
    this.tokenizedSentence.forEach((token, i) => {
      if (token.featText === "(" || token.featText === "[") {
        openParens.push(i);
      } else if (token.featText === ")" || token.featText === "]") {
        closedParens.push(i);
      }
    });

    const pairs = Math.min(openParens.length, closedParens.length);
    for (let k = 0; k < pairs; k++) {
      if (openParens[k] < index && index < closedParens[k]) {
        return true;
      }
    }

    return false;
  }

  isAmbiguousUnit(token: string): boolean {
    return AMBIGUOUS_UNITS.includes(token);
  }

  private sentenceLengthBucket(): number {
    const length = this.tokenizedSentence.length;
    let bucket = 1;
    for (const lengthBucket of [2, 4, 8, 12, 16, 20, 32, 64]) {
      if (length >= lengthBucket) {
        bucket = lengthBucket;
      }
    }
    return bucket;
  }

  wordShape(token: string): string {
    const normalised = this.removeAccents(token);
    let shape = normalised.replace(LOWERCASE_PATTERN, "x");
    shape = shape.replace(UPPERCASE_PATTERN, "X");
    shape = shape.replace(DIGIT_PATTERN, "d");
    return shape;
  }

  private removeAccents(token: string): string {
    return token.normalize("NFD").replace(/\p{Mn}/gu, "");
  }

  private commonFeatures(index: number, prefix: string): FeatureDict {
    const token = this.tokenizedSentence[index];
    return {
      [prefix + "is_capitalised"]: token.features.isCapitalised,
      [prefix + "is_unit"]: token.features.isUnit,
      [prefix + "is_punc"]: token.features.isPunc,
      [prefix + "is_ambiguous"]: token.features.isAmbiguousUnit,
      [prefix + "is_in_parens"]: this.isInsideParentheses(index),
      [prefix + "is_after_comma"]: this.followsComma(index),
      [prefix + "is_after_plus"]: this.followsPlus(index),
      [prefix + "word_shape"]: token.features.shape,
      [prefix + "is_length_unit"]: this.isLengthUnit(index),
      [prefix + "is_dimension"]: this.isDimension(token.featText),
    };
  }

  private ngramFeatures(token: string, prefix: string): FeatureDict {
    const ngramFeatures: FeatureDict = {};
    const chars = Array.from(token);
    const len = chars.length;
    if (token !== "!num" && len >= 4) {
      ngramFeatures[prefix + "prefix_3"] = chars.slice(0, 3).join("");
      ngramFeatures[prefix + "suffix_3"] = chars.slice(len - 3).join("");
    }
    if (token !== "!num" && len >= 5) {
      ngramFeatures[prefix + "prefix_4"] = chars.slice(0, 4).join("");
      ngramFeatures[prefix + "suffix_4"] = chars.slice(len - 4).join("");
    }
    if (token !== "!num" && len >= 6) {
      ngramFeatures[prefix + "prefix_5"] = chars.slice(0, 5).join("");
      ngramFeatures[prefix + "suffix_5"] = chars.slice(len - 5).join("");
    }
    return ngramFeatures;
  }

  private posNgram(indices: number[]): string {
    return indices.map((i) => this.tokenizedSentence[i].posTag).join("+");
  }

  private tokenFeatures(token: Token): FeatureDict {
    const index = token.index;
    const features: FeatureDict = {};
    const seq = this.tokenizedSentence;

    features["bias"] = "";
    features["sentence_length"] = String(this.sentenceLengthBucket());

    // Features for current token.
    features["pos"] = token.posTag;
    features["stem"] = token.features.stem;
    if (token.featText !== token.features.stem) {
      features["token"] = token.featText;
    }

    Object.assign(features, this.commonFeatures(index, ""));
    Object.assign(features, this.ngramFeatures(token.featText, ""));
    Object.assign(features, this.sentenceStructure.tokenFeatures(index, ""));

    // Previous tokens.
    if (index > 0) {
      features["prev_stem"] = seq[index - 1].features.stem;
      features["prev_pos_ngram"] = this.posNgram([index - 1, index]);
      features["prev_pos"] = seq[index - 1].posTag;
      Object.assign(features, this.commonFeatures(index - 1, "prev_"));
      Object.assign(features, this.sentenceStructure.tokenFeatures(index - 1, "prev_"));
    }

    if (index > 1) {
      features["prev2_stem"] = seq[index - 2].features.stem;
      features["prev2_pos_ngram"] = this.posNgram([index - 2, index - 1, index]);
      features["prev2_pos"] = seq[index - 2].posTag;
      Object.assign(features, this.commonFeatures(index - 2, "prev2_"));
      Object.assign(features, this.sentenceStructure.tokenFeatures(index - 2, "prev2_"));
    }

    if (index > 2) {
      features["prev3_stem"] = seq[index - 3].features.stem;
      features["prev3_pos_ngram"] = this.posNgram([index - 3, index - 2, index - 1, index]);
      features["prev3_pos"] = seq[index - 3].posTag;
      Object.assign(features, this.commonFeatures(index - 3, "prev3_"));
      Object.assign(features, this.sentenceStructure.tokenFeatures(index - 3, "prev3_"));
    }

    // Next tokens.
    if (index < seq.length - 1) {
      features["next_stem"] = seq[index + 1].features.stem;
      features["next_pos_ngram"] = this.posNgram([index, index + 1]);
      features["next_pos"] = seq[index + 1].posTag;
      Object.assign(features, this.commonFeatures(index + 1, "next_"));
      Object.assign(features, this.sentenceStructure.tokenFeatures(index + 1, "next_"));
    }

    if (index < seq.length - 2) {
      features["next2_stem"] = seq[index + 2].features.stem;
      features["next2_pos_ngram"] = this.posNgram([index, index + 1, index + 2]);
      features["next2_pos"] = seq[index + 2].posTag;
      Object.assign(features, this.commonFeatures(index + 2, "next2_"));
      Object.assign(features, this.sentenceStructure.tokenFeatures(index + 2, "next2_"));
    }

    if (index < seq.length - 3) {
      features["next3_stem"] = seq[index + 3].features.stem;
      features["next3_pos_ngram"] = this.posNgram([index, index + 1, index + 2, index + 3]);
      features["next3_pos"] = seq[index + 3].posTag;
      Object.assign(features, this.commonFeatures(index + 3, "next3_"));
      Object.assign(features, this.sentenceStructure.tokenFeatures(index + 3, "next3_"));
    }

    return features;
  }

  sentenceFeatures(): FeatureDict[] {
    return this.tokenizedSentence.map((token) => this.tokenFeatures(token));
  }
}
