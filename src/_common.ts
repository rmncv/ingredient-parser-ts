/**
 * Port of `upstream/ingredient_parser/_common.py`.
 *
 * Skips `UREG`/pint setup, nltk resource download plumbing, and
 * `show_model_card` (ported separately in a later task) — those have no
 * TypeScript counterpart or belong to another task.
 */

import { readFileSync, existsSync } from "node:fs";

export const SUPPORTED_LANGUAGES: string[] = ["en"];

/**
 * Print the model card for the specified language to stdout. Port of
 * `show_model_card`.
 *
 * Python opens the Markdown file in the platform's default application. There
 * is no cross-platform "open in default app" equivalent that makes sense for a
 * library entry point here, so this prints the card's contents to stdout
 * instead. Validation (unsupported language, missing file) is preserved.
 */
export function showModelCard(lang = "en"): void {
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    throw new Error(`Unsupported language "${lang}"`);
  }

  const cardUrl = new URL(`${lang}/data/ModelCard.${lang}.md`, import.meta.url);
  if (!existsSync(cardUrl)) {
    throw new Error(`Could not find Model Card at ${cardUrl.pathname}`);
  }

  process.stdout.write(readFileSync(cardUrl, "utf-8"));
}

// Regex pattern for matching a numeric range e.g. 1-2, 2-3, #1$2-1#3$4.
const RANGE_PATTERN = /^[\d#$]+\s*-[\d#$]+$/;

/**
 * Advance the `iterator` n-steps ahead. If `n` is null, consume entirely.
 *
 * See consume from https://docs.python.org/3/library/itertools.html#itertools-recipes
 */
export function consume<T>(iterator: Iterator<T>, n: number | null): void {
  if (n === null) {
    // Feed the entire iterator to exhaustion.
    while (!iterator.next().done) {
      // no-op
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (iterator.next().done) {
        break;
      }
    }
  }
}

/**
 * Yield groups of consecutive indices.
 *
 * Given a list of integers, return groups of integers where the value of
 * each in a group is adjacent to the previous element's value.
 *
 * @example
 * groupConsecutiveIdx([0, 1, 2, 4, 5, 6, 8, 9])
 * // => [[0, 1, 2], [4, 5, 6], [8, 9]]
 */
export function groupConsecutiveIdx(idx: number[]): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  let prevKey: number | undefined;

  idx.forEach((value, i) => {
    const key = i - value;
    if (current.length === 0 || key !== prevKey) {
      current = [];
      groups.push(current);
    }
    current.push(value);
    prevKey = key;
  });

  return groups;
}

/**
 * Check if `value` can be converted to a float.
 *
 * @example
 * isFloat("3") // true
 * isFloat("2.5") // true
 * isFloat("1-2") // false
 */
export function isFloat(value: string): boolean {
  // Mirror Python's float(str) parsing: strips whitespace, allows a leading
  // sign, decimal point, exponent, and the special values inf/nan.
  const s = value.trim();
  if (s.length === 0) {
    return false;
  }
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) || /^[+-]?(inf(inity)?|nan)$/i.test(s);
}

/**
 * Check if `value` is a range e.g. 100-200.
 *
 * @example
 * isRange("1-2") // true
 * isRange("100-500") // true
 * isRange("1") // false
 */
export function isRange(value: string): boolean {
  return RANGE_PATTERN.test(value);
}
