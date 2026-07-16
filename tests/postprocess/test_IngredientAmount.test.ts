import { describe, it, expect } from "vitest";
import { UnitSystem } from "../../src/dataclasses.js";
import { ingredientAmountFactory } from "../../src/en/_utils.js";
import { getUnit } from "../../src/units/registry.js";
import { Frac } from "../../src/py/frac.js";

// Port of upstream/tests/postprocess/test_IngredientAmount.py
//
// Divergence note: the units module converts in `number` (double) arithmetic
// rather than pint's exact `Fraction` arithmetic, so converted quantities
// differ from pint's exact `Fraction` results by at most a few ULPs. The tests
// that pin exact `Fraction` values upstream are asserted with `toBeCloseTo`
// here; the `%g`-formatted `text` (6 significant figures) is asserted exactly.

describe("TestPostProcessor_IngredientAmount", () => {
  it("test_float_quantity", () => {
    const amount = ingredientAmountFactory("25", "g", "25 g", 0, 0);
    expect(amount.quantity).toEqual(new Frac(25));
    expect(amount.quantityMax).toEqual(new Frac(25));
    expect(amount.unitSystem).toBe(UnitSystem.METRIC);
  });

  it("test_range_quantity", () => {
    const amount = ingredientAmountFactory("25-30", "g", "25 g", 0, 0);
    expect(amount.quantity).toEqual(new Frac(25));
    expect(amount.quantityMax).toEqual(new Frac(30));
    expect(amount.RANGE).toBe(true);
    expect(amount.unitSystem).toBe(UnitSystem.METRIC);
  });

  it("test_multiplier_quantity", () => {
    const amount = ingredientAmountFactory("1x", "can", "1x can", 0, 0);
    expect(amount.quantity).toEqual(new Frac(1));
    expect(amount.quantityMax).toEqual(new Frac(1));
    expect(amount.MULTIPLIER).toBe(true);
    expect(amount.unitSystem).toBe(UnitSystem.OTHER);
  });

  it("test_pluralisation_string_unit", () => {
    const amount = ingredientAmountFactory("2", "can", "2 can", 0, 0);
    expect(amount.unit).toBe("cans");
    expect(amount.text).toBe("2 cans");
    expect(amount.unitSystem).toBe(UnitSystem.OTHER);
  });

  it("test_pluralisation_pint_unit", () => {
    const amount = ingredientAmountFactory("200", "gram", "200 grams", 0, 0);
    expect(amount.unit).toEqual(getUnit("gram"));
    expect(amount.text).toBe("200 grams");
    expect(amount.unitSystem).toBe(UnitSystem.METRIC);
  });

  it("test_fraction_range_quantity", () => {
    const amount = ingredientAmountFactory("#1$4-#1$2", "tsp", "1/4-1/2 tsp", 0, 0);
    expect(amount.quantity).toEqual(new Frac(1n, 4n));
    expect(amount.quantityMax).toEqual(new Frac(1n, 2n));
    expect(amount.text).toBe("1/4-1/2 tsp");
    expect(amount.RANGE).toBe(true);
    expect(amount.unitSystem).toBe(UnitSystem.US_CUSTOMARY);
  });
});

describe("Test_IngredientAmountVolumetricUnitSystem", () => {
  it("test_metric_volumentric_measurements", () => {
    const amount = ingredientAmountFactory("1", "tbsp", "1 tbsp", 0, 0, {
      volumetricUnitsSystem: "metric",
    });
    expect(amount.unitSystem).toBe(UnitSystem.METRIC);
    expect(amount.unit).toEqual(getUnit("metric_tablespoon"));
  });

  it("test_imperial_volumentric_measurements", () => {
    const amount = ingredientAmountFactory("1", "pint", "1 pint", 0, 0, {
      volumetricUnitsSystem: "imperial",
    });
    expect(amount.unitSystem).toBe(UnitSystem.IMPERIAL);
    expect(amount.unit).toEqual(getUnit("imperial_pint"));
  });

  it("test_japanese_volumentric_measurements", () => {
    const amount = ingredientAmountFactory("1", "cup", "1 cup", 0, 0, {
      volumetricUnitsSystem: "japanese",
    });
    expect(amount.unitSystem).toBe(UnitSystem.JAPANESE);
    expect(amount.unit).toEqual(getUnit("jp_cup"));
  });

  it("test_australian_volumentric_measurements", () => {
    const amount = ingredientAmountFactory("1", "pint", "1 pint", 0, 0, {
      volumetricUnitsSystem: "australian",
    });
    expect(amount.unitSystem).toBe(UnitSystem.AUSTRALIAN);
    expect(amount.unit).toEqual(getUnit("aus_pint"));
  });
});

describe("Test_IngredientAmount_convert_to", () => {
  it("test_convert", () => {
    const amount = ingredientAmountFactory("1.2", "kg", "1.2 kg", 0, 0);
    const converted = amount.convertTo("g");
    // 1000 * 1.2 == 1200 (exact for this factor)
    expect(converted.quantity).toBe(1200);
    expect(converted.quantityMax).toBe(1200);
    expect(converted.unit).toEqual(getUnit("gram"));
    expect(converted.text).toBe("1200 gram");
    expect(converted.unitSystem).toBe(UnitSystem.METRIC);
  });

  it("test_convert_metric_to_us_customary", () => {
    const amount = ingredientAmountFactory("500", "ml", "500 ml", 0, 0);
    const converted = amount.convertTo("cup");
    // pint (exact Fraction): 4226752837730377 / 2000000000000000 = 2.1133764188651885
    expect(converted.quantity as number).toBeCloseTo(2.1133764188651885, 12);
    expect(converted.quantityMax as number).toBeCloseTo(2.1133764188651885, 12);
    expect(converted.unit).toEqual(getUnit("cup"));
    expect(converted.text).toBe("2.11338 cup");
    expect(converted.unitSystem).toBe(UnitSystem.US_CUSTOMARY);
  });

  it("test_convert_metric_to_imperial", () => {
    const amount = ingredientAmountFactory("500", "ml", "500 ml", 0, 0);
    const converted = amount.convertTo("imperial_cup");
    // pint (exact Fraction): 879876993196351 / 500000000000000 = 1.759753986392702
    expect(converted.quantity as number).toBeCloseTo(1.759753986392702, 12);
    expect(converted.quantityMax as number).toBeCloseTo(1.759753986392702, 12);
    expect(converted.unit).toEqual(getUnit("imperial_cup"));
    expect(converted.text).toBe("1.75975 imperial_cup");
    expect(converted.unitSystem).toBe(UnitSystem.IMPERIAL);
  });

  it("test_string_unit", () => {
    const amount = ingredientAmountFactory("1", "can", "1 can", 0, 0);
    expect(() => amount.convertTo("ml")).toThrow(TypeError);
  });

  it("test_string_quantity", () => {
    const amount = ingredientAmountFactory("dozen", "ml", "dozen ml", 0, 0);
    expect(() => amount.convertTo("ml")).toThrow(TypeError);
  });
});
