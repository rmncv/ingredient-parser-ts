import { describe, it, expect } from "vitest";
import { parseIngredient } from "../../src/index.js";

// Port of upstream/tests/parser/test_cloves.py
//
// Cloves can be a unit or an ingredient, but the parser struggled to get it
// right. These assertions depend on the CRF model output, so they live in a
// `model_dependent` block (rule 9). Python's `in`/`!=` against `parsed.amount
// [0].unit` operate on the unit's string form (pint.Unit stringifies), so we
// coerce via `String(...)`.

describe("model_dependent", () => {
  describe("TestParser_cloves", () => {
    it("test_clove_ingredient_singular", () => {
      // "clove" is marked as a name
      const parsed = parseIngredient("1 clove");
      expect(parsed.name[0]!.text).toContain("clove");
      expect(String(parsed.amount[0]!.unit)).not.toContain("clove");
    });

    it("test_clove_ingredient_plural", () => {
      // "cloves" is marked as a name
      const parsed = parseIngredient("1 tsp cloves");
      expect(parsed.name[0]!.text).toContain("cloves");
      expect(String(parsed.amount[0]!.unit)).not.toBe("cloves");
    });

    it("test_clove_unit_singular", () => {
      // "clove" is marked as a unit
      const parsed = parseIngredient("1 garlic clove");
      expect(parsed.name[0]!.text).not.toContain("clove");
      expect(String(parsed.amount[0]!.unit)).toContain("clove");
    });

    it("test_clove_unit_singular_switched_order", () => {
      // "clove" is marked as a unit
      const parsed = parseIngredient("1 clove garlic");
      expect(parsed.name[0]!.text).not.toContain("clove");
      expect(String(parsed.amount[0]!.unit)).toContain("clove");
    });

    it("test_clove_unit_plural", () => {
      // "cloves" is marked as a unit
      const parsed = parseIngredient("2 garlic cloves");
      expect(parsed.name[0]!.text).not.toContain("cloves");
      expect(String(parsed.amount[0]!.unit)).toContain("cloves");
    });

    it("test_clove_unit_plural_switched_order", () => {
      // "cloves" is marked as a unit
      const parsed = parseIngredient("2 cloves garlic");
      expect(parsed.name[0]!.text).not.toContain("cloves");
      expect(String(parsed.amount[0]!.unit)).toContain("cloves");
    });
  });
});
