import { describe, it, expect } from "vitest";
import { parseIngredient } from "../../src/index.js";

// Port of upstream/tests/parser/test_separate_names.py

describe("model_dependent", () => {
  describe("Test_separate_names", () => {
    it("test_separate_names", () => {
      // The two ingredient names are returned.
      const parsed = parseIngredient("200 ml beef or chicken stock", {
        separateNames: true,
      });
      expect(parsed.name.length).toBe(2);
    });

    it("test_not_separate_names", () => {
      // The one ingredient name is returned.
      const parsed = parseIngredient("200 ml beef of chicken stock", {
        separateNames: false,
      });
      expect(parsed.name.length).toBe(1);
    });
  });
});
