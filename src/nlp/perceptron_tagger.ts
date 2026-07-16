/**
 * Averaged-perceptron part-of-speech tagger (inference only).
 *
 * Direct translation of nltk's `nltk.tag.perceptron.PerceptronTagger`
 * (`tag`, `normalize`, `_get_features`) and
 * `nltk.tag.perceptron.AveragedPerceptron.predict`, reproducing nltk's exact
 * inference behaviour including its tie-breaking rule.
 *
 * Reference: tools/.venv/.../nltk/tag/perceptron.py
 *
 * This module only implements inference (`tag`); training (`train`,
 * `AveragedPerceptron.update`/`average_weights`) is out of scope since the
 * pretrained model weights are shipped as a fixture.
 */

const START = ["-START-", "-START2-"];
const END = ["-END-", "-END2-"];

/** Shape of the JSON produced by nltk's `PerceptronTagger.encode_json_obj`. */
export interface TaggerData {
  weights: Record<string, Record<string, number>>;
  tagdict: Record<string, string>;
  classes: string[];
}

/**
 * Python `word.isdigit()` for a single string, restricted (per the task
 * brief) to the Unicode decimal-digit category (`Nd`). Empty string is not
 * a match, mirroring Python's `"".isdigit() == False`.
 */
const isDigitString = (s: string): boolean => s.length > 0 && /^\p{Nd}+$/u.test(s);

/**
 * Python-style single-character access `s[0]`: the first Unicode code point
 * (not UTF-16 code unit), or "" for the empty string. Needed so astral-plane
 * characters (surrogate pairs in JS) behave like Python's `str` indexing.
 */
const firstCodePoint = (s: string): string => {
  const cp = s.codePointAt(0);
  return cp === undefined ? "" : String.fromCodePoint(cp);
};

/**
 * Python-style suffix slice `s[-3:]` over Unicode code points, so that a
 * surrogate pair is never split when building suffix feature keys.
 */
const last3CodePoints = (s: string): string => [...s].slice(-3).join("");

/**
 * Emulates nltk `PerceptronTagger.normalize`:
 * - a hyphen anywhere except in first position -> "!HYPHEN"
 * - four unicode digits -> "!YEAR"
 * - leading digit -> "!DIGITS"
 * - otherwise, lowercased word
 */
export function normalize(word: string): string {
  if (word.includes("-") && word[0] !== "-") {
    return "!HYPHEN";
  }
  if (isDigitString(word) && [...word].length === 4) {
    return "!YEAR";
  }
  if (word.length > 0 && /^\p{Nd}$/u.test(firstCodePoint(word))) {
    return "!DIGITS";
  }
  return word.toLowerCase();
}

/**
 * Emulates nltk `PerceptronTagger._get_features`. `i` is the 0-based token
 * index (before the `+= len(START)` adjustment nltk applies internally);
 * `context` is `START ++ tokens.map(normalize) ++ END`.
 */
function getFeatures(
  i: number,
  word: string,
  context: string[],
  prev: string,
  prev2: string,
): Record<string, number> {
  const features: Record<string, number> = {};
  const add = (name: string, ...args: string[]): void => {
    const key = [name, ...args].join(" ");
    features[key] = (features[key] ?? 0) + 1;
  };

  const idx = i + START.length;

  add("bias");
  add("i suffix", last3CodePoints(word));
  add("i pref1", firstCodePoint(word));
  add("i-1 tag", prev);
  add("i-2 tag", prev2);
  add("i tag+i-2 tag", prev, prev2);
  add("i word", context[idx]!);
  add("i-1 tag+i word", prev, context[idx]!);
  add("i-1 word", context[idx - 1]!);
  add("i-1 suffix", last3CodePoints(context[idx - 1]!));
  add("i-2 word", context[idx - 2]!);
  add("i+1 word", context[idx + 1]!);
  add("i+1 suffix", last3CodePoints(context[idx + 1]!));
  add("i+2 word", context[idx + 2]!);

  return features;
}

export class PerceptronTagger {
  private readonly weights: Record<string, Record<string, number>>;
  private readonly tagdict: Map<string, string>;
  private readonly classes: string[];

  constructor(data: TaggerData) {
    this.weights = data.weights;
    this.tagdict = new Map(Object.entries(data.tagdict));
    this.classes = data.classes;
  }

  /**
   * Tag a list of tokens. `extraTagdict`, if given, is consulted before the
   * model's own tagdict (mirroring upstream ingredient-parser's
   * `tagger.tagdict.update(ingredient_tagdict)` overlay, which gives the
   * extra entries precedence).
   */
  tag(tokens: string[], extraTagdict?: Map<string, string>): [string, string][] {
    let prev = START[0]!;
    let prev2 = START[1]!;
    const output: [string, string][] = [];

    const context = [...START, ...tokens.map(normalize), ...END];

    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i]!;
      let tag = extraTagdict?.get(word) ?? this.tagdict.get(word);
      if (!tag) {
        const features = getFeatures(i, word, context, prev, prev2);
        tag = this.predict(features);
      }
      output.push([word, tag]);

      prev2 = prev;
      prev = tag;
    }

    return output;
  }

  /**
   * Emulates `AveragedPerceptron.predict` (without the softmax confidence
   * branch, which upstream ingredient-parser never requests). Ties are
   * broken by taking the lexicographically largest label, matching Python's
   * `max(classes, key=lambda label: (scores[label], label))` exactly.
   */
  private predict(features: Record<string, number>): string {
    const scores = new Map<string, number>();

    for (const [feat, value] of Object.entries(features)) {
      if (value === 0) continue;
      const featWeights = this.weights[feat];
      if (!featWeights) continue;
      for (const [label, weight] of Object.entries(featWeights)) {
        scores.set(label, (scores.get(label) ?? 0) + value * weight);
      }
    }

    let best = this.classes[0]!;
    let bestScore = scores.get(best) ?? 0;
    for (const label of this.classes) {
      const score = scores.get(label) ?? 0;
      if (score > bestScore || (score === bestScore && label > best)) {
        bestScore = score;
        best = label;
      }
    }

    return best;
  }
}
