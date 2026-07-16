import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_identify_fractions.py
describe("TestPreProcessor_identify_fractions", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_less_than_one", () => {
    expect(p.identifyFractions("1/2 cup sugar")).toEqual("#1$2 cup sugar");
  });

  it("test_greater_than_one", () => {
    expect(p.identifyFractions("1 pound melted butter, about 3 1/3 cups")).toEqual(
      "1 pound melted butter, about 3#1$3 cups",
    );
  });

  it("test_no_fraction", () => {
    const inputSentence = "pinch of salt";
    expect(p.identifyFractions(inputSentence)).toEqual(inputSentence);
  });

  it("test_leading_space", () => {
    expect(p.identifyFractions(" 1/2 cup sugar")).toEqual(" #1$2 cup sugar");
  });

  it("test_vulgar_fraction", () => {
    expect(p.identifyFractions("1⁄2 x 20g pack fresh thyme, leaves only")).toEqual(
      "#1$2 x 20g pack fresh thyme, leaves only",
    );
  });

  it("test_multiple_fractions", () => {
    expect(
      p.identifyFractions("1/2 baguette, cut diagonally into about 1/4-inch slices"),
    ).toEqual("#1$2 baguette, cut diagonally into about #1$4-inch slices");
  });

  it("test_percentage_ratio_lean_grade_beef", () => {
    expect(p.identifyFractions("1 lb 80/20 ground beef")).toEqual(
      "1 lb 80/20 ground beef",
    );
  });

  it("test_percentage_ratio_lean_grade_turkey", () => {
    expect(p.identifyFractions("1 lb 93/7 ground turkey")).toEqual(
      "1 lb 93/7 ground turkey",
    );
  });

  it("test_percentage_ratio_50_50", () => {
    expect(p.identifyFractions("1 lb 50/50 ground beef")).toEqual(
      "1 lb 50/50 ground beef",
    );
  });

  it("test_percentage_ratio_99_1", () => {
    expect(p.identifyFractions("1 lb 99/1 ground turkey")).toEqual(
      "1 lb 99/1 ground turkey",
    );
  });

  it("test_compound_no_space_keeps_fraction_form", () => {
    expect(p.identifyFractions("11/2 teaspoons sea salt")).toEqual(
      "#11$2 teaspoons sea salt",
    );
  });

  it("test_compound_no_space_thirteen_quarters", () => {
    expect(p.identifyFractions("50g/13/4oz unsalted butter, cubed")).toEqual(
      "50g/#13$4oz unsalted butter, cubed",
    );
  });

  it("test_one_over_ninety_nine_documented_edge_case", () => {
    expect(p.identifyFractions("1/99 cup of vinegar")).toEqual("1/99 cup of vinegar");
  });

  it("test_ratio_adjacent_to_word_no_space", () => {
    expect(p.identifyFractions("80/20ground beef")).toEqual("80/20ground beef");
  });

  it("test_two_digit_denominator_small_numerator", () => {
    expect(p.identifyFractions("1/16 inch slices")).toEqual("#1$16 inch slices");
  });

  it("test_two_digit_denominator_close_to_one", () => {
    expect(p.identifyFractions("15/16 inch thick")).toEqual("#15$16 inch thick");
  });
});
