import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_collapse_ranges.py
describe("TestPreProcessor_collapse_ranges", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_no_range", () => {
    const inputSentence = "100-200 g grated cheese";
    expect(p.collapseRanges(inputSentence)).toEqual(inputSentence);
  });

  it("test_left_hand_expand", () => {
    const inputSentence = "100 -200 g grated cheese";
    expect(p.collapseRanges(inputSentence)).toEqual("100-200 g grated cheese");
  });

  it("test_right_hand_expand", () => {
    const inputSentence = "100-  200 g grated cheese";
    expect(p.collapseRanges(inputSentence)).toEqual("100-200 g grated cheese");
  });

  it("test_both_sides_expanded", () => {
    const inputSentence = "100 -  200 g grated cheese";
    expect(p.collapseRanges(inputSentence)).toEqual("100-200 g grated cheese");
  });

  it("test_fake_fraction", () => {
    const inputSentence = "#1$2 - #3$4 cups grated cheese";
    expect(p.collapseRanges(inputSentence)).toEqual("#1$2-#3$4 cups grated cheese");
  });
});
