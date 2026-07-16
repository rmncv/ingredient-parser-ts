/**
 * Port of `upstream/ingredient_parser/parsers.py`.
 *
 * Language-agnostic public entry points that validate arguments and dispatch
 * to the language-specific parser (currently only `en`).
 */

import { SUPPORTED_LANGUAGES } from "./_common.js";
import { inspectParserEn, parseIngredientEn } from "./en/index.js";
import type { ParsedIngredient, ParserDebugInfo } from "./dataclasses.js";
import type { VolumetricUnitsSystem } from "./units/registry.js";

const SUPPORTED_VOLUMETRIC_UNITS_SYSTEMS = new Set<string>([
  "us_customary",
  "imperial",
  "metric",
  "australian",
  "japanese",
]);

/** Options accepted by the public parser entry points. */
export interface ParseIngredientOptions {
  lang?: string;
  separateNames?: boolean;
  discardIsolatedStopWords?: boolean;
  expectNameInOutput?: boolean;
  stringUnits?: boolean;
  /**
   * @deprecated Use `volumetricUnitsSystem: "imperial"` for the same
   * functionality.
   */
  imperialUnits?: boolean;
  volumetricUnitsSystem?: VolumetricUnitsSystem;
  foundationFoods?: boolean;
  customUnits?: Record<string, string> | null;
}

/**
 * Validate `lang`, resolve the deprecated `imperialUnits` flag, and validate
 * `volumetricUnitsSystem`. Returns the resolved volumetric units system.
 */
function validateAndResolve(options: ParseIngredientOptions): {
  lang: string;
  volumetricUnitsSystem: VolumetricUnitsSystem;
} {
  const lang = options.lang ?? "en";
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    throw new Error(`Unsupported language "${lang}"`);
  }

  let volumetricUnitsSystem: string = options.volumetricUnitsSystem ?? "us_customary";
  if (options.imperialUnits) {
    process.emitWarning(
      "imperial_units=True argument is deprecated. Use volumetric_units_system='imperial'",
      { type: "DeprecationWarning" },
    );
    volumetricUnitsSystem = "imperial";
  }

  if (!SUPPORTED_VOLUMETRIC_UNITS_SYSTEMS.has(volumetricUnitsSystem)) {
    throw new Error(`Unsupported volumetric_units_system "${volumetricUnitsSystem}"`);
  }

  return { lang, volumetricUnitsSystem: volumetricUnitsSystem as VolumetricUnitsSystem };
}

/** Parse an ingredient sentence to return structured data. Port of `parse_ingredient`. */
export function parseIngredient(
  sentence: string,
  options: ParseIngredientOptions = {},
): ParsedIngredient {
  const { lang, volumetricUnitsSystem } = validateAndResolve(options);

  switch (lang) {
    case "en":
      return parseIngredientEn(sentence, {
        separateNames: options.separateNames,
        discardIsolatedStopWords: options.discardIsolatedStopWords,
        expectNameInOutput: options.expectNameInOutput,
        stringUnits: options.stringUnits,
        volumetricUnitsSystem,
        foundationFoods: options.foundationFoods,
        customUnits: options.customUnits,
      });
    default:
      throw new Error(`Unrecognised value "${lang}"`);
  }
}

/** Parse multiple ingredient sentences. Port of `parse_multiple_ingredients`. */
export function parseMultipleIngredients(
  sentences: Iterable<string>,
  options: ParseIngredientOptions = {},
): ParsedIngredient[] {
  const result: ParsedIngredient[] = [];
  for (const sentence of sentences) {
    result.push(parseIngredient(sentence, options));
  }
  return result;
}

/** Return intermediate parse objects for inspection. Port of `inspect_parser`. */
export function inspectParser(
  sentence: string,
  options: ParseIngredientOptions = {},
): ParserDebugInfo {
  const { lang, volumetricUnitsSystem } = validateAndResolve(options);

  switch (lang) {
    case "en":
      return inspectParserEn(sentence, {
        separateNames: options.separateNames,
        discardIsolatedStopWords: options.discardIsolatedStopWords,
        expectNameInOutput: options.expectNameInOutput,
        stringUnits: options.stringUnits,
        volumetricUnitsSystem,
        foundationFoods: options.foundationFoods,
        customUnits: options.customUnits,
      });
    default:
      throw new Error(`Unrecognised value "${lang}"`);
  }
}
