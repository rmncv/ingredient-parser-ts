import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_match_pattern.py

function tokensFromLabels(tokenLabels: string[]) {
  return labelledTokens({ tokens: tokenLabels.map(() => ""), labels: tokenLabels });
}

describe("TestPostProcessor_match_pattern", () => {
  it("test_long_pattern_match", () => {
    const pattern = ["QTY", "QTY", "UNIT", "QTY", "UNIT", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "UNIT", "QTY", "QTY", "UNIT", "QTY", "UNIT", "QTY", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, true)).toEqual([
      [2, 3, 4, 5, 6, 7, 8, 9],
    ]);
  });

  it("test_medium_pattern_match", () => {
    const pattern = ["QTY", "QTY", "UNIT", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "QTY", "UNIT", "QTY", "UNIT", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, true)).toEqual([
      [0, 1, 2, 3, 4, 5],
    ]);
  });

  it("test_short_pattern_match", () => {
    const pattern = ["QTY", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "UNIT", "QTY", "QTY", "UNIT", "UNIT", "QTY", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, true)).toEqual([[2, 3, 4, 5]]);
  });

  it("test_impossible_match", () => {
    const pattern = ["QTY", "QTY", "UNIT", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "QTY", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, true)).toEqual([]);
  });

  it("test_multiple_non_consecutive_matches", () => {
    const pattern = ["QTY", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "QTY", "UNIT", "UNIT", "QTY", "QTY", "QTY", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, true)).toEqual([
      [0, 1, 2, 3],
      [5, 6, 7, 8],
    ]);
  });

  it("test_multiple_consecutive_matches", () => {
    const pattern = ["QTY", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "QTY", "UNIT", "UNIT", "QTY", "QTY", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, true)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
  });

  it("test_interrupted_pattern_without_ignore", () => {
    const pattern = ["QTY", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "QTY", "COMMENT", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, false)).toEqual([]);
  });

  it("test_interrupted_pattern_with_ignore", () => {
    const pattern = ["QTY", "QTY", "UNIT", "UNIT"];
    const labels = ["QTY", "QTY", "COMMENT", "UNIT", "UNIT"];
    const p = new PostProcessor("", [], {});
    expect(p.matchPattern(tokensFromLabels(labels), pattern, true)).toEqual([[0, 1, 3, 4]]);
  });
});
