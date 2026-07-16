import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_replace_unicode_fractions.py
describe("TestPreProcessor_replace_unicode_fractions", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  const cases: [string, string, string][] = [
    ["test_half", "3½ potatoes", "3 1/2 potatoes"],
    ["test_third", "3⅓ potatoes", "3 1/3 potatoes"],
    ["test_two_thirds", "3⅔ potatoes", "3 2/3 potatoes"],
    ["test_quarter", "3¼ potatoes", "3 1/4 potatoes"],
    ["test_three_quarters", "3¾ potatoes", "3 3/4 potatoes"],
    ["test_fifth", "3 ⅕ potatoes", "3  1/5 potatoes"],
    ["test_two_fifth", "3 ⅖ potatoes", "3  2/5 potatoes"],
    ["test_three_fifth", "3 ⅗ potatoes", "3  3/5 potatoes"],
    ["test_four_fifth", "3 ⅘ potatoes", "3  4/5 potatoes"],
    ["test_one_sixth", "3 ⅙ potatoes", "3  1/6 potatoes"],
    ["test_five_sixths", "3 ⅚ potatoes", "3  5/6 potatoes"],
    ["test_one_eighth", "3 ⅛ potatoes", "3  1/8 potatoes"],
    ["test_three_eighths", "3 ⅜ potatoes", "3  3/8 potatoes"],
    ["test_five_eighths", "3 ⅝ potatoes", "3  5/8 potatoes"],
    ["test_seven_eighths", "3 ⅞ potatoes", "3  7/8 potatoes"],
    ["test_range", "¼-½ teaspoon", " 1/4-1/2 teaspoon"],
  ];

  it.each(cases)("%s", (_name, input, expected) => {
    expect(p.replaceUnicodeFractions(input)).toEqual(expected);
  });
});
