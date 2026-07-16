/**
 * Port of `upstream/ingredient_parser/en/_utils.py`.
 *
 * Notes:
 * - `stem` (the `lru_cache`-wrapped stemmer) becomes `stemToken`, a `Map`-cache
 *   wrapper around the imported stemmer (`stem` from `../nlp/stemmer.js`). The
 *   other `lru_cache`-wrapped functions (`convert_to_pint_unit`,
 *   `is_unit_synonym`, `to_frac`) likewise use `Map` caches.
 * - `convert_to_pint_unit` -> `convertToUnit`. Where Python returns a
 *   `pint.Unit` it returns a `Unit`; where it returns the input string
 *   unchanged, so does this. System-variant resolution is delegated to
 *   `unitFor` (registry), matching `VOLUMETRIC_UNITS_W_ALTERNATIVES`.
 * - `pos_tag` -> `posTag`, using `PerceptronTagger` with the ingredient tagdict
 *   overlaid via the tagger's `extraTagdict` mechanism (equivalent to
 *   `tagger.tagdict.update(ingredient_tagdict)`).
 * - `ingredient_amount_factory` is ported here as `ingredientAmountFactory`.
 *   It depends on the `IngredientAmount` dataclass (imported from
 *   `../dataclasses.js`); `dataclasses.ts` does not import `_utils.ts`, so the
 *   import graph stays acyclic.
 */

import { consume, isFloat, isRange } from "../_common.js";
import { Frac } from "../py/frac.js";
import { pyRound } from "../py/pyops.js";
import { IngredientAmount } from "../dataclasses.js";
import { stem as baseStem } from "../nlp/stemmer.js";
import { PerceptronTagger } from "../nlp/perceptron_tagger.js";
import { loadTaggerData, loadIngredientTagdict } from "./_loaders.js";
import {
  getUnit,
  unitFor,
  parseUnitExpression,
  isMisinterpretedUnit,
  Unit,
  type VolumetricUnitsSystem,
} from "../units/registry.js";
import { FLATTENED_UNITS_LIST, UNIT_SYNONYMS, UNITS } from "./_constants.js";
import {
  FRACTION_SPLIT_AND_PATTERN,
  FRACTION_TOKEN_PATTERN,
  STRING_RANGE_PATTERN,
} from "./_regex.js";

// List of units that pint interprets as an incorrect unit.
// (See `UREG_MISINTERPRETED` in `../units/registry.ts`; the guard here uses
// `isMisinterpretedUnit`, which is the case-insensitive membership check.)

// List of unit replacements so that these units get converted to the correct
// pint units. Each entry is a tuple of a pre-compiled regex and its
// replacement value.
// Python: list of (re.compile(r"\b(...)\b"), replacement) tuples. The `g` flag
// reproduces re.sub's replace-all behaviour.
const UNIT_REPLACEMENTS: [RegExp, string][] = [
  [/\b(fl oz)\b/gu, "floz"],
  [/\b(fluid oz)\b/gu, "fluid_ounce"],
  [/\b(fl ounce)\b/gu, "fluid_ounce"],
  [/\b(fluid ounce)\b/gu, "fluid_ounce"],
  [/\b(C)\b/gu, "cup"],
  [/\b(c)\b/gu, "cup"],
  [/\b(qt)\b/gu, "quart"],
  [/\b(Cl)\b/gu, "centiliter"],
  [/\b(G)\b/gu, "gram"],
  [/\b(Ml)\b/gu, "milliliter"],
  [/\b(Mm)\b/gu, "millimeter"],
  [/\b(Pt)\b/gu, "pint"],
  [/\b(Tb)\b/gu, "tablespoon"],
];

// Define regular expressions used by tokenizer.
// Matches one or more non-whitespace characters (Python: r"\S+", used with
// `.findall`).
const WHITESPACE_TOKENISER = /\S+/gu;
// Matches and captures one of the following: ( ) [ ] { } , " / : ; ? ! * ~
// Python: r"([\(\)\[\]\{\}\,/:;\?\!\*\~])"
const PUNCTUATION_TOKENISER = /([()\[\]{},/:;?!*~])/;
// Matches and captures a full stop at end of string.
// (?<!\.\w) is a negative lookbehind that prevents matches if the last full
// stop is preceded by a full stop then a word character.
// Python: r"(?<!\.\w)(\.)$" — Python's \w is unicode-aware, so it is ported as
// [\p{L}\p{N}_] rather than JS's ASCII \w (e.g. "n.é." must NOT be split).
const FULL_STOP_TOKENISER = /(?<!\.[\p{L}\p{N}_])(\.)$/u;

/**
 * Split a string on a regex that captures its separator, matching Python's
 * `re.split` (which keeps captured groups in the result).
 */
function reSplitCapturing(pattern: RegExp, s: string): string[] {
  // JS String.prototype.split keeps capture groups like Python re.split. For a
  // single-capture-group pattern this yields the same interleaving.
  return s.split(pattern);
}

/**
 * Tokenise an ingredient sentence.
 *
 * The sentence is split on whitespace into tokens; any punctuation captured by
 * PUNCTUATION_TOKENISER is then split into separate tokens; and empty tokens
 * are removed. See `tokenize` in `_utils.py`.
 */
export function tokenize(sentence: string): string[] {
  const whitespaceTokens = sentence.match(WHITESPACE_TOKENISER) ?? [];
  const tokens = whitespaceTokens.map((tok) => reSplitCapturing(PUNCTUATION_TOKENISER, tok));
  const flattened = tokens.flat().filter((tok) => tok);

  // Recombine "and/or" into a single token
  const combined = combineAndOr(flattened);

  // Second pass to separate full stops from end of tokens
  const tokens2 = combined.map((tok) => reSplitCapturing(FULL_STOP_TOKENISER, tok));

  return tokens2.flat().filter((tok) => tok);
}

let _tagger: PerceptronTagger | undefined;

/**
 * Tag tokens with parts of speech.
 *
 * A modification of NLTK's default POS tagging which extends the tagdict with
 * additional, ingredient-sentence-specific entries. The tagdict is a dict of
 * token:tag pairs which bypass the POS tagging model. See `pos_tag` in
 * `_utils.py`.
 */
export function posTag(tokens: string[]): [string, string][] {
  if (_tagger === undefined) {
    _tagger = new PerceptronTagger(loadTaggerData());
  }
  const ingredientTagdict = loadIngredientTagdict();
  return _tagger.tag(tokens, ingredientTagdict);
}

/**
 * Combine ["and", "/", "or"] into a single "and/or" token. See `combine_and_or`
 * in `_utils.py`.
 */
export function combineAndOr(tokens: string[]): string[] {
  const AND_OR_PATTERN = ["and", "/", "or"];

  const combined: string[] = [];
  const idx = (function* () {
    for (let i = 0; i < tokens.length; i++) yield i;
  })();
  for (const i of idx) {
    // Short circuit: if tokens[i] is not equal to the first element of
    // AND_OR_PATTERN, skip to next iteration.
    const slice = tokens.slice(i, i + 3);
    if (
      tokens[i] === AND_OR_PATTERN[0] &&
      slice.length === AND_OR_PATTERN.length &&
      slice.every((t, j) => t === AND_OR_PATTERN[j])
    ) {
      combined.push("and/or");
      consume(idx, AND_OR_PATTERN.length - 1);
    } else {
      combined.push(tokens[i]!);
    }
  }

  return combined;
}

const _stemCache = new Map<string, string>();

/**
 * Stem function with a cache to improve performance. The stem of a word is
 * always the same, so we can cache the result. Port of the `lru_cache`-wrapped
 * `stem` in `_utils.py`.
 */
export function stemToken(token: string): string {
  const cached = _stemCache.get(token);
  if (cached !== undefined) {
    return cached;
  }
  const result = baseStem(token);
  _stemCache.set(token, result);
  return result;
}

/**
 * Pluralise units in the sentence, using the same UNITS dictionary as
 * PreProcessor. See `pluralise_units` in `_utils.py`.
 */
export function pluraliseUnits(
  sentence: string,
  customUnits: Record<string, string> = {},
): string {
  const units = new Map(UNITS);
  for (const [plural, singular] of Object.entries(customUnits)) {
    units.set(plural, singular);
  }
  for (const [plural, singular] of units) {
    // Python: re.sub(rf"\b({singular})\b", f"{plural}", sentence)
    sentence = sentence.replace(new RegExp(`\\b(${singular})\\b`, "g"), plural);
  }
  return sentence;
}

const _convertToUnitCache = new Map<string, Unit | string>();

/**
 * Convert a unit to a `Unit`, if possible. If the unit is not found, return the
 * input unit string unchanged. Port of `convert_to_pint_unit` in `_utils.py`.
 */
export function convertToUnit(
  unit: string,
  volumetricUnitsSystem: VolumetricUnitsSystem = "us_customary",
): Unit | string {
  // Collision-safe, text-only cache key (JSON escaping keeps the file free of
  // control characters so it stays diffable).
  const cacheKey = JSON.stringify([unit, volumetricUnitsSystem]);
  const cached = _convertToUnitCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const result = _convertToUnit(unit, volumetricUnitsSystem);
  _convertToUnitCache.set(cacheKey, result);
  return result;
}

function _convertToUnit(unit: string, volumetricUnitsSystem: VolumetricUnitsSystem): Unit | string {
  if (unit.includes("-")) {
    // When checking if a unit is in the unit registry, pint parses any '-' as
    // a subtraction and attempts to evaluate it, causing an exception. Since no
    // pint.Unit can contain a '-', return early with the string.
    return unit;
  }

  if (isMisinterpretedUnit(unit)) {
    // Special cases to prevent pint interpreting units incorrectly
    // e.g. pinch != pico-inch
    return unit;
  }

  // Apply replacements to ensure correct matches in the pint Unit Registry.
  for (const [regex, replacement] of UNIT_REPLACEMENTS) {
    unit = unit.replace(regex, replacement);
  }

  // Resolve the unit (applying the country-specific volumetric variant where
  // one is defined and the system is not us_customary). `unitFor` reproduces
  // both the VOLUMETRIC_UNITS_W_ALTERNATIVES substitution and the final
  // registry lookup.
  if (unit !== "") {
    const resolved = unitFor(unit, volumetricUnitsSystem);
    if (resolved) {
      return resolved;
    }
    // Emulate pint's `unit in UREG` for compound / SI-prefixed unit
    // expressions (e.g. "ml tablespoon" -> "milliliter * tablespoon", "fl" ->
    // "femtoliter"), which `unitFor` (single named unit) does not handle.
    const expression = parseUnitExpression(unit);
    if (expression) {
      return expression;
    }
  }

  return unit;
}

const _isUnitSynonymCache = new Map<string, boolean>();

/**
 * Check if given units are synonyms. Port of `is_unit_synonym` in `_utils.py`.
 */
export function isUnitSynonym(unit1: string, unit2: string): boolean {
  const cacheKey = JSON.stringify([unit1, unit2]);
  const cached = _isUnitSynonymCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = _isUnitSynonym(unit1, unit2);
  _isUnitSynonymCache.set(cacheKey, result);
  return result;
}

function _isUnitSynonym(unit1: string, unit2: string): boolean {
  // If not in units list, then cannot be unit synonyms.
  if (!FLATTENED_UNITS_LIST.has(unit1) || !FLATTENED_UNITS_LIST.has(unit2)) {
    return false;
  }

  // Make singular if plural.
  unit1 = UNITS.get(unit1) ?? unit1;
  unit2 = UNITS.get(unit2) ?? unit2;

  for (const synonyms of UNIT_SYNONYMS) {
    if (synonyms.has(unit1) && synonyms.has(unit2)) {
      return true;
    }
  }

  return false;
}

/**
 * Combine fractional quantities split by 'and' into a single value. See
 * `combine_quantities_split_by_and` in `_utils.py`.
 */
export function combineQuantitiesSplitByAnd(text: string): string {
  const matches = [...text.matchAll(FRACTION_SPLIT_AND_PATTERN)];
  for (const match of matches) {
    // match[1] = whole match, match[2] = integer part, match[3] = fraction part
    const replacement = match[2]! + "#" + match[3]!.replace("/", "$");
    text = text.replace(match[1]!, replacement);
  }
  return text;
}

/**
 * Replace a range in the form "<num> to <num>" with the range "<num>-<num>".
 * See `replace_string_range` in `_utils.py`.
 */
export function replaceStringRange(text: string): string {
  // Python: STRING_RANGE_PATTERN.sub(r"\1-\5", text)
  return text.replace(STRING_RANGE_PATTERN, "$1-$5");
}

const _toFracCache = new Map<string, Frac>();

/**
 * Convert a QTY token into a `Frac`. Port of `to_frac` in `_utils.py` (returns
 * `Frac` in place of Python's `fractions.Fraction`).
 */
export function toFrac(token: string): Frac {
  const cached = _toFracCache.get(token);
  if (cached !== undefined) {
    return cached;
  }
  const result = _toFrac(token);
  _toFracCache.set(token, result);
  return result;
}

function _toFrac(token: string): Frac {
  if (FRACTION_TOKEN_PATTERN.test(token)) {
    const fractionParts = token
      .split("#")
      .filter((p) => p)
      .map((p) => p.replace("$", "/"));
    return fractionParts.reduce((acc, p) => acc.add(new Frac(p)), new Frac(0n));
  }
  return new Frac(token);
}

const FRAC_ONE = new Frac(1n);

/** True if `q` equals the integer 1 (Python `_quantity != 1`, negated). */
function quantityIsOne(q: Frac | string): boolean {
  return q instanceof Frac && q.eq(FRAC_ONE);
}

/**
 * Create an `IngredientAmount` from parts. Port of `ingredient_amount_factory`.
 *
 * Converts the inputs into an `IngredientAmount`, pluralising units where
 * appropriate, converting the quantity to a `Frac` (or leaving a string),
 * setting `quantityMax`, and setting the RANGE and MULTIPLIER flags.
 *
 * The first five parameters are positional (matching Python's signature); the
 * remaining keyword-only options are grouped into `options`.
 */
export function ingredientAmountFactory(
  quantity: string,
  unit: string,
  text: string,
  confidence: number,
  startingIndex: number,
  options: {
    APPROXIMATE?: boolean;
    SINGULAR?: boolean;
    PREPARED_INGREDIENT?: boolean;
    stringUnits?: boolean;
    volumetricUnitsSystem?: VolumetricUnitsSystem;
    customUnits?: Record<string, string>;
  } = {},
): IngredientAmount {
  const {
    APPROXIMATE = false,
    SINGULAR = false,
    PREPARED_INGREDIENT = false,
    stringUnits = false,
    volumetricUnitsSystem = "us_customary",
    customUnits = {},
  } = options;

  let RANGE = false;
  let MULTIPLIER = false;

  if (quantity.endsWith("x")) {
    // If multiplier, set MULTIPLIER flag then strip "x" suffix and process
    // quantity as normal.
    MULTIPLIER = true;
    quantity = quantity.slice(0, -1);
  }

  let _quantity: Frac | string;
  let quantityMax: Frac | string;
  if (isRange(quantity)) {
    // If range, set quantity to min of range, quantity_max to max of range.
    const rangeParts = quantity.split("-").map((x) => toFrac(x));
    let minPart = rangeParts[0]!;
    let maxPart = rangeParts[0]!;
    for (const p of rangeParts) {
      if (p.cmp(minPart) < 0) minPart = p;
      if (p.cmp(maxPart) > 0) maxPart = p;
    }
    _quantity = minPart;
    quantityMax = maxPart;
    RANGE = true;
  } else if (isFloat(quantity) || FRACTION_TOKEN_PATTERN.test(quantity)) {
    _quantity = toFrac(quantity);
    quantityMax = _quantity;
  } else {
    _quantity = quantity;
    quantityMax = _quantity;
  }

  let _unit: Unit | string = unit;
  // Convert unit to a Unit where possible.
  if (!stringUnits) {
    _unit = convertToUnit(_unit, volumetricUnitsSystem);
  }

  // Pluralise unit as necessary.
  if (!quantityIsOne(_quantity) && _quantity !== "" && !RANGE) {
    text = pluraliseUnits(text, customUnits);
    if (typeof _unit === "string") {
      _unit = pluraliseUnits(_unit, customUnits);
    }
  }

  // Fix up text: replace intermediate fractions with text fraction, remove
  // additional leading/trailing spaces, and remove additional spaces in
  // fraction ranges.
  text = text.replace(/#/g, " ").replace(/\$/g, "/").trim();
  text = text.replace(/- /g, "-");

  return new IngredientAmount({
    quantity: _quantity,
    quantityMax,
    unit: _unit,
    text,
    confidence: pyRound(confidence, 6),
    startingIndex,
    APPROXIMATE,
    SINGULAR,
    RANGE,
    MULTIPLIER,
    PREPARED_INGREDIENT,
  });
}
