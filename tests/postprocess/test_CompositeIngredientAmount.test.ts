import { describe, it, expect } from "vitest";
import { CompositeIngredientAmount, UnitSystem } from "../../src/dataclasses.js";
import { ingredientAmountFactory } from "../../src/en/_utils.js";
import { getUnit } from "../../src/units/registry.js";

// Port of upstream/tests/postprocess/test_CompositeIngredientAmount.py
//
// Divergence note: `combined`/`convertTo` use double arithmetic, so the
// combined magnitude differs from pint's exact Fraction by a few ULPs; the
// pinned exact Fraction is asserted with `toBeCloseTo`.

describe("TestPostProcessor_CompositeIngredientAmount", () => {
  it("test_composite_ingredient_amount_us_customary", () => {
    const am1 = ingredientAmountFactory("2", "cups", "2 cups", 0, 0);
    const am2 = ingredientAmountFactory("2", "tbsp", "2 tbsp", 0, 0);
    const amount = new CompositeIngredientAmount({ amounts: [am1, am2], join: "", subtractive: false });
    expect(amount.unitSystem).toBe(UnitSystem.US_CUSTOMARY);
  });

  it("test_composite_ingredient_amount_imperial", () => {
    const am1 = ingredientAmountFactory("1", "cup", "1 cup", 0, 0, { volumetricUnitsSystem: "imperial" });
    const am2 = ingredientAmountFactory("2", "tbsp", "2 tbsp", 0, 0, { volumetricUnitsSystem: "imperial" });
    const amount = new CompositeIngredientAmount({ amounts: [am1, am2], join: "", subtractive: false });
    expect(amount.unitSystem).toBe(UnitSystem.IMPERIAL);
  });
});

describe("TestPostProcessor_CompositeIngredientAmount_convert_to", () => {
  it("test_composite_ingredient_amount", () => {
    const am1 = ingredientAmountFactory("2", "lbs", "2 lb", 0, 0);
    const am2 = ingredientAmountFactory("2", "oz", "2 oz", 0, 0);
    const amount = new CompositeIngredientAmount({ amounts: [am1, am2], join: "", subtractive: false });
    const converted = amount.convertTo("kg");
    // pint (exact Fraction): 77110702900000017 / 80000000000000000 = 0.9638837862500002
    expect(converted.value).toBeCloseTo(0.9638837862500002, 12);
    expect(converted.unit).toEqual(getUnit("kg"));
  });
});
