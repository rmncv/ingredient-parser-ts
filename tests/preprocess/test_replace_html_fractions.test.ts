import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_replace_html_fractions.py
describe("TestPreProcessor_replace_html_fractions", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  const cases: [string, string, string][] = [
    ["test_half", "3&frac12; potatoes", "3½ potatoes"],
    ["test_one_third", "3&frac13; potatoes", "3⅓ potatoes"],
    ["test_two_thirds", "3&frac23; potatoes", "3⅔ potatoes"],
    ["test_one_quarter", "3&frac14; potatoes", "3¼ potatoes"],
    ["test_three_quarters", "3&frac34; potatoes", "3¾ potatoes"],
    ["test_fifth", "3 &frac15; potatoes", "3 ⅕ potatoes"],
    ["test_two_fifth", "3 &frac25; potatoes", "3 ⅖ potatoes"],
    ["test_three_fifth", "3 &frac35; potatoes", "3 ⅗ potatoes"],
    ["test_four_fifth", "3 &frac45; potatoes", "3 ⅘ potatoes"],
    ["test_one_sixth", "3 &frac16; potatoes", "3 ⅙ potatoes"],
    ["test_five_sixths", "3 &frac56; potatoes", "3 ⅚ potatoes"],
    ["test_one_eighth", "3 &frac18; potatoes", "3 ⅛ potatoes"],
    ["test_three_eighths", "3 &frac38; potatoes", "3 ⅜ potatoes"],
    ["test_five_eighths", "3 &frac58; potatoes", "3 ⅝ potatoes"],
    ["test_seven_eighths", "3 &frac78; potatoes", "3 ⅞ potatoes"],
  ];

  it.each(cases)("%s", (_name, input, expected) => {
    expect(p.replaceHtmlFractions(input)).toEqual(expected);
  });
});
