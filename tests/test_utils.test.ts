import { describe, it, expect } from "vitest";
import {
  convertToUnit,
  isUnitSynonym,
  pluraliseUnits,
  combineQuantitiesSplitByAnd,
  replaceStringRange,
  tokenize,
} from "../src/en/_utils.js";
import { getUnit, Unit } from "../src/units/registry.js";
import {
  UNITS,
  STOP_WORDS,
  FLATTENED_UNITS_LIST,
  AMBIGUOUS_UNITS,
  SIZES,
  STRING_NUMBERS,
  UNICODE_FRACTIONS,
  LENGTH_UNITS,
  DIMENSIONS,
  INDEFINITE_QUANTIFIERS,
} from "../src/en/_constants.js";

// Helper: mirror the Python tests' `UREG("...").units` comparisons by
// comparing the canonical unit name (pint.Unit's str) of the resolved unit.
function unitName(u: Unit | string): string {
  return typeof u === "string" ? u : u.toString();
}

// Port of upstream/tests/test_utils.py

describe("TestUtils_pluralise_units", () => {
  it("test_single: each singular unit gets pluralised", () => {
    expect(pluraliseUnits("teaspoon", {})).toBe("teaspoons");
    expect(pluraliseUnits("cup", {})).toBe("cups");
    expect(pluraliseUnits("loaf", {})).toBe("loaves");
    expect(pluraliseUnits("leaf", {})).toBe("leaves");
    expect(pluraliseUnits("chunk", {})).toBe("chunks");
    expect(pluraliseUnits("Box", {})).toBe("Boxes");
    expect(pluraliseUnits("Wedge", {})).toBe("Wedges");
  });

  it("test_embedded: the unit embedded in each sentence gets pluralised", () => {
    expect(pluraliseUnits("2 tablespoon olive oil", {})).toBe("2 tablespoons olive oil");
    expect(pluraliseUnits("3 cup (750 milliliter) milk", {})).toBe(
      "3 cups (750 milliliters) milk",
    );
  });
});

describe("Test_convert_to_pint_unit", () => {
  it("test_empty_string", () => {
    expect(convertToUnit("")).toBe("");
  });

  it("test_simple_cases", () => {
    expect(unitName(convertToUnit("g"))).toBe(unitName(getUnit("g")!));
    expect(unitName(convertToUnit("gram"))).toBe(unitName(getUnit("g")!));
    expect(unitName(convertToUnit("grams"))).toBe(unitName(getUnit("g")!));
    expect(unitName(convertToUnit("oz"))).toBe(unitName(getUnit("oz")!));
    expect(unitName(convertToUnit("ounce"))).toBe(unitName(getUnit("oz")!));
    expect(unitName(convertToUnit("ounces"))).toBe(unitName(getUnit("oz")!));
  });

  it("test_modified_cases", () => {
    expect(unitName(convertToUnit("fl oz"))).toBe(unitName(getUnit("fluid_ounce")!));
    expect(unitName(convertToUnit("fluid oz"))).toBe(unitName(getUnit("fluid_ounce")!));
    expect(unitName(convertToUnit("fl ounce"))).toBe(unitName(getUnit("fluid_ounce")!));
    expect(unitName(convertToUnit("fluid ounce"))).toBe(unitName(getUnit("fluid_ounce")!));
    expect(unitName(convertToUnit("Cl"))).toBe(unitName(getUnit("centiliter")!));
    expect(unitName(convertToUnit("G"))).toBe(unitName(getUnit("gram")!));
    expect(unitName(convertToUnit("Ml"))).toBe(unitName(getUnit("milliliter")!));
    expect(unitName(convertToUnit("Pt"))).toBe(unitName(getUnit("pint")!));
    expect(unitName(convertToUnit("Tb"))).toBe(unitName(getUnit("tablespoon")!));
    expect(unitName(convertToUnit("C"))).toBe(unitName(getUnit("cup")!));
    expect(unitName(convertToUnit("c"))).toBe(unitName(getUnit("cup")!));
  });

  it("test_fl_oz_regression: 'fl oz' resolves to fluid_ounce, not femtoliter * ounce", () => {
    // Regression test: "fl" must not be parsed as the SI-prefixed
    // "femtoliter" when it appears as part of the compound "fl oz" token.
    const result = convertToUnit("fl oz");
    expect(unitName(result)).toBe("fluid_ounce");
  });

  it("test_bare_pt_resolves_to_pint", () => {
    // "pt" (lowercase, unabbreviated by any other replacement) resolves to
    // pint, matching upstream `convert_to_pint_unit("pt")` -> pint.Unit("pint").
    const result = convertToUnit("pt");
    expect(unitName(result)).toBe("pint");
  });

  it("test_alternative_pints", () => {
    expect(unitName(convertToUnit("pint", "imperial"))).toBe(unitName(getUnit("imperial_pint")!));
    expect(unitName(convertToUnit("pint", "australian"))).toBe(unitName(getUnit("aus_pint")!));
    expect(unitName(convertToUnit("pint", "metric"))).toBe(unitName(getUnit("pint")!));
  });

  it("test_imperial_units", () => {
    expect(unitName(convertToUnit("fl oz", "imperial"))).toBe(
      unitName(getUnit("imperial_fluid_ounce")!),
    );
    expect(unitName(convertToUnit("cup", "imperial"))).toBe(unitName(getUnit("imperial_cup")!));
    expect(unitName(convertToUnit("quart", "imperial"))).toBe(unitName(getUnit("imperial_quart")!));
    expect(unitName(convertToUnit("pint", "imperial"))).toBe(unitName(getUnit("imperial_pint")!));
    expect(unitName(convertToUnit("gallon", "imperial"))).toBe(
      unitName(getUnit("imperial_gallon")!),
    );
  });

  it("test_metric_volumetric_units", () => {
    expect(unitName(convertToUnit("cup", "metric"))).toBe(unitName(getUnit("metric_cup")!));
    expect(unitName(convertToUnit("tbsp", "metric"))).toBe(unitName(getUnit("metric_tbsp")!));
    expect(unitName(convertToUnit("teaspoon", "metric"))).toBe(unitName(getUnit("metric_teaspoon")!));
  });

  it("test_australian_units", () => {
    expect(unitName(convertToUnit("cup", "australian"))).toBe(unitName(getUnit("metric_cup")!));
    expect(unitName(convertToUnit("tbsp", "australian"))).toBe(unitName(getUnit("aus_tbsp")!));
    expect(unitName(convertToUnit("teaspoon", "australian"))).toBe(
      unitName(getUnit("metric_teaspoon")!),
    );
  });

  it("test_japanese_units", () => {
    expect(unitName(convertToUnit("cup", "japanese"))).toBe(unitName(getUnit("jp_cup")!));
    expect(unitName(convertToUnit("tbsp", "japanese"))).toBe(unitName(getUnit("metric_tbsp")!));
    expect(unitName(convertToUnit("teaspoon", "japanese"))).toBe(
      unitName(getUnit("metric_teaspoon")!),
    );
  });

  it("test_unit_with_hypen", () => {
    expect(convertToUnit("medium-size")).toBe("medium-size");
  });

  it("test_misinterpretted_units", () => {
    expect(convertToUnit("pinch")).toBe("pinch");
    expect(convertToUnit("bars")).toBe("bars");
    expect(convertToUnit("Tin")).toBe("Tin");
    expect(convertToUnit("Links")).toBe("Links");
    expect(convertToUnit("shake")).toBe("shake");
  });
});

describe("Testcombine_quantities_split_by_and", () => {
  it("test_half", () => {
    expect(combineQuantitiesSplitByAnd("1 and 1/2 tsp salt")).toBe("1#1$2 tsp salt");
  });
  it("test_quarter", () => {
    expect(combineQuantitiesSplitByAnd("1 and 1/4 tsp salt")).toBe("1#1$4 tsp salt");
  });
  it("test_three_quarters", () => {
    expect(combineQuantitiesSplitByAnd("1 and 3/4 tsp salt")).toBe("1#3$4 tsp salt");
  });
  it("test_third", () => {
    expect(combineQuantitiesSplitByAnd("1 and 1/3 tsp salt")).toBe("1#1$3 tsp salt");
  });
});

describe("Test_replace_string_range", () => {
  it("test_integers", () => {
    expect(replaceStringRange("4 9 or 10 inch flour tortillas")).toBe(
      "4 9-10 inch flour tortillas",
    );
  });
  it("test_decimals", () => {
    expect(replaceStringRange("1 15.5 or 16 ounce can black beans")).toBe(
      "1 15.5-16 ounce can black beans",
    );
  });
  it("test_decimals_less_than_one", () => {
    expect(replaceStringRange("0.5 to 0.75 teaspoon hot Hungarian paprika")).toBe(
      "0.5-0.75 teaspoon hot Hungarian paprika",
    );
  });
  it("test_hyphens", () => {
    expect(replaceStringRange("1 6- or 7-ounce can of wild salmon")).toBe(
      "1 6-7-ounce can of wild salmon",
    );
  });
  it("test_hyphens_with_spaces", () => {
    expect(replaceStringRange("1 6 - or 7 - ounce can of wild salmon")).toBe(
      "1 6-7 - ounce can of wild salmon",
    );
  });
  it("test_first_starts_with_zero", () => {
    expect(replaceStringRange("Type 00 or 1 flour")).toBe("Type 00 or 1 flour");
  });
  it("test_second_starts_with_zero", () => {
    expect(replaceStringRange("Type 1 or 00 flour")).toBe("Type 1 or 00 flour");
  });
});

describe("Test_is_unit_synonym", () => {
  it("test_singular", () => {
    expect(isUnitSynonym("oz", "ounce")).toBe(true);
  });
  it("test_plural_singular", () => {
    expect(isUnitSynonym("cups", "c")).toBe(true);
  });
  it("test_plural", () => {
    expect(isUnitSynonym("lbs", "pounds")).toBe(true);
  });
  it("test_not_synonym", () => {
    expect(isUnitSynonym("kg", "gram")).toBe(false);
  });
});

// Regression tests for the full-stop tokeniser (not in test_utils.py; expected
// values pinned from the Python oracle:
//   tokenize("abbrev n.é.") -> ["abbrev", "n.é."]
//   tokenize("1 tsp. salt") -> ["1", "tsp", ".", "salt"]
// Python's \w in the FULL_STOP_TOKENISER lookbehind is unicode-aware, so a
// trailing "." after a non-ASCII abbreviation letter must NOT be split off.
describe("tokenize full-stop handling", () => {
  it("does not split a trailing full stop after a dotted non-ASCII abbreviation", () => {
    expect(tokenize("abbrev n.é.")).toEqual(["abbrev", "n.é."]);
    expect(tokenize("тест п.е.")).toEqual(["тест", "п.е."]);
  });

  it("splits a plain trailing full stop from the end of a token", () => {
    expect(tokenize("1 tsp. salt")).toEqual(["1", "tsp", ".", "salt"]);
    expect(tokenize("Freshly grated Parmesan cheese, for garnish.")).toEqual([
      "Freshly",
      "grated",
      "Parmesan",
      "cheese",
      ",",
      "for",
      "garnish",
      ".",
    ]);
  });
});

// Completeness gate: pin the entry counts of the major constant tables
// against the counts computed from the pinned upstream sources.
describe("constant table completeness", () => {
  it("has the expected number of entries in each table", () => {
    expect(UNITS.size).toBe(222);
    expect(STOP_WORDS.size).toBe(149);
    expect(FLATTENED_UNITS_LIST.size).toBe(418);
    expect(AMBIGUOUS_UNITS.length).toBe(24);
    expect(SIZES.length).toBe(26);
    expect(STRING_NUMBERS.size).toBe(23);
    expect(UNICODE_FRACTIONS.size).toBe(30);
    expect(LENGTH_UNITS.size).toBe(9);
    expect(DIMENSIONS.size).toBe(9);
    expect(INDEFINITE_QUANTIFIERS.size).toBe(7);
  });
});
