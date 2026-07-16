import { describe, it, expect } from "vitest";
import {
  getUnit,
  unitFor,
  Quantity,
  UREG_MISINTERPRETED,
  isMisinterpretedUnit,
  parseUnitExpression,
} from "../../src/units/registry.js";

// Every expected numeric value below was verified against pint itself
// (with pint_extensions.txt loaded, matching how the upstream library
// constructs its UnitRegistry in `_common.py`), e.g.:
//
//   tools/.venv/bin/python3 -c "
//   import pint
//   from importlib.resources import files, as_file
//   u = pint.UnitRegistry()
//   with as_file(files('ingredient_parser') / 'pint_extensions.txt') as p:
//       u.load_definitions(p)
//   print(u('cup').to('ml'))"
//   # -> 236.58823649999997 milliliter

describe("getUnit: canonical resolution", () => {
  it("resolves an alias to its canonical pint name", () => {
    expect(getUnit("tbsp")!.toString()).toBe("tablespoon");
  });

  it("resolves 'g' to canonical 'gram'", () => {
    expect(getUnit("g")!.toString()).toBe("gram");
  });

  it("resolves 'oz' to canonical 'ounce'", () => {
    expect(getUnit("oz")!.toString()).toBe("ounce");
  });

  it("resolves plural 'grams' to canonical 'gram'", () => {
    expect(getUnit("grams")!.toString()).toBe("gram");
  });

  it("resolves 'tsp' to canonical 'teaspoon'", () => {
    expect(getUnit("tsp")!.toString()).toBe("teaspoon");
  });

  it("resolves 'floz' to canonical 'fluid_ounce'", () => {
    expect(getUnit("floz")!.toString()).toBe("fluid_ounce");
  });

  it("returns undefined for an unknown unit", () => {
    expect(getUnit("bogus_unit_xyz")).toBeUndefined();
  });
});

describe("unitFor: per-system volumetric variants", () => {
  // Verified: convert_to_pint_unit("cup", volumetric_units_system="imperial")
  // == UREG("imperial_cup").units  (upstream/tests/test_utils.py)
  it("maps cup -> imperial_cup under the imperial system", () => {
    expect(unitFor("cup", "imperial")!.toString()).toBe("imperial_cup");
  });

  it("maps cup -> jp_cup under the japanese system", () => {
    expect(unitFor("cup", "japanese")!.toString()).toBe("jp_cup");
  });

  it("maps cup -> metric_cup under the australian system", () => {
    expect(unitFor("cup", "australian")!.toString()).toBe("metric_cup");
  });

  it("maps cup -> metric_cup under the metric system", () => {
    expect(unitFor("cup", "metric")!.toString()).toBe("metric_cup");
  });

  it("maps tbsp -> aus_tablespoon under the australian system", () => {
    expect(unitFor("tbsp", "australian")!.toString()).toBe("aus_tablespoon");
  });

  it("maps tbsp -> metric_tablespoon under the japanese system", () => {
    expect(unitFor("tbsp", "japanese")!.toString()).toBe("metric_tablespoon");
  });

  it("maps pint -> imperial_pint under the imperial system", () => {
    expect(unitFor("pint", "imperial")!.toString()).toBe("imperial_pint");
  });

  it("maps pint -> aus_pint under the australian system", () => {
    expect(unitFor("pint", "australian")!.toString()).toBe("aus_pint");
  });

  it("leaves pint as pint under the metric system (no metric pint)", () => {
    expect(unitFor("pint", "metric")!.toString()).toBe("pint");
  });

  it("leaves cup as cup under us_customary", () => {
    expect(unitFor("cup", "us_customary")!.toString()).toBe("cup");
  });

  it("falls back to plain resolution for units with no system variant", () => {
    // "gram" has no entry in VOLUMETRIC_UNITS_W_ALTERNATIVES.
    expect(unitFor("gram", "imperial")!.toString()).toBe("gram");
  });
});

describe("Quantity.to: same-dimension conversion", () => {
  // Verified: u(2*u('cup')).to('ml') -> 473.1764729999999 milliliter
  it("converts 2 cup to 473.176473 ml", () => {
    const q = new Quantity(2, getUnit("cup")!);
    expect(q.to("milliliter").value).toBeCloseTo(473.176473, 6);
  });

  // Verified: (1.2*u('kg')).to('g') -> 1200.0 gram
  it("converts 1.2 kg to 1200 g", () => {
    const q = new Quantity(1.2, getUnit("kg")!);
    expect(q.to("gram").value).toBeCloseTo(1200, 6);
  });

  // Verified: u('imperial_cup').to_base_units() -> 0.0002841306250000001 m^3
  // 500 ml -> imperial_cup: 1.759753986392702 imperial_cup
  it("converts 500 ml to 1.759753986... imperial_cup", () => {
    const q = new Quantity(500, getUnit("ml")!);
    expect(q.to(getUnit("imperial_cup")!).value).toBeCloseTo(1.759753986392702, 6);
  });

  // Verified: 500 ml -> cup: 2.1133764188651885 cup
  it("converts 500 ml to 2.11337641... cup", () => {
    const q = new Quantity(500, getUnit("ml")!);
    expect(q.to("cup").value).toBeCloseTo(2.1133764188651885, 6);
  });

  it("converts 1 tablespoon to 3 teaspoons", () => {
    const q = new Quantity(1, getUnit("tablespoon")!);
    expect(q.to("teaspoon").value).toBeCloseTo(3, 6);
  });

  it("converts 1 pound to 16 ounces", () => {
    const q = new Quantity(1, getUnit("pound")!);
    expect(q.to("ounce").value).toBeCloseTo(16, 6);
  });
});

describe("Quantity.to: mass<->volume via density", () => {
  // Verified: with density context p=1000 kg/m^3, (1*u('cup')).to('gram')
  // -> 236.58823649999997 gram
  it("converts 1 cup to 236.5882365 gram using default density (water)", () => {
    const q = new Quantity(1, getUnit("cup")!);
    expect(q.to("gram").value).toBeCloseTo(236.5882365, 6);
  });

  // Verified: (1*u('gram')).to('ml') with density=1000 -> 0.9999999999999999 ml
  it("converts 1 gram to 1 ml using default density (water)", () => {
    const q = new Quantity(1, getUnit("gram")!);
    expect(q.to("milliliter").value).toBeCloseTo(1, 6);
  });

  it("supports a custom density, e.g. honey at 1420 kg/m^3", () => {
    // 1 liter -> 1420 grams at density 1420 kg/m^3 (simple volumeToMass check:
    // 1e-3 m^3 * 1420 kg/m^3 = 1.42 kg = 1420 g)
    const q = new Quantity(1, getUnit("liter")!);
    const density = new Quantity(1420, getUnit("gram")!); // unit field unused; only .value matters
    expect(q.to("gram", density).value).toBeCloseTo(1420, 6);
  });
});

describe("UREG_MISINTERPRETED: passthrough guard list", () => {
  it("contains 'pinch' (pint would parse it as pico-inch)", () => {
    expect(UREG_MISINTERPRETED.has("pinch")).toBe(true);
  });

  it("contains 'bar', 'link', 'shake', 'tin', 'unit', 'fat'", () => {
    for (const name of ["bar", "link", "shake", "tin", "unit", "fat"]) {
      expect(UREG_MISINTERPRETED.has(name)).toBe(true);
    }
  });

  it("does not contain ordinary units like 'cup' or 'gram'", () => {
    expect(UREG_MISINTERPRETED.has("cup")).toBe(false);
    expect(UREG_MISINTERPRETED.has("gram")).toBe(false);
  });

  it("isMisinterpretedUnit is case-insensitive, matching unit.lower() in _utils.py", () => {
    expect(isMisinterpretedUnit("Tin")).toBe(true);
    expect(isMisinterpretedUnit("Links")).toBe(true);
    expect(isMisinterpretedUnit("PINCH")).toBe(true);
  });
});

describe("Unit.eq", () => {
  it("treats a unit and its alias as equal", () => {
    expect(getUnit("tbsp")!.eq("tablespoon")).toBe(true);
    expect(getUnit("tablespoons")!.eq(getUnit("tbsp")!)).toBe(true);
  });

  it("treats different units as unequal", () => {
    expect(getUnit("cup")!.eq("gram")).toBe(false);
  });

  it("returns false when compared against an unresolvable string", () => {
    expect(getUnit("cup")!.eq("bogus_unit_xyz")).toBe(false);
  });
});

describe("parseUnitExpression: pint 'unit in UREG' emulation", () => {
  // Every expected string below was verified against pint itself:
  //   tools/.venv/bin/python -c "import sys; sys.path.insert(0,'upstream');
  //   from ingredient_parser._common import UREG; print(str(UREG('ml tablespoon').units))"
  //   # -> milliliter * tablespoon
  it("resolves an SI-prefixed token (fl -> femtoliter)", () => {
    expect(parseUnitExpression("fl")!.toString()).toBe("femtoliter");
  });

  it("resolves a product of units, canonicalised and alphabetically sorted", () => {
    expect(parseUnitExpression("ml tablespoon")!.toString()).toBe(
      "milliliter * tablespoon",
    );
    expect(parseUnitExpression("ounce cup")!.toString()).toBe("cup * ounce");
    expect(parseUnitExpression("tablespoon ml")!.toString()).toBe(
      "milliliter * tablespoon",
    );
  });

  it("returns undefined when any token is not a resolvable unit", () => {
    expect(parseUnitExpression("ml bogus_unit_xyz")).toBeUndefined();
    expect(parseUnitExpression("")).toBeUndefined();
  });
});
