import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { CompositeIngredientAmount } from "../../src/dataclasses.js";
import { ingredientAmountFactory } from "../../src/en/_utils.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_composite_amounts_pattern.py

function compareComposite(
  output: CompositeIngredientAmount[],
  expected: CompositeIngredientAmount[],
  checkCombined = true,
): void {
  expect(output.length).toBe(expected.length);
  output.forEach((out, i) => {
    const exp = expected[i]!;
    expect(out.amounts).toEqual(exp.amounts);
    expect(out.join).toBe(exp.join);
    expect(out.confidence).toBe(exp.confidence);
    expect(out.startingIndex).toBe(exp.startingIndex);
    if (checkCombined) {
      expect(out.combined()).toEqual(exp.combined());
    }
  });
}

describe("TestPostProcessor_composite_amounts_pattern", () => {
  it("test_lb_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["500", "g", "/", "1", "lb", "2", "oz", "pecorino", "romano", "cheese", "(", "or", "a", "vegetarian", "alternative", ")"],
      posTags: ["CD", "JJ", "$", "CD", "JJ", "CD", "NN", "NN", "NN", "NN", "(", "CC", "DT", "JJ", "NN", ")"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK", "I_NAME_TOK", "COMMENT", "COMMENT", "COMMENT", "COMMENT", "COMMENT", "COMMENT"],
    });
    const p = new PostProcessor("500g/1lb 2oz pecorino romano cheese (or a vegetarian alternative)", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "lb", "1 lb", 0, 3),
          ingredientAmountFactory("2", "oz", "2 oz", 0, 5),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_pint_fl_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1.5", "litre", "/", "2", "pint", "12.75", "fl", "oz", "water"],
      posTags: ["CD", "JJ", "$", "CD", "NN", "CD", "NN", "NN", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "QTY", "UNIT", "UNIT", "B_NAME_TOK"],
    });
    const p = new PostProcessor("1.5 litres/2 pints 12¾fl oz water", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("2", "pint", "2 pints", 0, 3),
          ingredientAmountFactory("12.75", "floz", "12.75 fl oz", 0, 5),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_imperial_pint_fl_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1.5", "litre", "/", "2", "pint", "12.75", "fl", "oz", "water"],
      posTags: ["CD", "JJ", "$", "CD", "NN", "CD", "NN", "NN", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "QTY", "UNIT", "UNIT", "B_NAME_TOK"],
    });
    const p = new PostProcessor("1.5 litres/2 pints 12¾fl oz water", lt, {}, { volumetricUnitsSystem: "imperial" });
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("2", "pint", "2 pints", 0, 3, { volumetricUnitsSystem: "imperial" }),
          ingredientAmountFactory("12.75", "fluid ounce", "12.75 fl oz", 0, 5, { volumetricUnitsSystem: "imperial" }),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_string_pint_fl_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1.5", "litre", "/", "2", "pint", "12.75", "fl", "oz", "water"],
      posTags: ["CD", "JJ", "$", "CD", "NN", "CD", "NN", "NN", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "QTY", "UNIT", "UNIT", "B_NAME_TOK"],
    });
    const p = new PostProcessor("1.5 litres/2 pints 12¾fl oz water", lt, {}, { stringUnits: true });
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("2", "pints", "2 pints", 0, 3, { stringUnits: true }),
          ingredientAmountFactory("12.75", "fl oz", "12.75 fl oz", 0, 5, { stringUnits: true }),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    const output = p.compositeAmountsPattern(lt);
    compareComposite(output, expected, false);
    for (const out of output) {
      expect(() => out.combined()).toThrow(TypeError);
    }
  });

  it("test_plus_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "cup", "plus", "2", "tablespoon", "(", "about", "5", "ounce", ")", "all-purpose", "flour"],
      posTags: ["CD", "NN", "CC", "CD", "NN", "(", "IN", "CD", "NN", ")", "JJ", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "PUNC", "COMMENT", "QTY", "UNIT", "PUNC", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("1 cup plus 2 tablespoons (about 5 ounces) all-purpose flour", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "cup", "1 cup", 0, 0),
          ingredientAmountFactory("2", "tablespoon", "2 tablespoons", 0, 3),
        ],
        join: " plus ",
        subtractive: false,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_plus_punc_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "cup", "+", "2", "tablespoon", "(", "about", "5", "ounce", ")", "all-purpose", "flour"],
      posTags: ["CD", "NN", "VBD", "CD", "NN", "(", "IN", "CD", "NN", ")", "JJ", "NN"],
      labels: ["QTY", "UNIT", "PUNC", "QTY", "UNIT", "PUNC", "COMMENT", "QTY", "UNIT", "PUNC", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("1 cup + 2 tablespoons (about 5 ounces) all-purpose flour", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "cup", "1 cup", 0, 0),
          ingredientAmountFactory("2", "tablespoon", "2 tablespoons", 0, 3),
        ],
        join: " + ",
        subtractive: false,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_and_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "cup", "and", "2", "tablespoon", "(", "about", "5", "ounce", ")", "all-purpose", "flour"],
      posTags: ["CD", "NN", "CC", "CD", "NN", "(", "IN", "CD", "NN", ")", "JJ", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "PUNC", "COMMENT", "QTY", "UNIT", "PUNC", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("1 cup and 2 tablespoons (about 5 ounces) all-purpose flour", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "cup", "1 cup", 0, 0),
          ingredientAmountFactory("2", "tablespoon", "2 tablespoons", 0, 3),
        ],
        join: " and ",
        subtractive: false,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_minus_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "cup", "minus", "2", "tablespoon", "(", "about", "5", "ounce", ")", "all-purpose", "flour"],
      posTags: ["CD", "NN", "CC", "CD", "NN", "(", "IN", "CD", "NN", ")", "JJ", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "PUNC", "COMMENT", "QTY", "UNIT", "PUNC", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("1 cup minus 2 tablespoons (about 5 ounces) all-purpose flour", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "cup", "1 cup", 0, 0),
          ingredientAmountFactory("2", "tablespoon", "2 tablespoons", 0, 3),
        ],
        join: " minus ",
        subtractive: true,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_no_pattern", () => {
    const lt = labelledTokens({
      tokens: ["2", "pint", "or", "40", "fl", "oz", "water"],
      posTags: ["CD", "NN", "CC", "CD", "JJ", "JJ", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "QTY", "UNIT", "UNIT", "B_NAME_TOK"],
    });
    const p = new PostProcessor("2 pints or 40 fl oz water", lt, {});
    expect(p.compositeAmountsPattern(lt)).toEqual([]);
  });

  it("test_plus_punc_comment_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "cup", ",", "plus", "2", "tablespoon", "(", "about", "5", "ounce", ")", "all-purpose", "flour"],
      posTags: ["CD", "NN", ",", "CC", "CD", "NN", "(", "IN", "CD", "NN", ")", "JJ", "NN"],
      labels: ["QTY", "UNIT", "PUNC", "COMMENT", "QTY", "UNIT", "PUNC", "COMMENT", "QTY", "UNIT", "PUNC", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("1 cup, plus 2 tablespoons (about 5 ounces) all-purpose flour", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "cup", "1 cup", 0, 0),
          ingredientAmountFactory("2", "tablespoon", "2 tablespoons", 0, 4),
        ],
        join: " plus ",
        subtractive: false,
      }),
    ];
    compareComposite(p.compositeAmountsPattern(lt), expected);
  });

  it("test_approximate_lb_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["About", "1", "lb", "2", "oz", "pecorino", "romano", "cheese", "(", "or", "a", "vegetarian", "alternative", ")"],
      posTags: ["RB", "CD", "JJ", "CD", "NN", "NN", "NN", "NN", "(", "CC", "DT", "JJ", "NN", ")"],
      labels: ["COMMENT", "QTY", "UNIT", "QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK", "I_NAME_TOK", "COMMENT", "COMMENT", "COMMENT", "COMMENT", "COMMENT", "COMMENT"],
    });
    const p = new PostProcessor("About 1lb 2oz pecorino romano cheese (or a vegetarian alternative)", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "lb", "1 lb", 0, 1, { APPROXIMATE: true }),
          ingredientAmountFactory("2", "oz", "2 oz", 0, 3, { APPROXIMATE: true }),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    const output = p.compositeAmountsPattern(lt);
    compareComposite(output, expected);
    for (const out of output) {
      for (const amount of out.amounts) {
        expect(amount.APPROXIMATE).toBe(true);
      }
    }
  });

  it("test_singular_lb_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["1", "lb", "2", "oz", "each", "pecorino", "romano", "and", "parmesan", "cheese"],
      posTags: ["CD", "JJ", "CD", "IN", "DT", "NN", "NN", "CC", "NN", "NN"],
      labels: ["QTY", "UNIT", "QTY", "UNIT", "COMMENT", "B_NAME_TOK", "I_NAME_TOK", "NAME_SEP", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("1lb 2oz each pecorino romano and parmesan cheese", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "lb", "1 lb", 0, 0, { SINGULAR: true }),
          ingredientAmountFactory("2", "oz", "2 oz", 0, 2, { SINGULAR: true }),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    const output = p.compositeAmountsPattern(lt);
    compareComposite(output, expected);
    for (const out of output) {
      for (const amount of out.amounts) {
        expect(amount.SINGULAR).toBe(true);
      }
    }
  });

  it("test_singular_and_approximate_lb_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["2", "large", "butternut", "squash", ",", "each", "about", "1", "lb", "1", "oz"],
      posTags: ["CD", "JJ", "NN", "NN", ",", "DT", "RB", "CD", "JJ", "CD", "NN"],
      labels: ["QTY", "SIZE", "B_NAME_TOK", "I_NAME_TOK", "PUNC", "COMMENT", "COMMENT", "QTY", "UNIT", "QTY", "UNIT"],
    });
    const p = new PostProcessor("2 large butternut squash, each about 1lb 1 oz", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "lb", "1 lb", 0, 7, { APPROXIMATE: true, SINGULAR: true }),
          ingredientAmountFactory("1", "oz", "1 oz", 0, 9, { APPROXIMATE: true, SINGULAR: true }),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    const output = p.compositeAmountsPattern(lt);
    compareComposite(output, expected);
    for (const out of output) {
      for (const amount of out.amounts) {
        expect(amount.APPROXIMATE).toBe(true);
        expect(amount.SINGULAR).toBe(true);
      }
    }
  });

  it("test_prepared_lb_oz_pattern", () => {
    const lt = labelledTokens({
      tokens: ["Strained", "homemade", "chicken", "stock", ",", "to", "yield", "1", "pint", "3", "fl", "oz"],
      posTags: ["VBN", "JJ", "NN", "NN", ",", "TO", "VB", "CD", "NN", "CD", "NN", "NN"],
      labels: ["PREP", "B_NAME_TOK", "I_NAME_TOK", "I_NAME_TOK", "PUNC", "COMMENT", "COMMENT", "QTY", "UNIT", "QTY", "UNIT", "UNIT"],
    });
    const p = new PostProcessor("Strained homemade chicken stock, to yield 1 pint 3 fl oz", lt, {});
    const expected = [
      new CompositeIngredientAmount({
        amounts: [
          ingredientAmountFactory("1", "pint", "1 pint", 0, 7, { PREPARED_INGREDIENT: true }),
          ingredientAmountFactory("3", "fl oz", "3 fl oz", 0, 9, { PREPARED_INGREDIENT: true }),
        ],
        join: "",
        subtractive: false,
      }),
    ];
    const output = p.compositeAmountsPattern(lt);
    compareComposite(output, expected);
    for (const out of output) {
      for (const amount of out.amounts) {
        expect(amount.PREPARED_INGREDIENT).toBe(true);
      }
    }
  });
});
