import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_remove_invalid_indices.py

function makeP(): PostProcessor {
  const tokens = [
    "2", ",", "14", "ounce", "can", "coconut", "milk", ":", "opened", "(",
    "not", "chilled", ")",
  ];
  const posTags = [
    "CD", ",", "CD", "NN", "MD", "VB", "NN", ":", "VBN", "(", "RB", "VBN", ")",
  ];
  const labels = [
    "QTY", "PUNC", "QTY", "UNIT", "UNIT", "B_NAME_TOK", "I_NAME_TOK", "PUNC",
    "PREP", "PUNC", "COMMENT", "COMMENT", "PUNC",
  ];
  return new PostProcessor(
    "2, 14 ounce cans coconut milk: opened (not chilled)",
    labelledTokens({ tokens, posTags, labels }),
    {},
  );
}

describe("TestPostProcessor_fix_punctuation", () => {
  it("test_leading_punctuation", () => {
    expect(makeP().removeInvalidIndices([1, 2, 3])).toEqual([2, 3]);
  });

  it("test_trailing_punctuation", () => {
    expect(makeP().removeInvalidIndices([5, 6, 7])).toEqual([5, 6]);
  });

  it("test_open_parenthesis", () => {
    expect(makeP().removeInvalidIndices([8, 9, 10, 11])).toEqual([8, 10, 11]);
  });

  it("test_close_parenthesis", () => {
    expect(makeP().removeInvalidIndices([10, 11, 12])).toEqual([10, 11]);
  });

  it("test_valid_parenthesis", () => {
    expect(makeP().removeInvalidIndices([8, 9, 10, 11, 12])).toEqual([8, 9, 10, 11, 12]);
  });
});
