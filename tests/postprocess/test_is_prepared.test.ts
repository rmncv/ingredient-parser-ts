import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_is_prepared.py

describe("TestPostProcessor_is_prepared", () => {
  it("test_is_prepared_to_make", () => {
    const lt = labelledTokens({
      tokens: ["to", "make", "5", "cups", "orange", "juice"],
      posTags: ["TO", "VB", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "COMMENT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("to make 5 cups orange juice", lt, {});
    expect(p.isPrepared(2, lt)).toBe(true);
    expect(p.consumed).toEqual([1, 0]);
  });

  it("test_is_prepared_to_yield", () => {
    const lt = labelledTokens({
      tokens: ["to", "yield", "5", "cups", "orange", "juice"],
      posTags: ["TO", "VB", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "COMMENT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("to yield 5 cups orange juice", lt, {});
    expect(p.isPrepared(2, lt)).toBe(true);
    expect(p.consumed).toEqual([1, 0]);
  });

  it("test_is_prepared_and_approximate", () => {
    const lt = labelledTokens({
      tokens: ["to", "yield", "about", "250", "g"],
      posTags: ["TO", "VB", "RB", "CD", "NNS"],
      labels: ["COMMENT", "COMMENT", "COMMENT", "QTY", "UNIT"],
    });
    const p = new PostProcessor("to yield about 250 g", lt, {});
    expect(p.isPrepared(3, lt)).toBe(true);
    expect(p.consumed).toEqual([1, 0]);
  });
});
