import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_is_approximate.py

describe("TestPostProcessor_is_approximate", () => {
  it("test_is_approximate_about", () => {
    const lt = labelledTokens({
      tokens: ["about", "5", "cups", "orange", "juice"],
      posTags: ["IN", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("about 5 cups orange juice", lt, {});
    expect(p.isApproximate(1, lt)).toBe(true);
    expect(p.consumed).toEqual([0]);
  });

  it("test_is_approximate_approx_period", () => {
    const lt = labelledTokens({
      tokens: ["approx", ".", "5", "cups", "orange", "juice"],
      posTags: ["NN", ".", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "PUNC", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("approx. 5 cups orange juice", lt, {});
    expect(p.isApproximate(2, lt)).toBe(true);
    expect(p.consumed).toEqual([1, 0]);
  });

  it("test_is_approximate_approx", () => {
    const lt = labelledTokens({
      tokens: ["approx", "5", "cups", "orange", "juice"],
      posTags: ["RB", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("approx 5 cups orange juice", lt, {});
    expect(p.isApproximate(1, lt)).toBe(true);
    expect(p.consumed).toEqual([0]);
  });

  it("test_is_approximate_approximately", () => {
    const lt = labelledTokens({
      tokens: ["approximately", "5", "cups", "orange", "juice"],
      posTags: ["RB", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("approximately 5 cups orange juice", lt, {});
    expect(p.isApproximate(1, lt)).toBe(true);
    expect(p.consumed).toEqual([0]);
  });

  it("test_is_approximate_nearly", () => {
    const lt = labelledTokens({
      tokens: ["nearly", "5", "cups", "orange", "juice"],
      posTags: ["RB", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("nearly 5 cups orange juice", lt, {});
    expect(p.isApproximate(1, lt)).toBe(true);
    expect(p.consumed).toEqual([0]);
  });

  it("test_is_approximate_generous", () => {
    const lt = labelledTokens({
      tokens: ["6", "generous", "cups", "orange", "juice"],
      posTags: ["CD", "JJ", "NNS", "NN", "NN"],
      labels: ["QTY", "UNIT", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("6 generous cups orange juice", lt, {});
    expect(p.isApproximate(2, lt)).toBe(true);
    expect(p.consumed).toEqual([1]);
  });

  it("test_is_approximate_or_so_quantity", () => {
    const lt = labelledTokens({
      tokens: ["48", "or", "so", "small", "black", "and", "green", "olives"],
      posTags: ["CD", "CC", "RB", "JJ", "JJ", "CC", "JJ", "NNS"],
      labels: ["QTY", "COMMENT", "COMMENT", "SIZE", "NAME_VAR", "NAME_SEP", "NAME_VAR", "B_NAME_TOK"],
    });
    const p = new PostProcessor("48 or so small black and green olives", lt, {});
    expect(p.isApproximate(0, lt)).toBe(true);
    expect(p.consumed).toEqual([1, 2]);
  });

  it("test_is_approximate_or_so_unit", () => {
    const lt = labelledTokens({
      tokens: ["#2$3", "cup", "or", "so", "low-fat", "milk"],
      posTags: ["CD", "NN", "CC", "RB", "JJ", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "COMMENT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("2/3 cup or so low-fat milk", lt, {});
    expect(p.isApproximate(1, lt)).toBe(true);
    expect(p.consumed).toEqual([2, 3]);
  });

  it("test_not_approximate", () => {
    const lt = labelledTokens({
      tokens: ["maximum", "5", "cups", "orange", "juice"],
      posTags: ["JJ", "CD", "NNS", "NN", "NN"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("maximum 5 cups orange juice", lt, {});
    expect(p.isApproximate(1, lt)).toBe(false);
    expect(p.consumed).toEqual([]);
  });
});
