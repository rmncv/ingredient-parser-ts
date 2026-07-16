import { describe, it, expect } from "vitest";
import { parseIngredient } from "../../src/index.js";

// Port of upstream/tests/parser/test_custom_units.py

describe("model_dependent", () => {
  describe("TestParser_custom_units", () => {
    it("test_unrecognised_units", () => {
      // The word "brillig" is not identified as a unit.
      const p = parseIngredient("2 brillig sausages");
      expect(String(p.amount[0]!.unit)).toBe("");
      expect(p.amount[0]!.text).toBe("2");
    });

    it("test_custom_units", () => {
      // "brillig" is recognised as a unit when provided in a custom units dict.
      const p = parseIngredient("2 brillig sausages", {
        customUnits: { brilligs: "brillig" },
      });
      expect(String(p.amount[0]!.unit)).toBe("brilligs");
      expect(p.amount[0]!.text).toBe("2 brilligs");
    });

    it("test_custom_unit_capitalised", () => {
      // "Brillig" is recognised as a unit via the auto-capitalised entry, even
      // though the capitalised form is not present in the custom units dict.
      const p = parseIngredient("2 Brillig sausages", {
        customUnits: { brilligs: "brillig" },
      });
      expect(String(p.amount[0]!.unit)).toBe("Brilligs");
      expect(p.amount[0]!.text).toBe("2 Brilligs");
    });
  });
});
