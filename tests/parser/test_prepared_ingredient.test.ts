import { describe, it, expect } from "vitest";
import { parseIngredient } from "../../src/index.js";
import type { IngredientAmount } from "../../src/dataclasses.js";

// Port of upstream/tests/parser/test_prepared_ingredient.py
//
// These sentences never yield composite amounts, so accessing
// PREPARED_INGREDIENT directly (as Python does) is safe; the cast mirrors that.

describe("model_dependent", () => {
  describe("Test_prepared_ingredient", () => {
    it("test_no_preparation", () => {
      // PREPARED_INGREDIENT for all amounts is False.
      const parsed = parseIngredient("3 cups (750 g) flour");
      for (const amount of parsed.amount) {
        expect((amount as IngredientAmount).PREPARED_INGREDIENT).toBe(false);
      }
    });

    it("test_preparation_between_amount_and_name", () => {
      // PREPARED_INGREDIENT for all amounts is True.
      const parsed = parseIngredient("3 cups (750 g) sifted flour");
      for (const amount of parsed.amount) {
        expect((amount as IngredientAmount).PREPARED_INGREDIENT).toBe(true);
      }
    });

    it("test_preparation_between_name_and_amount", () => {
      // PREPARED_INGREDIENT for all amounts is True.
      const parsed = parseIngredient("Onion, finely chopped (about 1 cup)");
      for (const amount of parsed.amount) {
        expect((amount as IngredientAmount).PREPARED_INGREDIENT).toBe(true);
      }
    });

    it("test_preparation_after_amount_and_name", () => {
      // PREPARED_INGREDIENT for all amounts is False.
      const parsed = parseIngredient("3 cups (750 g) flour, sifted");
      for (const amount of parsed.amount) {
        expect((amount as IngredientAmount).PREPARED_INGREDIENT).toBe(false);
      }
    });

    it("test_multiple_names", () => {
      // PREPARED_INGREDIENT for all amounts is True.
      const parsed = parseIngredient("3 cups (750 ml) strained beef or vegetable stock");
      for (const amount of parsed.amount) {
        expect((amount as IngredientAmount).PREPARED_INGREDIENT).toBe(true);
      }
    });
  });
});
