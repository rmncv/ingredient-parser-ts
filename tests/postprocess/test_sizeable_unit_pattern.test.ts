import { describe, it, expect } from "vitest";
import { PostProcessor, type PostProcessorOptions } from "../../src/en/postprocess.js";
import { ingredientAmountFactory } from "../../src/en/_utils.js";
import type { IngredientAmount } from "../../src/dataclasses.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_sizeable_unit_pattern.py

function compareIgnoringScore(output: IngredientAmount[], expected: IngredientAmount[], checkText = false): void {
  expect(output.length).toBe(expected.length);
  output.forEach((out, i) => {
    const exp = expected[i]!;
    expect(out.quantity).toEqual(exp.quantity);
    expect(out.unit).toEqual(exp.unit);
    if (checkText) {
      expect(out.text).toBe(exp.text);
    }
    expect(out.startingIndex).toBe(exp.startingIndex);
    expect(out.SINGULAR).toBe(exp.SINGULAR);
    expect(out.APPROXIMATE).toBe(exp.APPROXIMATE);
  });
}

describe("TestPostProcessor_sizeable_unit_pattern", () => {
  it("test_long_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "28", "ounce", "(", "400", "g", "/", "2", "cup", ")", "can", "chickpeas"],
      posTags: ["CD", "CD", "NN", "(", "CD", "NN", "VBD", "CD", "NN", ")", "MD", "VB"],
      labels: [
        "QTY", "QTY", "UNIT", "COMMENT", "QTY", "UNIT", "COMMENT", "QTY", "UNIT",
        "COMMENT", "UNIT", "B_NAME_TOK",
      ],
    });
    const p = new PostProcessor("1 28 ounce (400 g / 2 cups) can chickpeas", lt, {});
    const expected = [
      ingredientAmountFactory("1", "can", "1 can", 0, 0),
      ingredientAmountFactory("28", "ounce", "28 ounces", 0, 1, { SINGULAR: true }),
      ingredientAmountFactory("400", "g", "400 g", 0, 4, { SINGULAR: true }),
      ingredientAmountFactory("2", "cup", "2 cups", 0, 7, { SINGULAR: true }),
    ];
    compareIgnoringScore(p.sizeableUnitPattern(lt), expected);
  });

  it("test_medium_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "28", "ounce", "(", "400", "g", ")", "can", "chickpeas"],
      posTags: ["CD", "CD", "NN", "(", "CD", "NN", ")", "MD", "VB"],
      labels: ["QTY", "QTY", "UNIT", "COMMENT", "QTY", "UNIT", "COMMENT", "UNIT", "NAME"],
    });
    const p = new PostProcessor("1 28 ounce (400 g) can chickpeas", lt, {});
    const expected = [
      ingredientAmountFactory("1", "can", "1 can", 0, 0),
      ingredientAmountFactory("28", "ounce", "28 ounces", 0, 1, { SINGULAR: true }),
      ingredientAmountFactory("400", "g", "400 g", 0, 4, { SINGULAR: true }),
    ];
    compareIgnoringScore(p.sizeableUnitPattern(lt), expected);
  });

  it("test_short_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "28", "ounce", "can", "chickpeas"],
      posTags: ["CD", "CD", "NN", "MD", "VB"],
      labels: ["QTY", "QTY", "UNIT", "UNIT", "NAME"],
    });
    const p = new PostProcessor("1 28 ounce can chickpeas", lt, {});
    const expected = [
      ingredientAmountFactory("1", "can", "1 can", 0, 0),
      ingredientAmountFactory("28", "ounce", "28 ounces", 0, 1, { SINGULAR: true }),
    ];
    compareIgnoringScore(p.sizeableUnitPattern(lt), expected);
  });

  it("test_no_pattern", () => {
    const lt = labelledTokens({
      tokens: ["400", "g", "chickpeas", "or", "black", "beans"],
      posTags: ["CD", "JJ", "NNS", "CC", "JJ", "NNS"],
      labels: ["QTY", "UNIT", "NAME", "NAME", "NAME", "NAME"],
    });
    const p = new PostProcessor("400 g chickpeas or black beans", lt, {});
    expect(p.sizeableUnitPattern(lt)).toEqual([]);
  });

  it("test_mixed_pattern", () => {
    const lt = labelledTokens({
      tokens: ["2", "cup", "or", "1", "28", "ounce", "can", "chickpeas"],
      posTags: ["CD", "NN", "CC", "CD", "CD", "NN", "MD", "VB"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "QTY", "UNIT", "UNIT", "NAME"],
    });
    const p = new PostProcessor("2 cups or 1 28 ounce can chickpeas", lt, {});
    const expected = [
      ingredientAmountFactory("1", "can", "1 can", 0, 3),
      ingredientAmountFactory("28", "ounce", "28 ounces", 0, 4, { SINGULAR: true }),
    ];
    compareIgnoringScore(p.sizeableUnitPattern(lt), expected);
  });

  it("test_mixed_pattern_imperial", () => {
    const lt = labelledTokens({
      tokens: ["2", "cup", "or", "1", "28", "ounce", "can", "chickpeas"],
      posTags: ["CD", "NN", "CC", "CD", "CD", "NN", "MD", "VB"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "QTY", "UNIT", "UNIT", "NAME"],
    });
    const opts: PostProcessorOptions = { volumetricUnitsSystem: "imperial" };
    const p = new PostProcessor("2 cups or 1 28 ounce can chickpeas", lt, {}, opts);
    const expected = [
      ingredientAmountFactory("1", "can", "1 can", 0, 3),
      ingredientAmountFactory("28", "ounce", "28 ounces", 0, 4, { SINGULAR: true, volumetricUnitsSystem: "imperial" }),
    ];
    compareIgnoringScore(p.sizeableUnitPattern(lt), expected);
  });

  it("test_mixed_pattern_string_units", () => {
    const lt = labelledTokens({
      tokens: ["2", "cup", "or", "1", "28", "ounce", "can", "chickpeas"],
      posTags: ["CD", "NN", "CC", "CD", "CD", "NN", "MD", "VB"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "QTY", "UNIT", "UNIT", "NAME"],
    });
    const p = new PostProcessor("2 cups or 1 28 ounce can chickpeas", lt, {}, { stringUnits: true });
    const expected = [
      ingredientAmountFactory("1", "can", "1 can", 0, 3),
      ingredientAmountFactory("28", "ounce", "28 ounces", 0, 4, { SINGULAR: true, stringUnits: true }),
    ];
    compareIgnoringScore(p.sizeableUnitPattern(lt), expected);
  });

  it("test_no_count_pattern", () => {
    const lt = labelledTokens({
      tokens: ["15", "ounce", "can", "chickpeas"],
      posTags: ["CD", "NN", "MD", "VB"],
      labels: ["QTY", "UNIT", "UNIT", "B_NAME_TOK"],
    });
    const p = new PostProcessor("15 ounce can chickpeas", lt, {});
    const expected = [
      ingredientAmountFactory("1", "can", "1 can", 0, 0),
      ingredientAmountFactory("15", "ounce", "15 ounces", 0, 0, { SINGULAR: true }),
    ];
    compareIgnoringScore(p.sizeableUnitPattern(lt), expected, true);
  });

  it("test_no_count_pattern_non_container_end", () => {
    const lt = labelledTokens({
      tokens: ["15", "ounce", "cup", "chickpeas"],
      posTags: ["CD", "NN", "NN", "NNS"],
      labels: ["QTY", "UNIT", "UNIT", "B_NAME_TOK"],
    });
    const p = new PostProcessor("15 ounce cup chickpeas", lt, {});
    expect(p.sizeableUnitPattern(lt)).toEqual([]);
  });
});
