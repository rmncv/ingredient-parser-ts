import { describe, it, expect } from "vitest";
import { PostProcessor, PartialIngredientAmount } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_distribute_related_flags.py

function makeP(): PostProcessor {
  const tokens = ["2", "14", "ounce", "can", "coconut", "milk"];
  const posTags = ["CD", "CD", "NN", "MD", "VB", "NN"];
  const labels = ["QTY", "QTY", "UNIT", "UNIT", "B_NAME_TOK", "I_NAME_TOK"];
  const scores = [
    0.9991370577083561, 0.9725378063405858, 0.9978510889596651,
    0.9922350007952175, 0.9886087821704076, 0.9969237827902526,
  ];
  return new PostProcessor(
    "2 14 ounce cans coconut milk",
    labelledTokens({ tokens, posTags, labels, scores }),
    {},
  );
}

describe("TestPostProcessor_distribute_related_flags", () => {
  it("test_distribute_approximate", () => {
    const p = makeP();
    const amounts = [
      new PartialIngredientAmount("", [""], [0], 0, { APPROXIMATE: true }),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true }),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true }),
    ];
    const outputs = p.distributeRelatedFlags(amounts);
    expect(outputs.every((am) => am.APPROXIMATE)).toBe(true);
    expect(outputs.every((am) => am.SINGULAR)).toBe(false);
  });

  it("test_distribute_singular", () => {
    const p = makeP();
    const amounts = [
      new PartialIngredientAmount("", [""], [0], 0),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true }),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true, SINGULAR: true }),
    ];
    const outputs = p.distributeRelatedFlags(amounts);
    expect(outputs.every((am) => am.APPROXIMATE)).toBe(false);
    expect(outputs.every((am) => am.SINGULAR)).toBe(true);
  });

  it("test_no_distribute", () => {
    const p = makeP();
    const amounts = [
      new PartialIngredientAmount("", [""], [0], 0, { APPROXIMATE: true }),
      new PartialIngredientAmount("", [""], [0], 0),
      new PartialIngredientAmount("", [""], [0], 0, { SINGULAR: true }),
    ];
    const outputs = p.distributeRelatedFlags(amounts);
    expect(outputs.map((a) => a.APPROXIMATE)).toEqual([true, false, false]);
    expect(outputs.map((a) => a.SINGULAR)).toEqual([false, false, true]);
  });

  it("test_mixed_distribute", () => {
    const p = makeP();
    const amounts = [
      new PartialIngredientAmount("", [""], [0], 0),
      new PartialIngredientAmount("", [""], [0], 0, { APPROXIMATE: true }),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true, SINGULAR: true }),
    ];
    const outputs = p.distributeRelatedFlags(amounts);
    expect(outputs.map((a) => a.APPROXIMATE)).toEqual([false, true, true]);
    expect(outputs.map((a) => a.SINGULAR)).toEqual([false, true, true]);
  });

  it("test_singular_after_multiplier", () => {
    const p = makeP();
    const amounts = [
      new PartialIngredientAmount("2x", [""], [0], 0),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true }),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true }),
    ];
    const outputs = p.distributeRelatedFlags(amounts);
    expect(outputs.map((a) => a.SINGULAR)).toEqual([false, true, true]);
  });

  it("test_singular_after_multiplier_only_related", () => {
    const p = makeP();
    const amounts = [
      new PartialIngredientAmount("2x", [""], [0], 0),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: true }),
      new PartialIngredientAmount("", [""], [0], 0, { relatedToPrevious: false }),
    ];
    const outputs = p.distributeRelatedFlags(amounts);
    expect(outputs.map((a) => a.SINGULAR)).toEqual([false, true, false]);
  });
});
