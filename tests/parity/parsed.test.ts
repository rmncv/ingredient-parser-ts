import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { parseIngredient } from "../../src/index.js";
import { inspectParser } from "../../src/index.js";
import {
  ParsedIngredient,
  IngredientText,
  IngredientAmount,
  CompositeIngredientAmount,
} from "../../src/dataclasses.js";
import type { PostProcessor } from "../../src/en/postprocess.js";
import { Frac } from "../../src/py/frac.js";
import { Unit } from "../../src/units/registry.js";

// End-to-end parity gate for Task 10. For every corpus entry whose recorded
// options do NOT enable foundation_foods (those are Task 11), run
// parseIngredient with the mapped options and deep-compare the serialized
// result against the recorded Python `parsed` JSON.

interface CorpusOptions {
  separate_names: boolean;
  discard_isolated_stop_words: boolean;
  expect_name_in_output: boolean;
  string_units: boolean;
  volumetric_units_system: string;
  foundation_foods: boolean;
}

interface CorpusEntry {
  sentence: string;
  labels: string[];
  options: CorpusOptions;
  parsed: unknown;
}

function loadCorpus(): CorpusEntry[] {
  const buf = readFileSync(new URL("corpus.json.gz", import.meta.url));
  return JSON.parse(gunzipSync(buf).toString("utf-8")) as CorpusEntry[];
}

// ---- Serialization: mirror Python's corpus `parsed` JSON encoding. ----

/** pint.Unit -> str(); Fraction -> {"__fraction__": [num, den]}. */
function serializeQuantity(value: Frac | number | string): unknown {
  if (value instanceof Frac) {
    return { __fraction__: [Number(value.num), Number(value.den)] };
  }
  return value;
}

function serializeUnit(value: Unit | string): string {
  return value instanceof Unit ? value.toString() : value;
}

function serializeText(t: IngredientText | null): unknown {
  if (t === null) {
    return null;
  }
  return { text: t.text, confidence: t.confidence, starting_index: t.startingIndex };
}

function serializeAmount(a: IngredientAmount | CompositeIngredientAmount): unknown {
  if (a instanceof CompositeIngredientAmount) {
    return {
      amounts: a.amounts.map(serializeAmount),
      confidence: a.confidence,
      join: a.join,
      starting_index: a.startingIndex,
      subtractive: a.subtractive,
      text: a.text,
      unit_system: a.unitSystem,
    };
  }
  return {
    APPROXIMATE: a.APPROXIMATE,
    MULTIPLIER: a.MULTIPLIER,
    PREPARED_INGREDIENT: a.PREPARED_INGREDIENT,
    RANGE: a.RANGE,
    SINGULAR: a.SINGULAR,
    confidence: a.confidence,
    quantity: serializeQuantity(a.quantity),
    quantity_max: serializeQuantity(a.quantityMax),
    starting_index: a.startingIndex,
    text: a.text,
    unit: serializeUnit(a.unit),
    unit_system: a.unitSystem,
  };
}

function serializeParsed(p: ParsedIngredient): unknown {
  return {
    name: p.name.map(serializeText),
    size: serializeText(p.size),
    amount: p.amount.map(serializeAmount),
    preparation: serializeText(p.preparation),
    comment: serializeText(p.comment),
    purpose: serializeText(p.purpose),
    foundation_foods: p.foundationFoods.map((f) => ({
      text: f.text,
      confidence: f.confidence,
      fdc_id: f.fdcId,
      category: f.category,
      data_type: f.dataType,
      url: f.url,
      name_index: f.nameIndex,
    })),
    sentence: p.sentence,
  };
}

// ---- Deep comparison with float tolerance for numbers. ----

const FLOAT_TOL = 1e-9;

// Foundation-food confidence scores are computed in float32 territory. The
// reference corpus was generated on macOS, where `np.dot`/`np.linalg.norm`
// dispatch to Accelerate BLAS, which is not portably reproducible. Exactly six
// entries straddle a 6th-decimal rounding boundary and differ by exactly 1e-6
// from the recorded value (see task-11-report.md). Only these six entries —
// keyed by sentence + fdc_id — get a relaxed 5e-6 tolerance on the
// foundation_foods[].confidence field; every other entry keeps the default
// 1e-6, so any new drift fails the gate. All string/argmax fields stay exact.
const FF_CONFIDENCE_TOL_DEFAULT = 1e-6;
const FF_CONFIDENCE_TOL_BLAS_DRIFT = 5e-6;
const FF_CONFIDENCE_RE = /^parsed\.foundation_foods\[\d+\]\.confidence$/;
const BLAS_DRIFT_ENTRIES = new Set<string>([
  "#1$2 baguette, cut diagonally into about #1$4-inch slices|170600",
  "1 tbsp chopped pistachios|2515379",
  "1/2 baguette, cut diagonally into about 1/4-inch slices|170600",
  "2 eggs (free-range) (large)|2707152",
  "2.5 Boxes Candy|168759",
  "200 ml beef of chicken stock|172884",
]);

interface CompareContext {
  /** Sentence of the corpus entry being compared. */
  sentence?: string;
  /** Keys ("sentence|fdc_id") of FF matches allowed the relaxed BLAS tolerance. */
  blasDriftKeys?: Set<string>;
}

function tolForPath(path: string, ctx: CompareContext, actualParent: unknown): number {
  if (!FF_CONFIDENCE_RE.test(path)) {
    return FLOAT_TOL;
  }
  const parent = actualParent as { fdc_id?: number } | undefined;
  const key = parent?.fdc_id !== undefined ? `${ctx.sentence}|${parent.fdc_id}` : "";
  return ctx.blasDriftKeys?.has(key)
    ? FF_CONFIDENCE_TOL_BLAS_DRIFT
    : FF_CONFIDENCE_TOL_DEFAULT;
}

function deepCompare(
  actual: unknown,
  expected: unknown,
  path: string,
  diffs: string[],
  ctx: CompareContext = {},
  actualParent: unknown = undefined,
): void {
  if (typeof expected === "number" || typeof actual === "number") {
    if (typeof actual !== "number" || typeof expected !== "number") {
      diffs.push(`${path}: type mismatch (${typeof actual} vs ${typeof expected})`);
      return;
    }
    if (Math.abs(actual - expected) > tolForPath(path, ctx, actualParent)) {
      diffs.push(`${path}: ${actual} != ${expected}`);
    }
    return;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) {
      diffs.push(`${path}: array mismatch`);
      return;
    }
    if (actual.length !== expected.length) {
      diffs.push(`${path}: length ${actual.length} != ${expected.length}`);
      return;
    }
    for (let i = 0; i < expected.length; i++) {
      deepCompare(actual[i], expected[i], `${path}[${i}]`, diffs, ctx, actual);
    }
    return;
  }

  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") {
      diffs.push(`${path}: object mismatch (got ${JSON.stringify(actual)})`);
      return;
    }
    const eObj = expected as Record<string, unknown>;
    const aObj = actual as Record<string, unknown>;
    const keys = new Set([...Object.keys(eObj), ...Object.keys(aObj)]);
    for (const key of keys) {
      if (!(key in eObj)) {
        diffs.push(`${path}.${key}: unexpected key`);
        continue;
      }
      if (!(key in aObj)) {
        diffs.push(`${path}.${key}: missing key`);
        continue;
      }
      deepCompare(aObj[key], eObj[key], `${path}.${key}`, diffs, ctx, aObj);
    }
    return;
  }

  // Primitives: strings, booleans, null.
  if (actual !== expected) {
    diffs.push(`${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

function mapOptions(o: CorpusOptions) {
  return {
    separateNames: o.separate_names,
    discardIsolatedStopWords: o.discard_isolated_stop_words,
    expectNameInOutput: o.expect_name_in_output,
    stringUnits: o.string_units,
    volumetricUnitsSystem: o.volumetric_units_system as
      | "us_customary"
      | "imperial"
      | "metric"
      | "australian"
      | "japanese",
    foundationFoods: o.foundation_foods,
  };
}

function isDefaultOptions(o: CorpusOptions): boolean {
  return (
    o.separate_names === true &&
    o.discard_isolated_stop_words === true &&
    o.expect_name_in_output === true &&
    o.string_units === false &&
    o.foundation_foods === false &&
    o.volumetric_units_system === "us_customary"
  );
}

describe("parseIngredient end-to-end parity with Python corpus", () => {
  const corpus = loadCorpus();
  const nonFF = corpus.filter((e) => e.options.foundation_foods !== true);
  const ff = corpus.filter((e) => e.options.foundation_foods === true);

  it("checks the expected number of corpus entries", () => {
    // Pin the count: 6328 total corpus entries = 5537 non-FF + 791 FF entries.
    expect(corpus.length).toBe(6328);
    expect(nonFF.length).toBe(5537);
    expect(ff.length).toBe(791);
  });

  it.each(nonFF.map((e, i) => [i, e] as const))(
    "entry %i matches recorded parsed output",
    (_i, entry) => {
      const parsed = parseIngredient(entry.sentence, mapOptions(entry.options));
      const diffs: string[] = [];
      deepCompare(serializeParsed(parsed), entry.parsed, "parsed", diffs);
      expect(diffs, diffs.join("\n")).toEqual([]);

      // For default-options entries, also assert the token labels match the
      // recorded labels (which include guessIngredientName effects).
      if (isDefaultOptions(entry.options)) {
        const info = inspectParser(entry.sentence, mapOptions(entry.options));
        const post = info.PostProcessor as PostProcessor;
        expect(post.tokens.map((t) => t.label)).toEqual(entry.labels);
      }
    },
  );

  // Foundation-foods parity: same deep comparison. The FF confidence field is
  // held to 1e-6 by default; only the six documented BLAS-drift entries (keyed
  // by sentence + fdc_id in BLAS_DRIFT_ENTRIES) are allowed 5e-6, so any new
  // drift elsewhere fails the gate. Argmax outcomes and every string field
  // (fdc_id, description, category, data_type, url) must be exact.
  it.each(ff.map((e, i) => [i, e] as const))(
    "foundation-foods entry %i matches recorded parsed output",
    (_i, entry) => {
      const parsed = parseIngredient(entry.sentence, mapOptions(entry.options));
      const diffs: string[] = [];
      deepCompare(serializeParsed(parsed), entry.parsed, "parsed", diffs, {
        sentence: entry.sentence,
        blasDriftKeys: BLAS_DRIFT_ENTRIES,
      });
      expect(diffs, diffs.join("\n")).toEqual([]);
    },
  );
});
