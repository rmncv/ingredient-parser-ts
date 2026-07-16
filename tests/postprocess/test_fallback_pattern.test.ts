import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { ingredientAmountFactory } from "../../src/en/_utils.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_fallback_pattern.py

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

describe("TestPostProcessor_fallback_pattern", () => {
  it("test_basic", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["3", "large", "handful", "cherry", "tomatoes"],
      labels: ["QTY", "UNIT", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
      plurals: [false, false, true, false, false],
    });
    const expected = [
      ingredientAmountFactory("3", "large handful", "3 large handful", 0, 0),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_imperial", () => {
    const p = new PostProcessor("", [], {}, { volumetricUnitsSystem: "imperial" });
    const lt = labelledTokens({
      tokens: ["About", "2", "cup", "flour"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK"],
      plurals: [false, false, true, false],
    });
    const expected = [
      ingredientAmountFactory("2", "cup", "2 cup", 0, 1, {
        APPROXIMATE: true,
        volumetricUnitsSystem: "imperial",
      }),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_string_units", () => {
    const p = new PostProcessor("", [], {}, { stringUnits: true });
    const lt = labelledTokens({
      tokens: ["About", "2", "cup", "flour"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK"],
      plurals: [false, false, true, false],
    });
    const expected = [
      ingredientAmountFactory("2", "cup", "2 cup", 0, 1, {
        APPROXIMATE: true,
        stringUnits: true,
      }),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_approximate", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["About", "2", "cup", "flour"],
      labels: ["COMMENT", "QTY", "UNIT", "B_NAME_TOK"],
      plurals: [false, false, true, false],
    });
    const expected = [
      ingredientAmountFactory("2", "cup", "2 cup", 0, 1, { APPROXIMATE: true }),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_singular", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["2", "bananas", ",", "4", "ounce", "each"],
      labels: ["QTY", "B_NAME_TOK", "PUNC", "QTY", "UNIT", "COMMENT"],
      plurals: [false, false, false, false, true, false],
    });
    p.consumed = [0, 1, 2, 3];
    const expected = [
      ingredientAmountFactory("2", "", "2", 0, 0),
      ingredientAmountFactory("4", "ounce", "4 ounce", 0, 3, { SINGULAR: true, APPROXIMATE: false }),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_singular_and_approximate", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["2", "bananas", ",", "each", "about", "4", "ounce"],
      labels: ["QTY", "B_NAME_TOK", "PUNC", "COMMENT", "COMMENT", "QTY", "UNIT"],
      plurals: [false, false, false, false, false, true, false],
    });
    const expected = [
      ingredientAmountFactory("2", "", "2", 0, 0),
      ingredientAmountFactory("4", "ounce", "4 ounce", 0, 5, { SINGULAR: true, APPROXIMATE: true }),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_prepared", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["2", "bananas", ",", "mashed", ",", "to", "yield", "1", "cup", "(", "200", "g", ")"],
      labels: [
        "QTY", "B_NAME_TOK", "PUNC", "PREP", "PUNC", "COMMENT", "COMMENT",
        "QTY", "UNIT", "PUNC", "QTY", "UNIT", "PUNC",
      ],
      plurals: Array(13).fill(false),
    });
    const expected = [
      ingredientAmountFactory("2", "", "2", 0, 0),
      ingredientAmountFactory("1", "cup", "1 cup", 0, 7, { PREPARED_INGREDIENT: true }),
      ingredientAmountFactory("200", "g", "200 g", 0, 10, { PREPARED_INGREDIENT: true }),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_dozen", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["2", "dozen", "bananas", ",", "each", "about", "4", "ounce"],
      labels: ["QTY", "QTY", "B_NAME_TOK", "PUNC", "COMMENT", "COMMENT", "QTY", "UNIT"],
      plurals: [false, false, false, false, false, false, false, true],
    });
    const expected = [
      ingredientAmountFactory("2 dozen", "", "2 dozen", 0, 0),
      ingredientAmountFactory("4", "ounce", "4 ounce", 0, 6, { SINGULAR: true, APPROXIMATE: true }),
    ];
    expect(p.fallbackPattern(lt)).toEqual(expected);
  });

  it("test_range", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["1-2", "tablespoon", "local", "honey"],
      labels: ["QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
      plurals: [false, true, false, false],
    });
    const expected = [
      ingredientAmountFactory("1-2", "tablespoon", "1-2 tablespoon", 0, 0),
    ];
    const actual = p.fallbackPattern(lt);
    expect(actual).toEqual(expected);
    expect(actual[0]!.RANGE).toBe(true);
    expect(actual[0]!.quantity).toEqual(expected[0]!.quantity);
    expect(actual[0]!.quantityMax).toEqual(expected[0]!.quantityMax);
  });

  it("test_multiplier", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["1x", "tin", "condensed", "milk"],
      labels: ["QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
      plurals: [false, false, false, false],
    });
    const expected = [ingredientAmountFactory("1x", "tin", "1x tin", 0, 0)];
    const actual = p.fallbackPattern(lt);
    expect(actual).toEqual(expected);
    expect(actual[0]!.MULTIPLIER).toBe(true);
    expect(actual[0]!.quantity).toEqual(expected[0]!.quantity);
  });

  it("test_implicit_quantity", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["#1$4", "inch", "piece", "of", "ginger"],
      labels: ["SIZE", "SIZE", "UNIT", "COMMENT", "B_NAME_TOK"],
    });
    const expected = [ingredientAmountFactory("1", "piece", "1 piece", 0, 2)];
    const actual = p.fallbackPattern(lt);
    expect(actual).toEqual(expected);
    expect(actual[0]!.quantity).toEqual(expected[0]!.quantity);
  });

  it("test_no_implicit_quantity_plural", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["Chervil", "sprig", "(", "optional", ")"],
      labels: ["B_NAME_TOK", "UNIT", "PUNC", "COMMENT", "PUNC"],
      plurals: [false, true, false, false, false],
    });
    const expected = [ingredientAmountFactory("", "sprigs", "sprigs", 0, 1)];
    const actual = p.fallbackPattern(lt);
    expect(actual).toEqual(expected);
    expect(actual[0]!.quantity).toBe("");
  });

  it("test_no_implicit_quantity_multiple_units", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["Thin", "slice", "peach"],
      labels: ["UNIT", "UNIT", "B_NAME_TOK"],
      plurals: [false, true, false],
    });
    const expected = [ingredientAmountFactory("", "Thin slices", "Thin slices", 0, 0)];
    const actual = p.fallbackPattern(lt);
    expect(actual).toEqual(expected);
    expect(actual[0]!.quantity).toBe("");
  });

  it("test_no_implicit_quantity_indefinite_quantifier", () => {
    const p = makeP();
    const lt = labelledTokens({
      tokens: ["Several", "sprig", "fresh", "rosemary"],
      labels: ["COMMENT", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
      plurals: [false, false, false, false],
    });
    const expected = [ingredientAmountFactory("", "sprig", "sprig", 0, 1)];
    const actual = p.fallbackPattern(lt);
    expect(actual).toEqual(expected);
    expect(actual[0]!.quantity).toBe("");
  });
});
