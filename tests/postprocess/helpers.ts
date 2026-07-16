// Shared helpers for the postprocess test ports. Not a test file itself.
import type { LabelledToken } from "../../src/dataclasses.js";

/**
 * Build a list of LabelledToken objects, mirroring the
 * `[LabelledToken(index=i, ...) for i, ... in enumerate(zip(...))]`
 * construction used throughout the upstream postprocess tests.
 */
export function labelledTokens(opts: {
  tokens: string[];
  labels: string[];
  posTags?: string[];
  scores?: number[];
  plurals?: boolean[];
}): LabelledToken[] {
  const { tokens, labels, posTags, scores, plurals } = opts;
  return tokens.map((text, i) => ({
    index: i,
    text,
    posTag: posTags ? posTags[i]! : "",
    label: labels[i]!,
    score: scores ? scores[i]! : 0,
    plural: plurals ? plurals[i]! : false,
  }));
}
