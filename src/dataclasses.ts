/**
 * Port of `upstream/ingredient_parser/dataclasses.py`.
 *
 * All dataclasses used by the pre- and post-processor live here. Python
 * `@dataclass` types become TypeScript classes (constructed from an options
 * object) or interfaces:
 *  - `TokenFeatures` / `Token` stay as interfaces (consumed by the
 *    pre-processor as plain data).
 *  - `LabelledToken` is an interface (constructed as object literals; the
 *    post-processor mutates `text`/`score` in place, which plain objects
 *    support).
 *  - `IngredientAmount` / `CompositeIngredientAmount` are classes because they
 *    carry behaviour (`convertTo`, `combined`, and `__post_init__`-equivalent
 *    logic run in the constructor).
 *
 * Binding notes:
 *  - Field names are camelCased (`startingIndex`, `quantityMax`, `unitSystem`)
 *    except the boolean flag fields, which stay verbatim UPPERCASE
 *    (`APPROXIMATE`, `SINGULAR`, `RANGE`, `MULTIPLIER`, `PREPARED_INGREDIENT`)
 *    — they are Python's field names and effectively constants-as-fields.
 *  - Python's `Fraction` becomes `Frac`; `round()` becomes `pyRound`; numbers
 *    are str-formatted with `pyFloatStr`/`%g`-style formatting.
 *  - pint's `pint.Unit`/`pint.Quantity` become `Unit`/`Quantity` from the units
 *    registry. `IngredientAmount.convertTo` and
 *    `CompositeIngredientAmount.combined`/`convertTo` mirror pint's
 *    density-context conversion using that module.
 *
 * Divergence: the units module performs conversion in `number` (double)
 * arithmetic rather than pint's exact `Fraction` arithmetic, so converted
 * quantities are `number`s that differ from pint's exact `Fraction` results by
 * at most a few ULPs. The `%g`-formatted `text` (6 significant figures) is
 * unaffected.
 */

import { Frac } from "./py/frac.js";
import { pyFloatStr } from "./py/pyops.js";
import {
  Unit,
  Quantity,
  getUnit,
  DEFAULT_DENSITY,
} from "./units/registry.js";

/** Enum defining unit systems. Port of the `UnitSystem` StrEnum. */
export enum UnitSystem {
  METRIC = "metric",
  US_CUSTOMARY = "us_customary",
  IMPERIAL = "imperial",
  AUSTRALIAN = "australian",
  JAPANESE = "japanese",
  OTHER = "other",
  NONE = "none",
}

/** Common token features. Port of the `TokenFeatures` dataclass. */
export interface TokenFeatures {
  stem: string;
  shape: string;
  isCapitalised: boolean;
  isUnit: boolean;
  isPunc: boolean;
  isAmbiguousUnit: boolean;
}

/** A token from an ingredient sentence. Port of the `Token` dataclass. */
export interface Token {
  index: number;
  text: string;
  featText: string;
  posTag: string;
  features: TokenFeatures;
}

/** A labelled token from an ingredient sentence. Port of `LabelledToken`. */
export interface LabelledToken {
  index: number;
  text: string;
  posTag: string;
  label: string;
  score: number;
  plural: boolean;
}

/**
 * Format a number like Python's `format(x, "g")` (default 6 significant
 * figures, trailing zeros stripped). Only the fixed-point cases arise here;
 * `toPrecision` handles the significant-figure rounding and `Number(...)`
 * strips the trailing zeros/decimal point.
 */
function formatG(x: number, precision = 6): string {
  if (x === 0) {
    return Object.is(x, -0) ? "-0" : "0";
  }
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp < -4 || exp >= precision) {
    // Exponential form (not exercised by the current tests, but kept faithful).
    let mantissa = x.toExponential(precision - 1);
    const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(mantissa);
    if (m) {
      let digits = m[2]! + (m[3] ?? "");
      digits = digits.replace(/0+$/, "");
      const frac = digits.slice(1);
      const e = Number(m[4]);
      const sign = e < 0 ? "-" : "+";
      const ed = Math.abs(e).toString().padStart(2, "0");
      mantissa = `${m[1]}${digits[0]}${frac ? "." + frac : ""}e${sign}${ed}`;
    }
    return mantissa;
  }
  return Number(x.toPrecision(precision)).toString();
}

/** Options accepted by the `IngredientAmount` constructor. */
export interface IngredientAmountInit {
  quantity: Frac | number | string;
  quantityMax: Frac | number | string;
  unit: Unit | string;
  text: string;
  confidence: number;
  startingIndex: number;
  APPROXIMATE?: boolean;
  SINGULAR?: boolean;
  RANGE?: boolean;
  MULTIPLIER?: boolean;
  PREPARED_INGREDIENT?: boolean;
}

/**
 * A parsed ingredient amount. Port of the `IngredientAmount` dataclass.
 *
 * `unitSystem` is computed in the constructor (Python `__post_init__`).
 */
export class IngredientAmount {
  quantity: Frac | number | string;
  quantityMax: Frac | number | string;
  unit: Unit | string;
  text: string;
  confidence: number;
  startingIndex: number;
  unitSystem: UnitSystem;
  APPROXIMATE: boolean;
  SINGULAR: boolean;
  RANGE: boolean;
  MULTIPLIER: boolean;
  PREPARED_INGREDIENT: boolean;

  constructor(init: IngredientAmountInit) {
    this.quantity = init.quantity;
    this.quantityMax = init.quantityMax;
    this.unit = init.unit;
    this.text = init.text;
    this.confidence = init.confidence;
    this.startingIndex = init.startingIndex;
    this.APPROXIMATE = init.APPROXIMATE ?? false;
    this.SINGULAR = init.SINGULAR ?? false;
    this.RANGE = init.RANGE ?? false;
    this.MULTIPLIER = init.MULTIPLIER ?? false;
    this.PREPARED_INGREDIENT = init.PREPARED_INGREDIENT ?? false;
    this.unitSystem = this.determineUnitSystem();
  }

  /** Return a copy of this object (Python `copy.deepcopy(self)`). */
  private copy(): IngredientAmount {
    const c = new IngredientAmount({
      quantity: this.quantity,
      quantityMax: this.quantityMax,
      unit: this.unit,
      text: this.text,
      confidence: this.confidence,
      startingIndex: this.startingIndex,
      APPROXIMATE: this.APPROXIMATE,
      SINGULAR: this.SINGULAR,
      RANGE: this.RANGE,
      MULTIPLIER: this.MULTIPLIER,
      PREPARED_INGREDIENT: this.PREPARED_INGREDIENT,
    });
    return c;
  }

  /**
   * Convert units of this amount to `unit`. Port of `convert_to`.
   *
   * Conversion is only possible if none of `quantity`, `quantityMax` and
   * `unit` are strings (else a `TypeError` is thrown). Mass<->volume
   * conversion uses `density` (default: water, 1000 kg/m^3), mirroring pint's
   * density context.
   */
  convertTo(unit: string, density: Quantity = DEFAULT_DENSITY): IngredientAmount {
    if (
      typeof this.unit === "string" ||
      typeof this.quantity === "string" ||
      typeof this.quantityMax === "string"
    ) {
      throw new TypeError("Cannot convert where quantity or unit is a string.");
    }

    const qValue = this.quantity instanceof Frac ? this.quantity.toNumber() : this.quantity;
    const qMaxValue =
      this.quantityMax instanceof Frac ? this.quantityMax.toNumber() : this.quantityMax;

    const qConverted = new Quantity(qValue, this.unit).to(unit, density);
    const qMaxConverted = new Quantity(qMaxValue, this.unit).to(unit, density);

    const converted = this.copy();
    converted.quantity = qConverted.value;
    converted.quantityMax = qMaxConverted.value;
    converted.unit = qConverted.unit;
    converted.unitSystem = converted.determineUnitSystem();
    converted.text = `${formatG(qConverted.value)} ${qConverted.unit.toString()}`;

    return converted;
  }

  /** Determine the unit system for the amount. Port of `_determine_unit_system`. */
  private determineUnitSystem(): UnitSystem {
    if (this.unit === "") {
      return UnitSystem.NONE;
    }

    let strUnit = this.unit instanceof Unit ? this.unit.toString() : this.unit;

    const imperialUnit = strUnit.includes("imperial_");
    const metricUnit = strUnit.includes("metric_");
    const ausUnit = strUnit.includes("aus_");
    const jpnUnit = strUnit.includes("jp_");
    strUnit = strUnit.replace("imperial_", "");
    strUnit = strUnit.replace("metric_", "");
    strUnit = strUnit.replace("aus_", "");
    strUnit = strUnit.replace("jp_", "");

    const metricSet = new Set([
      "g", "gram", "kg", "kilogram", "l", "liter", "litre", "ml", "milliliter",
      "millilitre",
    ]);
    const usSet = new Set([
      "lb", "pound", "oz", "ounce", "fluid_ounce", "st", "stone", "c", "cup",
      "tsp", "teaspoon", "tbsp", "tablespoon", "pt", "pint", "in", "inch",
    ]);

    for (const part of strUnit.split(/\s+/).filter((p) => p !== "")) {
      const lower = part.toLowerCase();
      if (metricSet.has(lower)) {
        return UnitSystem.METRIC;
      } else if (usSet.has(lower)) {
        if (imperialUnit) {
          return UnitSystem.IMPERIAL;
        } else if (metricUnit) {
          return UnitSystem.METRIC;
        } else if (ausUnit) {
          return UnitSystem.AUSTRALIAN;
        } else if (jpnUnit) {
          return UnitSystem.JAPANESE;
        } else {
          return UnitSystem.US_CUSTOMARY;
        }
      }
    }

    return UnitSystem.OTHER;
  }
}

/** Arithmetic mean of a non-empty list of numbers (Python `statistics.mean`). */
function mean(values: number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total / values.length;
}

/**
 * A composite ingredient amount (e.g. "1 lb 2 oz"). Port of
 * `CompositeIngredientAmount`. `text`, `confidence`, `startingIndex` and
 * `unitSystem` are computed in the constructor (Python `__post_init__`).
 */
export class CompositeIngredientAmount {
  amounts: IngredientAmount[];
  join: string;
  subtractive: boolean;
  text: string;
  confidence: number;
  startingIndex: number;
  unitSystem: UnitSystem;

  constructor(init: { amounts: IngredientAmount[]; join: string; subtractive: boolean }) {
    this.amounts = init.amounts;
    this.join = init.join;
    this.subtractive = init.subtractive;

    if (this.join === "") {
      this.text = this.amounts.map((a) => a.text).join(" ");
    } else {
      this.text = this.amounts.map((a) => a.text).join(this.join);
    }

    this.startingIndex = Math.min(...this.amounts.map((a) => a.startingIndex));
    this.confidence = mean(this.amounts.map((a) => a.confidence));

    const unitSystems = new Set(this.amounts.map((a) => a.unitSystem));
    if (unitSystems.size > 1 && unitSystems.has(UnitSystem.AUSTRALIAN)) {
      this.unitSystem = UnitSystem.AUSTRALIAN;
    } else if (unitSystems.size > 1 && unitSystems.has(UnitSystem.JAPANESE)) {
      this.unitSystem = UnitSystem.JAPANESE;
    } else if (unitSystems.size > 1) {
      this.unitSystem = UnitSystem.OTHER;
    } else {
      this.unitSystem = unitSystems.values().next().value as UnitSystem;
    }
  }

  /**
   * Combine the amounts into a single `Quantity`. Port of `combined`.
   *
   * Throws a `TypeError` if any amount does not have a `Frac` quantity and a
   * `Unit` unit.
   */
  combined(): Quantity {
    for (const amount of this.amounts) {
      if (!(amount.quantity instanceof Frac) || !(amount.unit instanceof Unit)) {
        const qType = amount.quantity instanceof Frac ? "Fraction" : typeof amount.quantity;
        const uType = amount.unit instanceof Unit ? "Unit" : typeof amount.unit;
        throw new TypeError(
          `Incompatible quantity <${qType}> and unit <${uType}> for combining.`,
        );
      }
    }

    const quantities = this.amounts.map(
      (a) => new Quantity((a.quantity as Frac).toNumber(), a.unit as Unit),
    );

    return quantities.reduce((acc, q) => {
      const converted = q.to(acc.unit);
      const value = this.subtractive ? acc.value - converted.value : acc.value + converted.value;
      return new Quantity(value, acc.unit);
    });
  }

  /** Convert the combined amount to `unit`. Port of `convert_to`. */
  convertTo(unit: string, density: Quantity = DEFAULT_DENSITY): Quantity {
    return this.combined().to(unit, density);
  }
}

/** A parsed ingredient string. Port of the `IngredientText` dataclass. */
export class IngredientText {
  text: string;
  confidence: number;
  startingIndex: number;

  constructor(init: { text: string; confidence: number; startingIndex: number }) {
    this.text = init.text;
    this.confidence = init.confidence;
    this.startingIndex = init.startingIndex;
  }
}

/** Attributes of an entry in the Food Data Central database. Port of `FoundationFood`. */
export class FoundationFood {
  text: string;
  confidence: number;
  fdcId: number;
  category: string;
  dataType: string;
  url: string;
  nameIndex: number;

  constructor(init: {
    text: string;
    confidence: number;
    fdcId: number;
    category: string;
    dataType: string;
    nameIndex: number;
  }) {
    this.text = init.text;
    this.confidence = init.confidence;
    this.fdcId = init.fdcId;
    this.category = init.category;
    this.dataType = init.dataType;
    this.nameIndex = init.nameIndex;
    this.url = `https://fdc.nal.usda.gov/food-details/${this.fdcId}/nutrients`;
  }

  eq(other: unknown): boolean {
    return other instanceof FoundationFood && this.fdcId === other.fdcId;
  }
}

/** Parsed values for an input sentence. Port of the `ParsedIngredient` dataclass. */
export class ParsedIngredient {
  name: IngredientText[];
  size: IngredientText | null;
  amount: (IngredientAmount | CompositeIngredientAmount)[];
  preparation: IngredientText | null;
  comment: IngredientText | null;
  purpose: IngredientText | null;
  foundationFoods: FoundationFood[];
  sentence: string;

  constructor(init: {
    name: IngredientText[];
    size: IngredientText | null;
    amount: (IngredientAmount | CompositeIngredientAmount)[];
    preparation: IngredientText | null;
    comment: IngredientText | null;
    purpose: IngredientText | null;
    foundationFoods: FoundationFood[];
    sentence: string;
  }) {
    this.name = init.name;
    this.size = init.size;
    this.amount = init.amount;
    this.preparation = init.preparation;
    this.comment = init.comment;
    this.purpose = init.purpose;
    this.foundationFoods = init.foundationFoods;
    this.sentence = init.sentence;

    this.setPreparedIngredientFlags();
  }

  /** Port of `__post_init__`: set PREPARED_INGREDIENT flag for amounts. */
  private setPreparedIngredientFlags(): void {
    if (this.name.length === 0 || !this.preparation) {
      return;
    }

    const firstNameStartingIndex = Math.min(...this.name.map((n) => n.startingIndex));
    const lastNameStartingIndex = Math.max(...this.name.map((n) => n.startingIndex));
    const prepIndex = this.preparation.startingIndex;

    for (const amount of this.amount) {
      if (
        (amount.startingIndex < prepIndex && prepIndex < firstNameStartingIndex) ||
        (lastNameStartingIndex < prepIndex && prepIndex < amount.startingIndex)
      ) {
        if (amount instanceof CompositeIngredientAmount) {
          for (const compositeAmount of amount.amounts) {
            compositeAmount.PREPARED_INGREDIENT = true;
          }
        } else {
          amount.PREPARED_INGREDIENT = true;
        }
      }
    }
  }
}

/** Intermediate objects generated during parsing. Port of `ParserDebugInfo`. */
export interface ParserDebugInfo {
  sentence: string;
  // PreProcessor and PostProcessor are typed loosely to avoid an import cycle.
  PreProcessor: unknown;
  PostProcessor: unknown;
  tagger: unknown;
}
