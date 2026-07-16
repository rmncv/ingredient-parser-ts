/**
 * Minimal replacement for the subset of `pint` used by
 * `ingredient-parser`, scoped to exactly what the library needs:
 *
 *  - Resolving a unit name (or one of its aliases) to a canonical `Unit`.
 *  - Resolving the country/system-specific variant of a volumetric unit
 *    (e.g. "cup" -> "imperial_cup" under the "imperial" system), per the
 *    `VOLUMETRIC_UNITS_W_ALTERNATIVES` table in
 *    `upstream/ingredient_parser/en/_utils.py`.
 *  - Same-dimension unit conversion (mass<->mass, volume<->volume) via SI
 *    factors.
 *  - Cross-dimension mass<->volume conversion via density (see
 *    `density.ts`), mirroring the `density` pint context defined in
 *    `upstream/ingredient_parser/pint_extensions.txt`.
 *  - The `MISINTERPRETED_UNITS` guard list, for strings that pint would
 *    otherwise misinterpret as an unrelated unit (e.g. "pinch" as
 *    pico-inch).
 *
 * This module intentionally does NOT implement general unit-expression
 * parsing (e.g. "kg*m/s^2"); only named units + aliases are supported.
 *
 * SI factors are taken from pint's `default_en.txt` unit definitions (for
 * standard units) and from `upstream/ingredient_parser/pint_extensions.txt`
 * (for the custom volumetric/Japanese units), and were cross-checked
 * against pint itself (see `tests/units/registry.test.ts` for the
 * verification commands used).
 */

import { volumeToMass, massToVolume, DEFAULT_DENSITY_KG_PER_M3 } from "./density.js";

export type Dimension =
  | "mass"
  | "volume"
  | "length"
  | "temperature"
  | "energy"
  | "dimensionless";

/**
 * A resolved unit: a canonical pint-compatible name, its physical
 * dimension, and its conversion factor to the SI base unit for that
 * dimension (kilogram for mass, cubic metre for volume).
 */
export class Unit {
  readonly name: string;
  readonly dimension: Dimension;
  readonly siFactor: number;

  constructor(name: string, dimension: Dimension, siFactor: number) {
    this.name = name;
    this.dimension = dimension;
    this.siFactor = siFactor;
  }

  /** Returns pint's canonical name for this unit, e.g. "cup", "fluid_ounce". */
  toString(): string {
    return this.name;
  }

  /**
   * True if `other` refers to the same canonical unit as this one. If
   * `other` is a string, it is resolved via `getUnit` first (so aliases
   * compare equal to their canonical unit).
   */
  eq(other: Unit | string): boolean {
    const otherUnit = typeof other === "string" ? getUnit(other) : other;
    if (!otherUnit) return false;
    return this.name === otherUnit.name;
  }
}

/**
 * A value paired with a `Unit`, supporting conversion to another unit of
 * the same dimension, or across mass<->volume via a density.
 */
export class Quantity {
  readonly value: number;
  readonly unit: Unit;

  constructor(value: number, unit: Unit) {
    this.value = value;
    this.unit = unit;
  }

  /**
   * Convert this quantity to `target` (a `Unit` or a unit name resolvable
   * via `getUnit`).
   *
   * If `target` has the same dimension as this quantity's unit, the
   * conversion is a straightforward SI-factor ratio.
   *
   * If converting between "mass" and "volume", `density` (kg/m^3, default
   * 1000 — the density of water, matching the upstream library's default)
   * is used, mirroring pint's `density` context.
   *
   * Throws if `target` cannot be resolved, or if the dimensions are
   * incompatible and are not a mass<->volume pair.
   */
  to(target: Unit | string, density: Quantity = DEFAULT_DENSITY): Quantity {
    const targetUnit = typeof target === "string" ? getUnit(target) : target;
    if (!targetUnit) {
      throw new Error(`Unknown unit: ${String(target)}`);
    }

    if (targetUnit.dimension === this.unit.dimension) {
      const valueSI = this.value * this.unit.siFactor;
      return new Quantity(valueSI / targetUnit.siFactor, targetUnit);
    }

    const densityKgPerM3 = density.value;

    if (this.unit.dimension === "volume" && targetUnit.dimension === "mass") {
      const volumeM3 = this.value * this.unit.siFactor;
      const massKg = volumeToMass(volumeM3, densityKgPerM3);
      return new Quantity(massKg / targetUnit.siFactor, targetUnit);
    }

    if (this.unit.dimension === "mass" && targetUnit.dimension === "volume") {
      const massKg = this.value * this.unit.siFactor;
      const volumeM3 = massToVolume(massKg, densityKgPerM3);
      return new Quantity(volumeM3 / targetUnit.siFactor, targetUnit);
    }

    throw new Error(
      `Cannot convert ${this.unit.name} (${this.unit.dimension}) to ${targetUnit.name} (${targetUnit.dimension})`,
    );
  }
}

/** Synthetic unit used only to carry the default density value. */
const KG_PER_M3_UNIT = new Unit("kilogram_per_cubic_meter", "dimensionless", 1);

/** Default density (water, 1000 kg/m^3) used by `Quantity.to` when none is given. */
export const DEFAULT_DENSITY = new Quantity(DEFAULT_DENSITY_KG_PER_M3, KG_PER_M3_UNIT);

interface UnitDef {
  /** Canonical pint name, e.g. "tablespoon", "imperial_cup". */
  name: string;
  dimension: Dimension;
  /** Conversion factor to the SI base unit for `dimension` (kg or m^3). */
  siFactor: number;
  /** Alternative names/abbreviations that resolve to this unit. */
  aliases?: string[];
}

/**
 * Canonical unit definitions. SI factors verified against pint (with
 * `pint_extensions.txt` loaded) — see task-6-report.md for the exact
 * verification commands and outputs.
 */
const UNIT_DEFS: UnitDef[] = [
  // --- Volume: US customary ---
  { name: "teaspoon", dimension: "volume", siFactor: 4.92892159375e-6, aliases: ["tsp", "teaspoons"] },
  { name: "tablespoon", dimension: "volume", siFactor: 1.478676478125e-5, aliases: ["tbsp", "tablespoons"] },
  { name: "fluid_ounce", dimension: "volume", siFactor: 2.95735295625e-5, aliases: ["floz", "fluid_ounces"] },
  { name: "cup", dimension: "volume", siFactor: 2.365882365e-4, aliases: ["cups"] },
  { name: "pint", dimension: "volume", siFactor: 4.73176473e-4, aliases: ["pints", "pt"] },
  { name: "quart", dimension: "volume", siFactor: 9.46352946e-4, aliases: ["quarts", "qt"] },
  { name: "gallon", dimension: "volume", siFactor: 3.785411784e-3, aliases: ["gallons", "gal"] },

  // --- Volume: metric ---
  { name: "liter", dimension: "volume", siFactor: 1e-3, aliases: ["litre", "l", "liters", "litres"] },
  { name: "milliliter", dimension: "volume", siFactor: 1e-6, aliases: ["ml", "milliliters", "millilitre", "millilitres"] },
  { name: "deciliter", dimension: "volume", siFactor: 1e-4, aliases: ["dl", "deciliters"] },
  { name: "centiliter", dimension: "volume", siFactor: 1e-5, aliases: ["cl", "centiliters"] },

  // --- Volume: imperial ---
  { name: "imperial_cup", dimension: "volume", siFactor: 2.84130625e-4 },
  { name: "imperial_fluid_ounce", dimension: "volume", siFactor: 2.84130625e-5 },
  { name: "imperial_pint", dimension: "volume", siFactor: 5.6826125e-4 },
  { name: "imperial_quart", dimension: "volume", siFactor: 1.1365225e-3 },
  { name: "imperial_gallon", dimension: "volume", siFactor: 4.54609e-3 },
  {
    name: "imperial_tablespoon",
    dimension: "volume",
    siFactor: 1.7758164062500002e-5,
    aliases: ["imperial_tbsp", "UK_tablespoon", "UK_tbsp"],
  },
  {
    name: "imperial_teaspoon",
    dimension: "volume",
    siFactor: 5.919388020833333e-6,
    aliases: ["imperial_tsp", "UK_teaspoon", "UK_tsp"],
  },

  // --- Volume: metric/australian/japanese variants (pint_extensions.txt) ---
  { name: "metric_cup", dimension: "volume", siFactor: 2.5e-4 },
  { name: "metric_tablespoon", dimension: "volume", siFactor: 1.5e-5, aliases: ["metric_tbsp"] },
  { name: "metric_teaspoon", dimension: "volume", siFactor: 5e-6, aliases: ["metric_tsp"] },
  { name: "aus_tablespoon", dimension: "volume", siFactor: 2e-5, aliases: ["aus_tbsp"] },
  { name: "aus_pint", dimension: "volume", siFactor: 5.7e-4 },
  { name: "jp_cup", dimension: "volume", siFactor: 2e-4 },

  // --- Mass ---
  { name: "gram", dimension: "mass", siFactor: 1e-3, aliases: ["g", "grams"] },
  { name: "kilogram", dimension: "mass", siFactor: 1, aliases: ["kg", "kilograms"] },
  { name: "milligram", dimension: "mass", siFactor: 1e-6, aliases: ["mg", "milligrams"] },
  { name: "ounce", dimension: "mass", siFactor: 0.028349523125, aliases: ["oz", "ounces"] },
  { name: "pound", dimension: "mass", siFactor: 0.45359237, aliases: ["lb", "lbs", "pounds"] },
  { name: "imperial_ounce", dimension: "mass", siFactor: 0.028349523125 },
  { name: "imperial_pound", dimension: "mass", siFactor: 0.45359237 },
];

/** Maps every canonical name and alias to its resolved `Unit`. */
const RESOLVE: Map<string, Unit> = new Map();
for (const def of UNIT_DEFS) {
  const unit = new Unit(def.name, def.dimension, def.siFactor);
  RESOLVE.set(def.name, unit);
  for (const alias of def.aliases ?? []) {
    RESOLVE.set(alias, unit);
  }
}

/**
 * Resolve a unit name (canonical or alias) to its `Unit`. Returns
 * `undefined` if the name is not a known unit (mirrors pint returning the
 * original string unchanged when it can't resolve a unit, but as a
 * distinct `undefined` value here rather than a passthrough string).
 */
export function getUnit(name: string): Unit | undefined {
  return RESOLVE.get(name);
}

/**
 * SI prefixes (symbol -> long name), matching pint's default prefix set. Used
 * to resolve prefixed unit tokens (e.g. "fl" -> femto + liter -> "femtoliter"),
 * mirroring pint parsing an unknown-but-prefixable token. Longer symbols come
 * first so e.g. "da" (deca) wins over "d" (deci).
 */
const SI_PREFIXES: [string, string][] = [
  ["da", "deca"],
  ["Y", "yotta"],
  ["Z", "zetta"],
  ["E", "exa"],
  ["P", "peta"],
  ["T", "tera"],
  ["G", "giga"],
  ["M", "mega"],
  ["k", "kilo"],
  ["h", "hecto"],
  ["d", "deci"],
  ["c", "centi"],
  ["m", "milli"],
  ["u", "micro"],
  ["µ", "micro"],
  ["n", "nano"],
  ["p", "pico"],
  ["f", "femto"],
  ["a", "atto"],
  ["z", "zepto"],
  ["y", "yocto"],
];

/**
 * Resolve a single unit token to its canonical pint name. Falls back to an SI
 * prefix + base-unit decomposition (e.g. "fl" -> "femtoliter") when the bare
 * token is not a known unit, mirroring pint's prefix handling.
 */
function resolveTokenName(token: string): string | undefined {
  const direct = RESOLVE.get(token);
  if (direct) {
    return direct.name;
  }
  for (const [symbol, long] of SI_PREFIXES) {
    if (token.length > symbol.length && token.startsWith(symbol)) {
      const base = RESOLVE.get(token.slice(symbol.length));
      if (base) {
        return long + base.name;
      }
    }
  }
  return undefined;
}

/**
 * Emulate pint's `str in UREG` / `UREG(str).units` for a whitespace-separated
 * unit expression. Each token is resolved to its canonical name (with SI prefix
 * support); if every token resolves, a `Unit` is returned whose name is the
 * pint canonical form: for a single token the resolved name, for multiple the
 * alphabetically-sorted names joined with " * " (e.g. "ml tablespoon" ->
 * "milliliter * tablespoon", "ounce cup" -> "cup * ounce").
 *
 * Returns `undefined` if any token cannot be resolved, in which case the caller
 * keeps the original string (as pint leaves an unresolvable unit unchanged).
 *
 * The returned composite `Unit` carries no meaningful dimension/SI factor
 * (these compound units are never converted); it exists only so that its
 * string form and unit-system classification match pint.
 */
export function parseUnitExpression(unitStr: string): Unit | undefined {
  const tokens = unitStr.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return undefined;
  }

  const names: string[] = [];
  for (const token of tokens) {
    const name = resolveTokenName(token);
    if (name === undefined) {
      return undefined;
    }
    names.push(name);
  }

  if (names.length === 1) {
    const direct = RESOLVE.get(names[0]!);
    if (direct) {
      return direct;
    }
    return new Unit(names[0]!, "dimensionless", NaN);
  }

  names.sort();
  return new Unit(names.join(" * "), "dimensionless", NaN);
}

/**
 * Volumetric unit system, matching `volumetric_units_system` in
 * `upstream/ingredient_parser/en/_utils.py`.
 */
export type VolumetricUnitsSystem =
  | "us_customary"
  | "imperial"
  | "metric"
  | "australian"
  | "japanese";

/**
 * Per-system variants of volumetric units with country-specific
 * definitions, copied verbatim from `VOLUMETRIC_UNITS_W_ALTERNATIVES` in
 * `upstream/ingredient_parser/en/_utils.py`.
 */
const VOLUMETRIC_UNITS_W_ALTERNATIVES: Record<string, Partial<Record<VolumetricUnitsSystem, string>>> = {
  cup: {
    imperial: "imperial_cup",
    japanese: "jp_cup",
    australian: "metric_cup",
    metric: "metric_cup",
  },
  floz: {
    imperial: "imperial_fluid_ounce",
  },
  fluid_ounce: {
    imperial: "imperial_fluid_ounce",
  },
  quart: {
    imperial: "imperial_quart",
  },
  pint: {
    imperial: "imperial_pint",
    australian: "aus_pint",
  },
  gallon: {
    imperial: "imperial_gallon",
  },
  tablespoon: {
    imperial: "imperial_tablespoon",
    japanese: "metric_tablespoon",
    australian: "aus_tablespoon",
    metric: "metric_tablespoon",
  },
  tbsp: {
    imperial: "imperial_tablespoon",
    japanese: "metric_tablespoon",
    australian: "aus_tablespoon",
    metric: "metric_tablespoon",
  },
  teaspoon: {
    imperial: "imperial_teaspoon",
    japanese: "metric_teaspoon",
    australian: "metric_teaspoon",
    metric: "metric_teaspoon",
  },
  tsp: {
    imperial: "imperial_teaspoon",
    japanese: "metric_teaspoon",
    australian: "metric_teaspoon",
    metric: "metric_teaspoon",
  },
  ounce: {
    imperial: "imperial_ounce",
  },
  oz: {
    imperial: "imperial_ounce",
  },
  pound: {
    imperial: "imperial_pound",
  },
  lb: {
    imperial: "imperial_pound",
  },
};

/**
 * Resolve `name` to the `Unit` appropriate for the given volumetric units
 * system, applying the country-specific substitution table when
 * `system` is not `"us_customary"` and a substitution is defined for
 * `name`. Falls back to the plain (US customary) resolution of `name`
 * otherwise — matching `convert_to_pint_unit` in
 * `upstream/ingredient_parser/en/_utils.py`.
 */
export function unitFor(name: string, system: VolumetricUnitsSystem): Unit | undefined {
  if (system !== "us_customary") {
    const alt = VOLUMETRIC_UNITS_W_ALTERNATIVES[name]?.[system];
    if (alt) {
      return getUnit(alt);
    }
  }
  return getUnit(name);
}

/**
 * Strings that pint would misinterpret as an unrelated unit (e.g. "pinch"
 * as pico-inch), copied verbatim (lowercased) from `MISINTERPRETED_UNITS`
 * in `upstream/ingredient_parser/en/_utils.py`. Consumers should check
 * membership case-insensitively (`UREG_MISINTERPRETED.has(name.toLowerCase())`),
 * matching `unit.lower() in MISINTERPRETED_UNITS` upstream.
 */
export const UREG_MISINTERPRETED: Set<string> = new Set([
  "pinch", // pico-inch
  "pinches",
  "bar", // bar (pressure)
  "bars",
  "link", // link (distance)
  "links",
  "shake", // shake (time)
  "shakes",
  "tin", // tera-inch
  "tins",
  "unit", // micronit (micro netwon inch)
  "units",
  "fat", // femto-technical-atmosphere
]);

/** Case-insensitive membership check against `UREG_MISINTERPRETED`. */
export function isMisinterpretedUnit(name: string): boolean {
  return UREG_MISINTERPRETED.has(name.toLowerCase());
}
