/**
 * Port of `upstream/ingredient_parser/en/postprocess.py`.
 *
 * The `PostProcessor` takes the labelled tokens, labels and scores produced by
 * the CRF model and turns them into a coherent `ParsedIngredient`.
 *
 * Binding notes:
 *  - Rule methods are ported verbatim (function-by-function, source order) and
 *    exposed as camelCased public methods so the ported tests can call them
 *    directly (Python's tests call the private `_`-prefixed methods).
 *  - The constructor mirrors Python's `PostProcessor.__init__`: positional
 *    `sentence`, `tokens` (labelled), `customUnits`, then camelCased keyword
 *    options.
 *  - `round()` -> `pyRound`; `statistics.mean` -> `mean`; `Fraction` -> `Frac`;
 *    dict-with-order -> `Map`/ordered arrays; Python negative indexing
 *    (`tokens[i - 1]` with `i == 0`) -> `Array.prototype.at`.
 *  - Foundation-foods matching is delegated to `./foundationfoods`
 *    (`matchFoundationFoods`), reachable when `foundationFoods` is enabled
 *    (default false).
 */

import { consume, groupConsecutiveIdx } from "../_common.js";
import { matchFoundationFoods } from "./foundationfoods/index.js";
import {
  CompositeIngredientAmount,
  type FoundationFood,
  type IngredientAmount,
  IngredientText,
  type LabelledToken,
  ParsedIngredient,
} from "../dataclasses.js";
import { pyRound } from "../py/pyops.js";
import {
  APPROXIMATE_PREFIXES,
  APPROXIMATE_SUFFIXES,
  INDEFINITE_QUANTIFIERS,
  PREPARED_INGREDIENT_TOKENS,
  SINGULAR_TOKENS,
  STOP_WORDS,
  STRING_NUMBERS_REGEXES,
} from "./_constants.js";
import { FRACTION_TOKEN_PATTERN } from "./_regex.js";
import {
  combineQuantitiesSplitByAnd,
  ingredientAmountFactory,
  pluraliseUnits,
  replaceStringRange,
} from "./_utils.js";
import type { VolumetricUnitsSystem } from "../units/registry.js";

/** Arithmetic mean of a non-empty list of numbers (Python `statistics.mean`). */
function mean(values: number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total / values.length;
}

/** True if `pair` is an element of `listOfLists` (Python `x in list_of_lists`). */
function pairInList(pair: string[], listOfLists: string[][]): boolean {
  return listOfLists.some(
    (candidate) =>
      candidate.length === pair.length && candidate.every((v, i) => v === pair[i]),
  );
}


/**
 * Dataclass for incrementally building ingredient amount information. Port of
 * `_PartialIngredientAmount`.
 *
 * The first four parameters are positional (matching Python's dataclass field
 * order); the remaining fields are grouped into `options`.
 */
export class PartialIngredientAmount {
  quantity: string;
  unit: string[];
  confidence: number[];
  startingIndex: number;
  relatedToPrevious: boolean;
  APPROXIMATE: boolean;
  SINGULAR: boolean;
  PREPARED_INGREDIENT: boolean;
  implicitQuantity: boolean;

  constructor(
    quantity: string,
    unit: string[],
    confidence: number[],
    startingIndex: number,
    options: {
      relatedToPrevious?: boolean;
      APPROXIMATE?: boolean;
      SINGULAR?: boolean;
      PREPARED_INGREDIENT?: boolean;
      implicitQuantity?: boolean;
    } = {},
  ) {
    this.quantity = quantity;
    this.unit = unit;
    this.confidence = confidence;
    this.startingIndex = startingIndex;
    this.relatedToPrevious = options.relatedToPrevious ?? false;
    this.APPROXIMATE = options.APPROXIMATE ?? false;
    this.SINGULAR = options.SINGULAR ?? false;
    this.PREPARED_INGREDIENT = options.PREPARED_INGREDIENT ?? false;
    this.implicitQuantity = options.implicitQuantity ?? false;
  }
}

/** Options for the `PostProcessor` constructor. Port of the `__init__` kwargs. */
export interface PostProcessorOptions {
  separateNames?: boolean;
  discardIsolatedStopWords?: boolean;
  stringUnits?: boolean;
  volumetricUnitsSystem?: VolumetricUnitsSystem;
  foundationFoods?: boolean;
}

/** Recipe ingredient sentence PostProcessor. Port of the `PostProcessor` class. */
export class PostProcessor {
  sentence: string;
  tokens: LabelledToken[];
  customUnits: Record<string, string>;
  separateNames: boolean;
  discardIsolatedStopWords: boolean;
  stringUnits: boolean;
  volumetricUnitsSystem: VolumetricUnitsSystem;
  foundationFoods: boolean;
  consumed: number[];

  private _parsed?: ParsedIngredient;

  constructor(
    sentence: string,
    labelledTokens: LabelledToken[],
    customUnits: Record<string, string>,
    options: PostProcessorOptions = {},
  ) {
    this.sentence = sentence;
    this.tokens = labelledTokens;
    this.customUnits = customUnits;
    this.separateNames = options.separateNames ?? true;
    this.discardIsolatedStopWords = options.discardIsolatedStopWords ?? true;
    this.stringUnits = options.stringUnits ?? false;
    this.volumetricUnitsSystem = options.volumetricUnitsSystem ?? "us_customary";
    this.foundationFoods = options.foundationFoods ?? false;
    this.consumed = [];
  }

  /** Port of `__repr__`. */
  repr(): string {
    return `PostProcessor("${this.sentence}")`;
  }

  /** Port of `__str__`. */
  toString(): string {
    const tokensLabels =
      "[" +
      this.tokens.map((t) => `('${t.text}', '${t.label}')`).join(", ") +
      "]";
    return ["Post-processed recipe ingredient sentence", `\t${tokensLabels}`].join("\n");
  }

  /** Return parsed ingredient data. Port of the `parsed` cached_property. */
  parsed(): ParsedIngredient {
    if (this._parsed !== undefined) {
      return this._parsed;
    }

    const amounts = this.postprocessAmounts();

    let name: IngredientText[];
    let foundationfoods: FoundationFood[] = [];
    if (this.separateNames) {
      [name, foundationfoods] = this.postprocessNames();
    } else {
      // Replace all labels containing NAME with "NAME".
      for (const t of this.tokens) {
        if (t.label.includes("NAME")) {
          t.label = "NAME";
        }
      }

      const processedName = this.postprocess("NAME");
      if (processedName) {
        name = [processedName];
        if (this.foundationFoods) {
          const namePos = this.tokens
            .filter((t) => t.label === "NAME")
            .map((t) => [t.text, t.posTag] as [string, string]);
          const nameTokens = namePos.map((p) => p[0]);
          const posTags = namePos.map((p) => p[1]);
          const ff = matchFoundationFoods(nameTokens, posTags, 0);
          if (ff) {
            foundationfoods = [ff];
          }
        }
      } else {
        name = [];
      }
    }

    const size = this.postprocess("SIZE");
    const preparation = this.postprocess("PREP");
    const comment = this.postprocess("COMMENT");
    const purpose = this.postprocess("PURPOSE");

    this._parsed = new ParsedIngredient({
      name,
      size,
      amount: amounts,
      preparation,
      comment,
      purpose,
      foundationFoods: foundationfoods,
      sentence: this.sentence,
    });
    return this._parsed;
  }

  /** Process tokens with `selectedLabel` into an IngredientText. Port of `_postprocess`. */
  postprocess(selectedLabel: string): IngredientText | null {
    const labelIdx: number[] = [];
    this.tokens.forEach((t, i) => {
      if (
        (t.label === selectedLabel || t.label === "PUNC") &&
        !this.consumed.includes(i)
      ) {
        labelIdx.push(i);
      }
    });

    if (
      labelIdx.length === 0 ||
      labelIdx.every((i) => this.tokens[i]!.label === "PUNC")
    ) {
      return null;
    }

    return this.postprocessIndices(labelIdx, selectedLabel);
  }

  /** Process tokens for the ingredient name(s). Port of `_postprocess_names`. */
  postprocessNames(): [IngredientText[], FoundationFood[]] {
    const nameIdx: number[] = [];
    this.tokens.forEach((t, i) => {
      if (
        (t.label.includes("NAME") || t.label === "PUNC") &&
        !this.consumed.includes(i)
      ) {
        nameIdx.push(i);
      }
    });

    if (
      nameIdx.length === 0 ||
      nameIdx.every((i) => this.tokens[i]!.label === "PUNC")
    ) {
      return [[], []];
    }

    const nameLabels = nameIdx.map((i) => this.tokens[i]!.label);
    const bioGroups = this.groupNameLabels(nameLabels);
    const constructedNames = this.constructNamesFromBioGroups(bioGroups);
    return this.convertNameIndicesToObject(nameIdx, constructedNames);
  }

  /** Merge a list of IngredientText objects into one. Port of `_merge`. */
  merge(objs: IngredientText[]): IngredientText {
    const sortedObjs = [...objs].sort((a, b) => a.startingIndex - b.startingIndex);

    const uniqueTexts = new Set(sortedObjs.map((n) => n.text));
    let text: string;
    if (uniqueTexts.size === 1) {
      text = sortedObjs[0]!.text;
    } else {
      text = sortedObjs.map((n) => n.text).join(" ");
    }

    return new IngredientText({
      text,
      confidence: pyRound(mean(sortedObjs.map((n) => n.confidence)), 6),
      startingIndex: Math.min(...sortedObjs.map((n) => n.startingIndex)),
    });
  }

  /** Group name labels according to label type. Port of `_group_name_labels`. */
  groupNameLabels(nameLabels: string[]): [number, string][][] {
    const nameGroups: [number, string][][] = [];
    let currentGroup: [number, string][] = [];
    let prevLabel: string | null = null;

    nameLabels.forEach((label, idx) => {
      if (label === "NAME_SEP") {
        if (currentGroup.length > 0) {
          nameGroups.push(currentGroup);
        }
        currentGroup = [];
      } else if (label.startsWith("B_")) {
        if (currentGroup.length > 0) {
          nameGroups.push(currentGroup);
        }
        currentGroup = [[idx, label]];
      } else if (label === "NAME_MOD" || label === "NAME_VAR") {
        if (prevLabel === label) {
          currentGroup.push([idx, label]);
        } else {
          if (currentGroup.length > 0) {
            nameGroups.push(currentGroup);
          }
          currentGroup = [[idx, label]];
        }
      } else {
        currentGroup.push([idx, label]);
      }

      prevLabel = label;
    });

    if (currentGroup.length > 0) {
      nameGroups.push(currentGroup);
    }

    return nameGroups;
  }

  /** Construct names from BIO groups. Port of `_construct_names_from_bio_groups`. */
  constructNamesFromBioGroups(nameGroups: [number, string][][]): number[][] {
    let constructedNames: number[][] = [];

    let lastEncounteredName: number[] | null = null;
    let lastEncounteredNameUsed = false;

    for (let g = nameGroups.length - 1; g >= 0; g--) {
      const group = nameGroups[g]!;
      const currentGroupIdx = group.map((t) => t[0]);
      const labels = group.map((t) => t[1]);
      const currentLabel = this.getNameGroupLabel(labels);

      if (currentLabel === "TOK") {
        if (lastEncounteredName && !lastEncounteredNameUsed) {
          constructedNames.push(lastEncounteredName);
        }
        lastEncounteredName = currentGroupIdx;
        lastEncounteredNameUsed = false;
      } else if (currentLabel === "VAR") {
        if (lastEncounteredName) {
          constructedNames.push([...currentGroupIdx, ...lastEncounteredName]);
          lastEncounteredNameUsed = true;
        } else {
          constructedNames.push(currentGroupIdx);
        }
      } else if (currentLabel === "MOD") {
        if (lastEncounteredName && !lastEncounteredNameUsed) {
          constructedNames.push(lastEncounteredName);
          lastEncounteredNameUsed = true;
        }
        constructedNames = constructedNames.map((name) => [...currentGroupIdx, ...name]);
      }
    }

    if (lastEncounteredName && !lastEncounteredNameUsed) {
      constructedNames.push(lastEncounteredName);
    }

    return constructedNames.reverse();
  }

  /** Get the NAME label type for a group. Port of `_get_name_group_label`. */
  getNameGroupLabel(labels: string[]): string {
    for (const label of labels) {
      if (label !== "PUNC") {
        const parts = label.split("_");
        return parts[parts.length - 1]!;
      }
    }
    return "";
  }

  /** Convert grouped name indices to IngredientText objects. Port of `_convert_name_indices_to_object`. */
  convertNameIndicesToObject(
    nameIdx: number[],
    nameIndexGroups: number[][],
  ): [IngredientText[], FoundationFood[]] {
    let mergeWithNext = false;
    let mergeWithNextIdx: number[] = [];

    const mergedNameIdx: number[][] = [];
    for (const group of nameIndexGroups) {
      let tokenIdx = group.map((idx) => nameIdx[idx]!);

      if (mergeWithNext && mergeWithNextIdx.length > 0) {
        tokenIdx = [...mergeWithNextIdx, ...tokenIdx];
      }

      if (["DT", "IN", "JJ"].includes(this.lastNonPuncTokenPos(tokenIdx))) {
        mergeWithNext = true;
        mergeWithNextIdx = tokenIdx;
        continue;
      } else {
        mergedNameIdx.push(tokenIdx);
        mergeWithNext = false;
        mergeWithNextIdx = [];
      }
    }

    if (mergeWithNext && mergeWithNextIdx.length > 0) {
      mergedNameIdx.push(mergeWithNextIdx);
    }

    const names: IngredientText[] = [];
    const foundationFoods: FoundationFood[] = [];
    for (const tokenIdx of mergedNameIdx) {
      const ingText = this.postprocessIndices(tokenIdx, "NAME");
      if (!ingText) {
        continue;
      }

      if (names.some((n) => n.text === ingText.text)) {
        const dupeIdx: number[] = [];
        names.forEach((n, i) => {
          if (n.text === ingText.text) {
            dupeIdx.push(i);
          }
        });
        const merged = this.merge([...dupeIdx.map((i) => names[i]!), ingText]);
        names[dupeIdx[0]!] = merged;
      } else {
        names.push(ingText);

        if (this.foundationFoods) {
          const tokens = tokenIdx.map((i) => this.tokens[i]!.text);
          const posTags = tokenIdx.map((i) => this.tokens[i]!.posTag);
          const ff = matchFoundationFoods(tokens, posTags, names.length - 1);
          if (ff) {
            foundationFoods.push(ff);
          }
        }
      }
    }

    return [names, foundationFoods];
  }

  /** Return the POS tag at the last non-punctuation index. Port of `_last_non_punc_token_pos`. */
  lastNonPuncTokenPos(tokenIdx: number[]): string {
    for (let k = tokenIdx.length - 1; k >= 0; k--) {
      const idx = tokenIdx[k]!;
      if (this.tokens[idx]!.label === "PUNC") {
        continue;
      }
      return this.tokens[idx]!.posTag;
    }
    return "";
  }

  /** Process token indices into a single IngredientText. Port of `_postprocess_indices`. */
  postprocessIndices(labelIdx: number[], selectedLabel: string): IngredientText | null {
    const parts: string[] = [];
    let confidenceParts: number[] = [];
    let startingIndex = labelIdx[labelIdx.length - 1]!;

    for (const group of groupConsecutiveIdx(labelIdx)) {
      let idx = [...group];
      idx = this.removeInvalidIndices(idx);

      if (idx.every((i) => this.tokens[i]!.label === "PUNC")) {
        continue;
      }

      const groupTokens: string[] = [];
      for (const i of idx) {
        if (FRACTION_TOKEN_PATTERN.test(this.tokens[i]!.text)) {
          let textFraction = this.tokens[i]!.text
            .replace(/#/g, " ")
            .replace(/\$/g, "/")
            .trim();
          textFraction = textFraction.replace(/- /g, "-");
          groupTokens.push(textFraction);
        } else {
          groupTokens.push(this.tokens[i]!.text);
        }
      }

      const joined = groupTokens.join(" ");
      const confidence = mean(idx.map((i) => this.tokens[i]!.score));

      if (this.discardIsolatedStopWords && STOP_WORDS.has(joined.toLowerCase())) {
        continue;
      }

      this.consumed.push(...idx);
      parts.push(joined);
      confidenceParts.push(confidence);
      startingIndex = Math.min(startingIndex, idx[0]!);
    }

    const keepIdx = this.removeAdjacentDuplicates(parts);
    const keptParts = keepIdx.map((i) => parts[i]!);
    confidenceParts = keepIdx.map((i) => confidenceParts[i]!);

    let text: string;
    if (selectedLabel === "NAME") {
      text = keptParts.join(" ");
    } else {
      text = keptParts.join(", ");
    }
    text = this.fixPunctuation(text);
    text = pluraliseUnits(text, this.customUnits);

    if (keptParts.length === 0) {
      return null;
    }

    return new IngredientText({
      text,
      confidence: pyRound(mean(confidenceParts), 6),
      startingIndex,
    });
  }

  /** Process tokens into IngredientAmounts. Port of `_postprocess_amounts`. */
  postprocessAmounts(): (IngredientAmount | CompositeIngredientAmount)[] {
    this.convertStringNumberQty();

    const funcs = [
      (tokens: LabelledToken[]) => this.sizeableUnitPattern(tokens),
      (tokens: LabelledToken[]) => this.compositeAmountsPattern(tokens),
      (tokens: LabelledToken[]) => this.fallbackPattern(tokens),
    ];

    const amounts: (IngredientAmount | CompositeIngredientAmount)[] = [];
    for (const func of funcs) {
      const tokens = this.unconsumed(this.tokens);
      const parsedAmounts = func(tokens);
      amounts.push(...parsedAmounts);
    }

    return amounts.sort((a, b) => a.startingIndex - b.startingIndex);
  }

  /** Return elements whose index is not consumed. Port of `_unconsumed`. */
  unconsumed(list: LabelledToken[]): LabelledToken[] {
    return list.filter((el) => !this.consumed.includes(el.index));
  }

  /** Remove indices of tokens that aren't valid in the group. Port of `_remove_invalid_indices`. */
  removeInvalidIndices(idx: number[]): number[] {
    const leadingInvalid = [
      ")", "]", "}", ",", ":", ";", "-", ".", "!", "?", "*", "&", "/", "--",
    ];
    const trailingInvalid = [
      "[", "(", "{", ",", ":", ";", "-", "&", "/", "*", "--", "+",
    ];

    while (idx.length > 1 && leadingInvalid.includes(this.tokens[idx[0]!]!.text)) {
      idx = idx.slice(1);
    }

    while (
      idx.length > 1 &&
      trailingInvalid.includes(this.tokens[idx[idx.length - 1]!]!.text)
    ) {
      idx = idx.slice(0, -1);
    }

    // Remove brackets that aren't part of a matching pair.
    const idxToRemove: number[] = [];
    let tokName: string | null = null;
    const stack = new Map<string, number[]>();
    const getStack = (name: string): number[] => {
      let s = stack.get(name);
      if (s === undefined) {
        s = [];
        stack.set(name, s);
      }
      return s;
    };

    const toks = idx.map((i) => this.tokens[i]!.text);
    toks.forEach((tok, i) => {
      if (tok === "(" || tok === ")") {
        tokName = "PAREN";
      } else if (tok === "[" || tok === "]") {
        tokName = "SQAURE";
      }

      if (tok === "(" || tok === "[") {
        getStack(tokName!).push(i);
      } else if (tok === ")" || tok === "]") {
        const s = getStack(tokName!);
        if (s.length === 0) {
          idxToRemove.push(i);
        } else {
          s.pop();
        }
      }
    });

    for (const stackIdx of stack.values()) {
      idxToRemove.push(...stackIdx);
    }
    idx = idx.filter((_, i) => !idxToRemove.includes(i));

    return idx;
  }

  /** Fix common punctuation errors from combining tokens. Port of `_fix_punctuation`. */
  fixPunctuation(text: string): string {
    if (text === "") {
      return text;
    }

    text = text.replace(/\( /g, "(").replace(/ \)/g, ")");
    text = text.replace(/ \/ /g, "/");

    for (const punc of [",", ":", ";", ".", "!", "?", "*"]) {
      text = text.split(` ${punc}`).join(punc);
    }

    return text.trim();
  }

  /** Find indices of adjacent duplicate strings. Port of `_remove_adjacent_duplicates`. */
  removeAdjacentDuplicates(parts: string[]): number[] {
    const idxToKeep: number[] = [];
    const extended = [...parts, ""];
    for (let i = 0; i < extended.length - 1; i++) {
      const first = extended[i]!;
      const second = extended[i + 1]!;
      if (first !== second) {
        idxToKeep.push(i);
      }
    }
    return idxToKeep;
  }

  /** Replace string numbers (e.g. "one") with numeric values. Port of `_replace_string_numbers`. */
  replaceStringNumbers(text: string): string {
    for (const [regex, substitution] of STRING_NUMBERS_REGEXES.values()) {
      text = text.replace(regex, substitution);
    }
    return text;
  }

  /** Convert QTY tokens that are string numbers to numeric values. Port of `_convert_string_number_qty`. */
  convertStringNumberQty(): void {
    for (const t of this.tokens) {
      if (t.label === "QTY") {
        this.tokens[t.index]!.text = this.replaceStringNumbers(t.text);
      }
    }

    const qtyIdx = this.tokens.filter((t) => t.label === "QTY").map((t) => t.index);

    const idxToRemove: number[] = [];
    for (const idxGroup of groupConsecutiveIdx(qtyIdx)) {
      if (idxGroup.length === 1) {
        continue;
      }

      const fragment = idxGroup.map((i) => this.tokens[i]!.text).join(" ");

      let replacement = combineQuantitiesSplitByAnd(fragment);
      if (replacement !== fragment) {
        const modIdx = idxGroup[0]!;
        this.tokens[modIdx]!.score = mean(idxGroup.map((i) => this.tokens[i]!.score));
        this.tokens[modIdx]!.text = replacement;
        idxToRemove.push(...idxGroup.slice(1));
        continue;
      }

      replacement = replaceStringRange(fragment);
      if (replacement !== fragment) {
        const modIdx = idxGroup[0]!;
        this.tokens[modIdx]!.score = mean(idxGroup.map((i) => this.tokens[i]!.score));
        this.tokens[modIdx]!.text = replacement;
        idxToRemove.push(...idxGroup.slice(1));
        continue;
      }
    }

    if (idxToRemove.length > 0) {
      this.tokens = this.tokens.filter((t) => !idxToRemove.includes(t.index));
    }
  }

  /** Identify the "sizeable unit" pattern. Port of `_sizeable_unit_pattern`. */
  sizeableUnitPattern(tokens: LabelledToken[]): IngredientAmount[] {
    const patterns = [
      ["QTY", "QTY", "UNIT", "QTY", "UNIT", "QTY", "UNIT", "UNIT"],
      ["QTY", "QTY", "UNIT", "QTY", "UNIT", "UNIT"],
      ["QTY", "QTY", "UNIT", "UNIT"],
      ["QTY", "UNIT", "UNIT"],
    ];

    const endUnits = [
      "bag", "block", "bottle", "box", "bucket", "can", "carton", "container",
      "envelope", "jar", "loaf", "package", "packet", "piece", "sachet", "slice",
      "tin",
    ];

    const amounts: IngredientAmount[] = [];
    for (const pattern of patterns) {
      for (const match of this.matchPattern(tokens, pattern, true)) {
        if (match.some((i) => this.consumed.includes(tokens[i]!.index))) {
          continue;
        }

        if (endUnits.includes(tokens[match[match.length - 1]!]!.text)) {
          const matchingTokens = match.map((i) => tokens[i]!.text);
          const matchingScores = match.map((i) => tokens[i]!.score);

          this.consumed.push(...match.map((i) => tokens[i]!.index));

          let first: IngredientAmount;
          if (pattern === patterns[3]) {
            // ["QTY", "UNIT", "UNIT"] — no explicit count.
            const unit = matchingTokens.pop()!;
            first = ingredientAmountFactory(
              "1",
              unit,
              "1 " + unit,
              matchingScores.pop()!,
              tokens[match[0]!]!.index,
              {
                APPROXIMATE: this.isApproximate(match[0]!, tokens),
                stringUnits: this.stringUnits,
                volumetricUnitsSystem: this.volumetricUnitsSystem,
                customUnits: this.customUnits,
              },
            );
            amounts.push(first);
            match.pop();
          } else {
            const quantity = matchingTokens.shift()!;
            const unit = matchingTokens.pop()!;
            const text = [quantity, unit].join(" ").trim();

            first = ingredientAmountFactory(
              quantity,
              unit,
              text,
              mean([matchingScores.shift()!, matchingScores.pop()!]),
              tokens[match[0]!]!.index,
              {
                APPROXIMATE: this.isApproximate(match[0]!, tokens),
                stringUnits: this.stringUnits,
                volumetricUnitsSystem: this.volumetricUnitsSystem,
                customUnits: this.customUnits,
              },
            );
            amounts.push(first);
            match.shift();
            match.pop();
          }

          for (let i = 0; i < matchingTokens.length; i += 2) {
            const quantity = matchingTokens[i]!;
            const unit = matchingTokens[i + 1]!;
            const text = [quantity, unit].join(" ").trim();
            const confidence = mean(matchingScores.slice(i, i + 1));

            const amount = ingredientAmountFactory(
              quantity,
              unit,
              text,
              confidence,
              tokens[match[i]!]!.index,
              {
                SINGULAR: true,
                APPROXIMATE: first.APPROXIMATE,
                stringUnits: this.stringUnits,
                volumetricUnitsSystem: this.volumetricUnitsSystem,
                customUnits: this.customUnits,
              },
            );
            amounts.push(amount);
          }
        }
      }
    }

    return amounts;
  }

  /** Identify composite amount patterns. Port of `_composite_amounts_pattern`. */
  compositeAmountsPattern(tokens: LabelledToken[]): CompositeIngredientAmount[] {
    interface PatternInfo {
      pattern: string[];
      conjunction: string | null;
      conjIndex: number | null;
      start1: number;
      start2: number;
      join: string;
      subtractive: boolean;
    }

    const patterns: [string, PatternInfo][] = [
      ["ptfloz", { pattern: ["QTY", "UNIT", "QTY", "UNIT", "UNIT"], conjunction: null, conjIndex: null, start1: 0, start2: 2, join: "", subtractive: false }],
      ["lboz", { pattern: ["QTY", "UNIT", "QTY", "UNIT"], conjunction: null, conjIndex: null, start1: 0, start2: 2, join: "", subtractive: false }],
      ["plus", { pattern: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT"], conjunction: "plus", conjIndex: 2, start1: 0, start2: 3, join: " plus ", subtractive: false }],
      ["plus_punc", { pattern: ["QTY", "UNIT", "PUNC", "QTY", "UNIT"], conjunction: "+", conjIndex: 2, start1: 0, start2: 3, join: " + ", subtractive: false }],
      ["plus_punc_comment", { pattern: ["QTY", "UNIT", "PUNC", "COMMENT", "QTY", "UNIT"], conjunction: "plus", conjIndex: 3, start1: 0, start2: 4, join: " plus ", subtractive: false }],
      ["and", { pattern: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT"], conjunction: "and", conjIndex: 2, start1: 0, start2: 3, join: " and ", subtractive: false }],
      ["minus", { pattern: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT"], conjunction: "minus", conjIndex: 2, start1: 0, start2: 3, join: " minus ", subtractive: true }],
      ["less", { pattern: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT"], conjunction: "less", conjIndex: 2, start1: 0, start2: 3, join: " minus ", subtractive: true }],
    ];

    const validFirstUnits = new Set(["lb", "pound", "pt", "pint"]);
    const validLastUnits = new Set(["oz", "ounce"]);

    const compositeAmounts: CompositeIngredientAmount[] = [];
    for (const [patternName, patternInfo] of patterns) {
      const { pattern, start1, start2, join, conjIndex, subtractive } = patternInfo;

      for (const match of this.matchPattern(tokens, pattern, false)) {
        if (patternName === "ptfloz" || patternName === "lboz") {
          const firstUnit = tokens[match[start1 + 1]!]!.text;
          const lastUnit = tokens[match[match.length - 1]!]!.text;
          if (!validFirstUnits.has(firstUnit) || !validLastUnits.has(lastUnit)) {
            continue;
          }
        } else if (
          tokens[match[conjIndex!]!]!.text.toLowerCase() !== patternInfo.conjunction
        ) {
          continue;
        }

        // First amount.
        const mstart1 = match[start1]!;
        const quantity1 = tokens[mstart1]!.text;
        const unit1 = tokens[match[start1 + 1]!]!.text;
        const score1 = mean(
          match.slice(start1, start1 + 2).map((i) => tokens[i]!.score),
        );
        const text1 = [quantity1, unit1].join(" ").trim();

        const firstAmount = ingredientAmountFactory(quantity1, unit1, text1, score1, tokens[mstart1]!.index, {
          stringUnits: this.stringUnits,
          volumetricUnitsSystem: this.volumetricUnitsSystem,
          customUnits: this.customUnits,
        });

        // Second amount.
        const mstart2 = match[start2]!;
        const quantity2 = tokens[mstart2]!.text;
        const unit2 = match.slice(start2 + 1).map((i) => tokens[i]!.text).join(" ");
        const score2 = mean(match.slice(start2).map((i) => tokens[i]!.score));
        const text2 = [quantity2, unit2].join(" ").trim();

        const secondAmount = ingredientAmountFactory(quantity2, unit2, text2, score2, tokens[mstart2]!.index, {
          stringUnits: this.stringUnits,
          volumetricUnitsSystem: this.volumetricUnitsSystem,
          customUnits: this.customUnits,
        });

        // Flags (mirrors the Python source, including its `_is_prepared`
        // typos in the `approximate` expression).
        const prepared =
          this.isPrepared(tokens[mstart1]!.index, tokens) ||
          this.isPrepared(tokens[mstart2]!.index, tokens);

        let approximate =
          this.isApproximate(tokens[mstart1]!.index, tokens) ||
          this.isPrepared(tokens[mstart2]!.index, tokens);

        let singular =
          this.isSingular(tokens[mstart1 + 1]!.index, tokens) ||
          this.isSingular(tokens[match[match.length - 1]!]!.index, tokens);

        if (
          this.isSingularAndApproximate(tokens[mstart1]!.index, tokens) ||
          this.isSingularAndApproximate(tokens[mstart2]!.index, tokens)
        ) {
          approximate = true;
          singular = true;
        }

        if (approximate) {
          firstAmount.APPROXIMATE = true;
          secondAmount.APPROXIMATE = true;
        }

        if (singular) {
          firstAmount.SINGULAR = true;
          secondAmount.SINGULAR = true;
        }

        if (prepared) {
          firstAmount.PREPARED_INGREDIENT = true;
          secondAmount.PREPARED_INGREDIENT = true;
        }

        compositeAmounts.push(
          new CompositeIngredientAmount({
            amounts: [firstAmount, secondAmount],
            join,
            subtractive,
          }),
        );

        this.consumed.push(...match.map((i) => tokens[i]!.index));
      }
    }

    return compositeAmounts;
  }

  /** Find a pattern of labels, returning matching indices. Port of `_match_pattern`. */
  matchPattern(
    tokens: LabelledToken[],
    pattern: string[],
    ignoreOtherLabels = true,
  ): number[][] {
    const labels = tokens.map((t) => t.label);

    const plen = pattern.length;
    const plabels = new Set(pattern);

    let lbls: string[];
    let idx: number[];
    if (ignoreOtherLabels) {
      lbls = [];
      idx = [];
      labels.forEach((label, i) => {
        if (plabels.has(label)) {
          lbls.push(label);
          idx.push(i);
        }
      });
    } else {
      lbls = labels;
      idx = labels.map((_, i) => i);
    }

    if (pattern.length > lbls.length) {
      return [];
    }

    const matches: number[][] = [];
    const indices = (function* () {
      for (let i = 0; i < lbls.length; i++) yield i;
    })();
    for (const i of indices) {
      const slice = lbls.slice(i, i + plen);
      if (
        lbls[i] === pattern[0] &&
        slice.length === plen &&
        slice.every((v, j) => v === pattern[j])
      ) {
        matches.push(idx.slice(i, i + plen));
        consume(indices, plen - 1);
      }
    }

    return matches;
  }

  /** Fallback pattern for grouping quantities and units. Port of `_fallback_pattern`. */
  fallbackPattern(tokens: LabelledToken[]): IngredientAmount[] {
    const amounts: PartialIngredientAmount[] = [];

    const relatedIdx = tokens
      .filter((t) => t.text === "(" || t.text === "/" || t.text === "[")
      .map((t) => t.index + 1);

    tokens.forEach((token, i) => {
      if (token.label === "QTY") {
        if (token.text === "dozen" && tokens.at(i - 1)!.label === "QTY") {
          const last = amounts[amounts.length - 1]!;
          last.quantity = last.quantity + " dozen";
          last.confidence.push(token.score);
        } else if (
          tokens.at(i - 1)!.label === "QTY" &&
          tokens.at(i - 1)!.text.endsWith("x")
        ) {
          amounts.push(
            new PartialIngredientAmount(token.text, [], [token.score], token.index, {
              relatedToPrevious: true,
            }),
          );
        } else {
          amounts.push(
            new PartialIngredientAmount(token.text, [], [token.score], token.index, {
              relatedToPrevious: relatedIdx.includes(i),
            }),
          );
        }
      }

      if (token.label === "UNIT") {
        if (amounts.length === 0) {
          let implicitQuantity = false;
          let quantity = "";
          const priorTexts = new Set(tokens.slice(0, i).map((t) => t.text.toLowerCase()));
          const hasIndefinite = [...INDEFINITE_QUANTIFIERS].some((q) => priorTexts.has(q));
          if (!token.plural && !hasIndefinite) {
            quantity = "1";
            implicitQuantity = true;
          }

          amounts.push(
            new PartialIngredientAmount(quantity, [], [token.score], token.index, {
              implicitQuantity,
            }),
          );
        }

        let text = token.text;
        const last = amounts[amounts.length - 1]!;
        if (token.plural && last.implicitQuantity) {
          last.quantity = "";
          last.implicitQuantity = false;
          text = pluraliseUnits(token.text, this.customUnits);
        } else if (token.plural && last.quantity === "") {
          text = pluraliseUnits(token.text, this.customUnits);
        }

        last.unit.push(text);
        last.confidence.push(token.score);
      }

      if (this.isApproximate(i, tokens)) {
        amounts[amounts.length - 1]!.APPROXIMATE = true;
      }

      if (this.isSingular(i, tokens)) {
        amounts[amounts.length - 1]!.SINGULAR = true;
      }

      if (this.isSingularAndApproximate(i, tokens)) {
        amounts[amounts.length - 1]!.APPROXIMATE = true;
        amounts[amounts.length - 1]!.SINGULAR = true;
      }

      if (this.isPrepared(i, tokens)) {
        amounts[amounts.length - 1]!.PREPARED_INGREDIENT = true;
      }
    });

    const distributed = this.distributeRelatedFlags(amounts);

    const processedAmounts: IngredientAmount[] = [];
    for (const amount of distributed) {
      const unit = amount.unit.join(" ");
      const text = [amount.quantity, unit].join(" ").trim();

      processedAmounts.push(
        ingredientAmountFactory(amount.quantity, unit, text, mean(amount.confidence), amount.startingIndex, {
          APPROXIMATE: amount.APPROXIMATE,
          SINGULAR: amount.SINGULAR,
          PREPARED_INGREDIENT: amount.PREPARED_INGREDIENT,
          stringUnits: this.stringUnits,
          volumetricUnitsSystem: this.volumetricUnitsSystem,
          customUnits: this.customUnits,
        }),
      );
    }

    return processedAmounts;
  }

  /** True if token at index is approximate. Port of `_is_approximate`. */
  isApproximate(i: number, tokens: LabelledToken[]): boolean {
    if (
      tokens[i]!.label === "QTY" &&
      i > 0 &&
      APPROXIMATE_PREFIXES.includes(tokens[i - 1]!.text.toLowerCase())
    ) {
      this.consumed.push(tokens[i - 1]!.index);
      return true;
    } else if (
      tokens[i]!.label === "QTY" &&
      i > 1 &&
      tokens[i - 1]!.text === "." &&
      APPROXIMATE_PREFIXES.includes(tokens[i - 2]!.text.toLowerCase())
    ) {
      this.consumed.push(tokens[i - 1]!.index);
      this.consumed.push(tokens[i - 2]!.index);
      return true;
    } else if (
      tokens[i]!.label === "UNIT" &&
      i > 0 &&
      APPROXIMATE_PREFIXES.includes(tokens[i - 1]!.text.toLowerCase())
    ) {
      this.consumed.push(tokens[i - 1]!.index);
      return true;
    } else if (
      (tokens[i]!.label === "UNIT" || tokens[i]!.label === "QTY") &&
      i < this.tokens.length - 2 &&
      pairInList(
        tokens.slice(i + 1, i + 3).map((t) => t.text.toLowerCase()),
        APPROXIMATE_SUFFIXES,
      )
    ) {
      this.consumed.push(tokens[i + 1]!.index);
      this.consumed.push(tokens[i + 2]!.index);
      return true;
    }

    return false;
  }

  /** True if token at index is singular. Port of `_is_singular`. */
  isSingular(i: number, tokens: LabelledToken[]): boolean {
    if (i === tokens.length - 1) {
      return false;
    }

    if (
      tokens[i]!.label === "UNIT" &&
      SINGULAR_TOKENS.includes(tokens[i + 1]!.text.toLowerCase())
    ) {
      this.consumed.push(tokens[i + 1]!.index);
      return true;
    }

    if (i === tokens.length - 2) {
      return false;
    }

    if (
      tokens[i]!.label === "UNIT" &&
      (tokens[i + 1]!.text === ")" || tokens[i + 1]!.text === "]") &&
      SINGULAR_TOKENS.includes(tokens[i + 2]!.text.toLowerCase())
    ) {
      this.consumed.push(tokens[i + 2]!.index);
      return true;
    }

    return false;
  }

  /** True if token at index is singular and approximate. Port of `_is_singular_and_approximate`. */
  isSingularAndApproximate(i: number, tokens: LabelledToken[]): boolean {
    if (
      tokens[i]!.label === "QTY" &&
      i > 1 &&
      APPROXIMATE_PREFIXES.includes(tokens[i - 1]!.text.toLowerCase()) &&
      SINGULAR_TOKENS.includes(tokens[i - 2]!.text.toLowerCase())
    ) {
      this.consumed.push(tokens[i - 1]!.index);
      this.consumed.push(tokens[i - 2]!.index);
      return true;
    } else if (
      tokens[i]!.label === "UNIT" &&
      i < this.tokens.length - 3 &&
      pairInList(
        tokens.slice(i + 1, i + 3).map((t) => t.text.toLowerCase()),
        APPROXIMATE_SUFFIXES,
      ) &&
      SINGULAR_TOKENS.includes(tokens[i + 3]!.text.toLowerCase())
    ) {
      this.consumed.push(tokens[i + 1]!.index);
      this.consumed.push(tokens[i + 2]!.index);
      this.consumed.push(tokens[i + 3]!.index);
      return true;
    }

    return false;
  }

  /** True if token at index refers to the prepared ingredient. Port of `_is_prepared`. */
  isPrepared(i: number, tokens: LabelledToken[]): boolean {
    if (i < 2) {
      return false;
    }

    if (tokens[i]!.label !== "QTY") {
      return false;
    }

    for (const pattern of PREPARED_INGREDIENT_TOKENS) {
      if (
        pairInList([tokens[i - 2]!.text.toLowerCase(), tokens[i - 1]!.text.toLowerCase()], [pattern])
      ) {
        this.consumed.push(tokens[i - 1]!.index);
        this.consumed.push(tokens[i - 2]!.index);
        return true;
      } else if (
        i > 2 &&
        APPROXIMATE_PREFIXES.includes(tokens[i - 1]!.text.toLowerCase()) &&
        pairInList([tokens[i - 3]!.text.toLowerCase(), tokens[i - 2]!.text.toLowerCase()], [pattern])
      ) {
        this.consumed.push(tokens[i - 2]!.index);
        this.consumed.push(tokens[i - 3]!.index);
        return true;
      }
    }

    return false;
  }

  /** Distribute set flags to related amounts. Port of `_distribute_related_flags`. */
  distributeRelatedFlags(amounts: PartialIngredientAmount[]): PartialIngredientAmount[] {
    const grouped: PartialIngredientAmount[][] = [];
    for (const amount of amounts) {
      if (grouped.length > 0 && amount.relatedToPrevious) {
        grouped[grouped.length - 1]!.push(amount);
      } else {
        grouped.push([amount]);
      }
    }

    for (const group of grouped) {
      if (group.some((am) => am.APPROXIMATE)) {
        for (const am of group) {
          am.APPROXIMATE = true;
        }
      }

      if (group.some((am) => am.SINGULAR)) {
        for (const am of group) {
          am.SINGULAR = true;
        }
      }

      if (group.some((am) => am.PREPARED_INGREDIENT)) {
        for (const am of group) {
          am.PREPARED_INGREDIENT = true;
        }
      }

      let singularAfterMultiplier = false;
      for (const amount of group) {
        if (singularAfterMultiplier) {
          amount.SINGULAR = true;
          continue;
        }

        if (amount.quantity.endsWith("x")) {
          singularAfterMultiplier = true;
        }
      }
    }

    return grouped.flat();
  }
}
