import { describe, it, expect } from "vitest";
import { parseIngredient } from "../../src/index.js";
import { Frac } from "../../src/py/frac.js";

// Port of upstream/tests/parser/test_compound_units.py
//
// These depend on the CRF model producing [QTY, UNIT, UNIT] labels for the
// weight+container pattern, so they live in a `model_dependent` block.

/** Mirror Python's `Fraction(...) == <int>` comparison for parsed quantities. */
function qty(value: Frac | number | string): number | string {
  return value instanceof Frac ? value.toNumber() : value;
}

describe("model_dependent", () => {
  describe("TestParser_compound_units_no_count", () => {
    const cases: [string, string, number, string][] = [
      ["15 ounce can black beans", "can", 15, "black beans"],
      ["15 oz can chickpeas", "can", 15, "chickpeas"],
      ["28 ounce can crushed tomatoes", "can", 28, "crushed tomatoes"],
      ["6 ounce can tomato paste", "can", 6, "tomato paste"],
      ["10 ounce can tomato sauce", "can", 10, "tomato sauce"],
      ["8 ounce can tomato sauce", "can", 8, "tomato sauce"],
      ["12-ounce jar apricot preserves", "jar", 12, "apricot preserves"],
      ["16-ounce bag baby spinach", "bag", 16, "baby spinach"],
    ];

    it.each(cases)(
      "test_no_count_compound_unit: %s",
      (sentence, expectedContainer, expectedWeightQty, expectedName) => {
        const parsed = parseIngredient(sentence);

        expect(parsed.amount.length).toBe(2);
        // Primary amount: quantity of 1, container unit
        expect(qty(parsed.amount[0]!.quantity)).toBe(1);
        expect(String(parsed.amount[0]!.unit)).toBe(expectedContainer);
        // Secondary amount: weight
        expect(qty(parsed.amount[1]!.quantity)).toBe(expectedWeightQty);
        expect(String(parsed.amount[1]!.unit)).toBe("ounce");
        expect(parsed.name[0]!.text).toBe(expectedName);
      },
    );
  });

  describe("TestParser_compound_units_regression", () => {
    it("test_1_parenthesized_15oz_can", () => {
      const parsed = parseIngredient("1 (15 oz) can black beans");
      expect(parsed.amount.length).toBe(2);
      expect(qty(parsed.amount[0]!.quantity)).toBe(1);
      expect(String(parsed.amount[0]!.unit)).toBe("can");
      expect(qty(parsed.amount[1]!.quantity)).toBe(15);
      expect(String(parsed.amount[1]!.unit)).toBe("ounce");
      expect(parsed.name[0]!.text).toBe("black beans");
    });

    it("test_2_parenthesized_6oz_cans", () => {
      const parsed = parseIngredient("2 (6-oz) cans tomato paste");
      expect(parsed.amount.length).toBe(2);
      expect(qty(parsed.amount[0]!.quantity)).toBe(2);
      expect(String(parsed.amount[0]!.unit)).toBe("cans");
      expect(qty(parsed.amount[1]!.quantity)).toBe(6);
      expect(String(parsed.amount[1]!.unit)).toBe("ounce");
      expect(parsed.name[0]!.text).toBe("tomato paste");
    });

    it("test_1_28_ounce_can", () => {
      const parsed = parseIngredient("1 28-ounce can crushed tomatoes");
      expect(parsed.amount.length).toBe(2);
      expect(qty(parsed.amount[0]!.quantity)).toBe(1);
      expect(String(parsed.amount[0]!.unit)).toBe("can");
      expect(qty(parsed.amount[1]!.quantity)).toBe(28);
      expect(String(parsed.amount[1]!.unit)).toBe("ounce");
      expect(parsed.name[0]!.text).toBe("crushed tomatoes");
    });

    it("test_simple_15_ounces_butter", () => {
      // 15 ounces of a simple ingredient should not trigger the container pattern.
      const parsed = parseIngredient("15 ounces butter");
      expect(parsed.amount.length).toBe(1);
      expect(qty(parsed.amount[0]!.quantity)).toBe(15);
      expect(String(parsed.amount[0]!.unit)).toBe("ounce");
      expect(parsed.name[0]!.text).toBe("butter");
    });

    it("test_simple_2_cups_flour", () => {
      const parsed = parseIngredient("2 cups flour");
      expect(parsed.amount.length).toBe(1);
      expect(qty(parsed.amount[0]!.quantity)).toBe(2);
      expect(parsed.name[0]!.text).toBe("flour");
    });

    it("test_simple_1_clove_garlic", () => {
      const parsed = parseIngredient("1 clove garlic");
      expect(parsed.amount.length).toBe(1);
      expect(qty(parsed.amount[0]!.quantity)).toBe(1);
      expect(String(parsed.amount[0]!.unit)).toBe("clove");
      expect(parsed.name[0]!.text).toBe("garlic");
    });
  });
});
