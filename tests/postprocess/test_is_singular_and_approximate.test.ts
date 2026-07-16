import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_is_singular_and_approximate.py

describe("TestPostProcessor_is_singular_and_approximate", () => {
  it("test_is_singular_and_approximate", () => {
    const lt = labelledTokens({
      tokens: ["each", "nearly", "2", "kg"],
      posTags: ["DT", "RB", "CD", "NN"],
      labels: ["COMMENT", "COMMENT", "QTY", "UNIT"],
    });
    const p = new PostProcessor("each nearly 2 kg", lt, {});
    expect(p.isSingularAndApproximate(2, lt)).toBe(true);
    expect(p.consumed).toEqual([1, 0]);
  });

  it("test_is_singular_and_approximate_or_so", () => {
    const lt = labelledTokens({
      tokens: ["2", "kg", "or", "so", "each"],
      posTags: ["CD", "ND", "CC", "RB", "DT"],
      labels: ["QTY", "UNIT", "COMMENT", "COMMENT", "COMMENT"],
    });
    const p = new PostProcessor("2 kg or so each", lt, {});
    expect(p.isSingularAndApproximate(1, lt)).toBe(true);
    expect(p.consumed).toEqual([2, 3, 4]);
  });

  it("test_not_singular_and_approximate", () => {
    const lt = labelledTokens({
      tokens: ["both", "about", "2", "kg"],
      posTags: ["DT", "IN", "CD", "NNS"],
      labels: ["COMMENT", "COMMENT", "QTY", "UNIT"],
    });
    const p = new PostProcessor("both about 2 kg", lt, {});
    expect(p.isSingularAndApproximate(2, lt)).toBe(false);
    expect(p.consumed).toEqual([]);
  });
});
