/**
 * Port of `upstream/ingredient_parser/en/_structure_features.py`.
 *
 * Detects sentence-structure phrases (multi-ingredient phrases, compound
 * sentence splits, example phrases, dimensional phrases) using a port of
 * nltk's RegexpParser (see `../nlp/chunker.ts`).
 */

import type { Token } from "../dataclasses.js";
import { DIMENSIONS, FLATTENED_UNITS_LIST, LENGTH_UNITS, SIZES } from "./_constants.js";
import { RegexpParser, Tree, type Leaf, type TreeChild } from "../nlp/chunker.js";

// Lists of (token, pos) pairs for identifying the start of example phrases.
// For example phrases starting with an preposition/subordinating conjunction (IN)
const EXAMPLE_PHRASE_START_IN: Leaf[] = [
  ["AS", "IN"],
  ["LIKE", "IN"],
  ["E.G.", "IN"],
];
// For example phrase starting with a JJ-IN pair
const EXAMPLE_PHRASE_START_JJ: Leaf[][] = [
  [
    ["SUCH", "JJ"],
    ["AS", "IN"],
  ],
];

function leafEquals(a: Leaf, b: Leaf): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function leafInList(x: Leaf, list: Leaf[]): boolean {
  return list.some((l) => leafEquals(x, l));
}

/**
 * Sentence structure features. Handles detection and feature generation
 * related to the structure of the ingredient sentence.
 */
export class SentenceStructureFeatures {
  // RegexpParser to detect multi-ingredient phrases.
  private static readonly mipParser = new RegexpParser(`
        # Extended multi-ingredient phrase containing of 3 ingredients
        # w, x or y z
        EMIP: {<NN.*|JJ.*>+<,><NN.*|JJ.*>+<,>?<CC><DT|NN.*|JJ.*>*<NN.*>}
        # Multi-ingredient phrase containing of 2 ingredients
        # x or y z
        MIP: {<NN.*|JJ.*>+<CC><DT|NN.*|JJ.*>*<NN.*>}
        `);

  // RegexpParser to detect the start of new ingredient sentence in compound
  // sentence. UNIT and SIZE are custom tags.
  private static readonly compoundParser = new RegexpParser(`
        CS_WU: {<CC><RB>?<CD|DT>+<RB>?<UNIT|SIZE>+} # with unit: quantity with unit/size
        CS_NU: {<CC><CD|DT>+<NN.*|JJ.*>}  # no unit: quantity but no unit or size
        CS_HALF: {<CC><HALF>} # "or half the", "or half that" etc.
    `);

  // RegexpParser to detect phrases of examples of ingredients.
  private static readonly exampleParser = new RegexpParser(`
        NP: {(<NN.*|JJ.*>+<,>?)*<CC|DT>?<NN.*|JJ.*>*<NN.*>}
        EX: {<JJ.*>?<IN><NP>}
    `);

  // RegexpParser to detect dimensional phrases.
  // LEN and DIM are custom tags based on the LENGTH_UNIT and DIMENSIONS
  // constants.
  private static readonly dimensionalPhraseParser = new RegexpParser(`
        LENGTH: {<CD><LEN>}
        PLENGTH: {<\\(><LENGTH><\\)>}  # LENGTH in parentheses
        SLENGTH: {<SYM><LENGTH>}  # LENGTH following forward slash
        DP: {<LENGTH><SLENGTH|PLENGTH>?<IN>?<DIM>*}
    `);

  readonly tokenizedSentence: Token[];
  readonly mipPhrases: number[][];
  readonly sentenceSplits: number[];
  readonly examplePhrases: number[][];
  readonly dimensionalPhrases: number[][];

  constructor(tokenizedSentence: Token[]) {
    this.tokenizedSentence = tokenizedSentence;
    this.mipPhrases = this.detectMipPhrases();
    this.sentenceSplits = this.detectSentencesSplits();
    this.examplePhrases = this.detectExamples();
    this.dimensionalPhrases = this.detectDimensionalPhrases();
  }

  /**
   * Get the leaf indices of subtrees in the parent tree matching one of the
   * given labels. Only the top-level children are inspected. Port of
   * `_get_subtree_indices`.
   */
  private getSubtreeIndices(parentTree: Tree, labels: string[]): number[][] {
    const indices: number[][] = [];
    let leafIdx = 0;
    for (const child of parentTree.children) {
      if (child instanceof Tree) {
        const numLeaves = child.leaves().length;
        if (labels.includes(child.label())) {
          indices.push(range(leafIdx, leafIdx + numLeaves));
        }
        // Jump leafIdx forwards by numLeaves regardless of whether the child
        // was a Tree we were looking for.
        leafIdx += numLeaves;
      } else {
        leafIdx += 1;
      }
    }
    return indices;
  }

  /** Return True if the conjunction in the phrase is not "or". */
  private ccIsNotOr(textPos: Leaf[], indices: number[]): boolean {
    const text = indices.map((i) => textPos[i][0]);
    const pos = indices.map((i) => textPos[i][1]);
    const ccIndex = pos.indexOf("CC");
    if (ccIndex === -1) {
      return false;
    }
    return text[ccIndex].toLowerCase() !== "or";
  }

  private detectMipPhrases(): number[][] {
    const phrases: number[][] = [];

    const textPos: Leaf[] = this.tokenizedSentence.map((t) => [t.text, t.posTag]);
    const parsed = SentenceStructureFeatures.mipParser.parse(cloneLeaves(textPos));

    const tokensToDiscard = new Set<string>([...FLATTENED_UNITS_LIST, ...SIZES]);

    for (let indices of this.getSubtreeIndices(parsed, ["EMIP", "MIP"])) {
      // If the conjunction is not "or", skip.
      if (this.ccIsNotOr(textPos, indices)) {
        continue;
      }

      // Remove any units or sizes from the beginning of the phrase.
      while (
        indices.length > 0 &&
        tokensToDiscard.has(this.tokenizedSentence[indices[0]].text.toLowerCase())
      ) {
        indices = indices.slice(1);
      }

      // If phrase is empty, skip.
      if (indices.length === 0) {
        continue;
      }

      // If first index is now a conjunction, skip.
      if (this.tokenizedSentence[indices[0]].posTag === "CC") {
        continue;
      }

      phrases.push(indices);
    }

    return phrases;
  }

  private detectSentencesSplits(): number[] {
    const splitIndices: number[] = [];

    const textPos: Leaf[] = [];
    for (const t of this.tokenizedSentence) {
      let pos: string;
      if (FLATTENED_UNITS_LIST.has(t.text.toLowerCase())) {
        pos = "UNIT";
      } else if (SIZES.includes(t.text.toLowerCase())) {
        pos = "SIZE";
      } else if (t.text.toLowerCase() === "half") {
        pos = "HALF";
      } else {
        pos = t.posTag;
      }
      textPos.push([t.featText, pos]);
    }

    const parsed = SentenceStructureFeatures.compoundParser.parse(cloneLeaves(textPos));
    for (const indices of this.getSubtreeIndices(parsed, ["CS_WU", "CS_NU", "CS_HALF"])) {
      // If the conjunction is not "or", skip.
      if (this.ccIsNotOr(textPos, indices)) {
        continue;
      }
      splitIndices.push(indices[0]);
    }

    return splitIndices;
  }

  private detectExamples(): number[][] {
    const examples: number[][] = [];

    const textPos: Leaf[] = this.tokenizedSentence.map((t) => [t.text, t.posTag]);
    const parsed = SentenceStructureFeatures.exampleParser.parse(cloneLeaves(textPos));

    for (const indices of this.getSubtreeIndices(parsed, ["EX"])) {
      const indexSet = new Set(indices);
      const phraseTextPos: Leaf[] = [];
      this.tokenizedSentence.forEach((token, i) => {
        if (indexSet.has(i)) {
          phraseTextPos.push([token.text.toUpperCase(), token.posTag]);
        }
      });

      // Check start of phrase for key words.
      if (
        phraseTextPos.length >= 2 &&
        EXAMPLE_PHRASE_START_JJ.some(
          (pair) =>
            leafEquals(phraseTextPos[0], pair[0]) && leafEquals(phraseTextPos[1], pair[1]),
        )
      ) {
        examples.push(indices);
        continue;
      } else if (leafInList(phraseTextPos[0], EXAMPLE_PHRASE_START_IN)) {
        examples.push(indices);
        continue;
      } else if (
        phraseTextPos[0][1] === "JJ" &&
        leafInList(phraseTextPos[1], EXAMPLE_PHRASE_START_IN)
      ) {
        // The phrase starts with JJ+IN, but doesn't match any pairs in
        // EXAMPLE_PHRASE_START_JJ. Check if it matches anything in
        // EXAMPLE_PHRASE_START_IN if we ignore the first token.
        examples.push(indices.slice(1));
        continue;
      }
    }

    return examples;
  }

  private detectDimensionalPhrases(): number[][] {
    const textPos: Leaf[] = [];
    for (const t of this.tokenizedSentence) {
      let pos: string;
      if (LENGTH_UNITS.has(t.text.toLowerCase()) && t.posTag !== "IN") {
        // Check POS tag so we don't confuse "in" (preposition) with "in"
        // (abbreviation of inch).
        pos = "LEN";
      } else if (DIMENSIONS.has(t.text.toLowerCase())) {
        pos = "DIM";
      } else {
        pos = t.posTag;
      }
      textPos.push([t.featText, pos]);
    }

    const parsed = SentenceStructureFeatures.dimensionalPhraseParser.parse(
      cloneLeaves(textPos),
    );
    return this.getSubtreeIndices(parsed, ["DP"]);
  }

  /**
   * Return dict of structure features for the token at index. `mip_start`,
   * `mip_end`, `after_sentence_split` and `example_phrase` are always present;
   * `dimensional_phrase` is only added (always True) when the token is in a
   * dimensional phrase. Port of `token_features`.
   */
  tokenFeatures(index: number, prefix: string): Record<string, boolean> {
    const features: Record<string, boolean> = {
      [prefix + "mip_start"]: false,
      [prefix + "mip_end"]: false,
      [prefix + "after_sentence_split"]: false,
      [prefix + "example_phrase"]: false,
    };

    for (const phrase of this.mipPhrases) {
      if (!phrase.includes(index)) {
        continue;
      }
      if (index === phrase[0]) {
        features[prefix + "mip_start"] = true;
      }
      if (index === phrase[phrase.length - 1]) {
        features[prefix + "mip_end"] = true;
      }
    }

    for (const splitIndex of this.sentenceSplits) {
      if (index >= splitIndex) {
        features[prefix + "after_sentence_split"] = true;
      }
    }

    for (const phrase of this.examplePhrases) {
      if (phrase.includes(index)) {
        features[prefix + "example_phrase"] = true;
      }
    }

    for (const phrase of this.dimensionalPhrases) {
      if (phrase.includes(index)) {
        features[prefix + "dimensional_phrase"] = true;
      }
    }

    return features;
  }
}

/** Python range(start, stop). */
function range(start: number, stop: number): number[] {
  const out: number[] = [];
  for (let i = start; i < stop; i++) {
    out.push(i);
  }
  return out;
}

/** Copy the (text, pos) leaf tuples so the parser can't alias the source. */
function cloneLeaves(textPos: Leaf[]): TreeChild[] {
  return textPos.map((l) => [l[0], l[1]] as Leaf);
}
