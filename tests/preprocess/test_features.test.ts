import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_features.py
describe("TestPreProcessor_is_unit", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_true", () => {
    expect(p.isUnit("glass")).toBe(true);
  });

  it("test_false", () => {
    expect(p.isUnit("watt")).toBe(false);
  });
});

describe("TestPreProcessor_is_punc", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_true", () => {
    expect(p.isPunc("/")).toBe(true);
  });

  it("test_false", () => {
    expect(p.isPunc("beer")).toBe(false);
  });
});

describe("TestPreProcessor_is_numeric", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_integer", () => {
    expect(p.isNumeric("1")).toBe(true);
  });

  it("test_decimal", () => {
    expect(p.isNumeric("2.667")).toBe(true);
  });

  it("test_integer_range", () => {
    expect(p.isNumeric("1-2")).toBe(true);
  });

  it("test_decimal_range", () => {
    expect(p.isNumeric("3.5-5.5")).toBe(true);
  });

  it("test_mixed_range", () => {
    expect(p.isNumeric("1-1.5")).toBe(true);
  });

  it("test_false", () => {
    expect(p.isNumeric("1/2")).toBe(false);
  });

  it("test_false_range", () => {
    expect(p.isNumeric("red-wine")).toBe(false);
  });

  it("test_dozen", () => {
    expect(p.isNumeric("dozen")).toBe(true);
  });

  it("test_quart", () => {
    expect(p.isNumeric("one-quarter")).toBe(true);
  });
});

describe("TestPreProcessor_is_capitalised", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_capitalised", () => {
    expect(p.isCapitalised("Cheese")).toBe(true);
  });

  it("test_embeded_capital", () => {
    expect(p.isCapitalised("lemon-Zest")).toBe(false);
  });

  it("test_no_captials", () => {
    expect(p.isCapitalised("sausage")).toBe(false);
  });
});

describe("TestPreProcessor_is_inside_parentheses", () => {
  it("test_inside", () => {
    const p = new PreProcessor("8-10 teaspoons pine nuts (ground), toasted", {});
    expect(p.isInsideParentheses(5)).toBe(true);
  });

  it("test_before", () => {
    const p = new PreProcessor("8-10 teaspoons pine nuts (ground), toasted", {});
    expect(p.isInsideParentheses(2)).toBe(false);
  });

  it("test_after", () => {
    const p = new PreProcessor("8-10 teaspoons pine nuts (ground), toasted", {});
    expect(p.isInsideParentheses(7)).toBe(false);
  });

  it("test_open_parens", () => {
    const p = new PreProcessor("8-10 teaspoons pine nuts (ground), toasted", {});
    expect(p.isInsideParentheses(4)).toBe(true);
  });

  it("test_close_parens", () => {
    const p = new PreProcessor("8-10 teaspoons pine nuts (ground), toasted", {});
    expect(p.isInsideParentheses(6)).toBe(true);
  });

  it("test_multiple_parens", () => {
    const p = new PreProcessor("8-10 teaspoons (10 ml) pine nuts (ground), toasted", {});
    expect(p.isInsideParentheses(3)).toBe(true);
    expect(p.isInsideParentheses(6)).toBe(false);
    expect(p.isInsideParentheses(9)).toBe(true);
  });
});

describe("TestPreProcess_follows_plus", () => {
  it("test_no_plus", () => {
    const p = new PreProcessor("freshly ground black pepper", {});
    expect(p.followsPlus(2)).toBe(false);
  });

  it("test_before_plus", () => {
    const p = new PreProcessor("freshly ground black pepper, plus more to taste", {});
    expect(p.followsPlus(1)).toBe(false);
  });

  it("test_after_plus", () => {
    const p = new PreProcessor("freshly ground black pepper, plus more to taste", {});
    expect(p.followsPlus(7)).toBe(true);
  });

  it("test_index_is_plus", () => {
    const p = new PreProcessor("freshly ground black pepper, plus more to taste", {});
    expect(p.followsPlus(5)).toBe(false);
  });

  it("test_index_is_plus_and_follows_plus", () => {
    const p = new PreProcessor(
      "freshly ground black pepper, plus white pepper, plus more to taste",
      {},
    );
    expect(p.followsPlus(9)).toBe(true);
  });
});

describe("TestPreProcess_follows_comma", () => {
  it("test_no_comma", () => {
    const p = new PreProcessor("freshly ground black pepper", {});
    expect(p.followsComma(2)).toBe(false);
  });

  it("test_before_comma", () => {
    const p = new PreProcessor("freshly ground black pepper, to taste", {});
    expect(p.followsComma(1)).toBe(false);
  });

  it("test_after_comma", () => {
    const p = new PreProcessor("freshly ground black pepper, to taste", {});
    expect(p.followsComma(5)).toBe(true);
  });

  it("test_index_is_comma", () => {
    const p = new PreProcessor("freshly ground black pepper, to taste", {});
    expect(p.followsComma(4)).toBe(false);
  });

  it("test_index_is_comma_and_follows_comma", () => {
    const p = new PreProcessor("freshly ground black pepper, or white pepper, to taste", {});
    expect(p.followsComma(8)).toBe(true);
  });
});

describe("TestPreProcessor_is_ambiguous_unit", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_clove", () => {
    expect(p.isAmbiguousUnit("clove")).toBe(true);
  });

  it("test_leaves", () => {
    expect(p.isAmbiguousUnit("leaves")).toBe(true);
  });

  it("test_slabs", () => {
    expect(p.isAmbiguousUnit("slab")).toBe(true);
  });

  it("test_wedges", () => {
    expect(p.isAmbiguousUnit("wedges")).toBe(true);
  });

  it("test_cup", () => {
    expect(p.isAmbiguousUnit("cup")).toBe(false);
  });
});

describe("TestPreProcessor_word_shape", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_word_shape", () => {
    // Lower case
    expect(p.wordShape("pepper")).toEqual("xxxxxx");
    // Upper case
    expect(p.wordShape("Pepper")).toEqual("Xxxxxx");
    // Accents
    expect(p.wordShape("béchamel")).toEqual("xxxxxxxx");
    // Numbers
    expect(p.wordShape("2-pound")).toEqual("d-xxxxx");
    // Punctuation
    expect(p.wordShape(",")).toEqual(",");
  });
});
