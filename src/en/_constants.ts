/**
 * Port of `upstream/ingredient_parser/en/_constants.py`.
 *
 * All constant tables are copied in full and, where the Python source derives
 * a table programmatically (capitalised UNITS, the flattened units set, the
 * extended AMBIGUOUS_UNITS list, the string-number regexes), the derivation is
 * reproduced exactly so the resulting tables are byte-for-byte identical.
 *
 * Where Python iteration order is significant (UNITS drives `pluraliseUnits`;
 * STRING_NUMBERS drives the alternation order of STRING_QUANTITY_HYPHEN and the
 * string-number regexes) the table is a `Map` so insertion order is preserved.
 */

/**
 * Python `str.capitalize()`: upper-case the first character, lower-case the
 * rest. e.g. "cL" -> "Cl", "floz" -> "Floz".
 */
function pyCapitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Plural and singular units. Length units are excluded.
// Base entries, in the exact source order.
const _UNITS_BASE: [string, string][] = [
  ["balls", "ball"],
  ["bags", "bag"],
  ["bars", "bar"],
  ["baskets", "basket"],
  ["batches", "batch"],
  ["blocks", "block"],
  ["bottles", "bottle"],
  ["boxes", "box"],
  ["branches", "branch"],
  ["buckets", "bucket"],
  ["bulbs", "bulb"],
  ["bunches", "bunch"],
  ["bundles", "bundle"],
  ["c", "c"],
  ["cans", "can"],
  ["canisters", "canister"],
  ["chunks", "chunk"],
  ["cloves", "clove"],
  ["clusters", "cluster"],
  ["counts", "count"],
  ["cl", "cl"],
  ["cL", "cL"],
  ["cubes", "cube"],
  ["cups", "cup"],
  ["cutlets", "cutlet"],
  ["dashes", "dash"],
  ["dessertspoons", "dessertspoon"],
  ["dollops", "dollop"],
  ["drops", "drop"],
  ["ears", "ear"],
  ["envelopes", "envelope"],
  ["feet", "foot"],
  ["fl", "fl"],
  ["floz", "floz"],
  ["g", "g"],
  ["gm", "gm"],
  ["gal", "gal"],
  ["gallons", "gallon"],
  ["glasses", "glass"],
  ["grams", "gram"],
  ["grinds", "grind"],
  ["handfuls", "handful"],
  ["heads", "head"],
  ["jars", "jar"],
  ["jiggers", "jigger"],
  ["kg", "kg"],
  ["kilograms", "kilogram"],
  ["knobs", "knob"],
  ["ladles", "ladle"],
  ["lbs", "lb"],
  ["leaves", "leaf"],
  ["lengths", "length"],
  ["links", "link"],
  ["l", "l"],
  ["liters", "liter"],
  ["litres", "litre"],
  ["loaves", "loaf"],
  ["milliliters", "milliliter"],
  ["millilitres", "millilitre"],
  ["ml", "ml"],
  ["mL", "mL"],
  ["mugs", "mug"],
  ["ounces", "ounce"],
  ["oz", "oz"],
  ["packs", "pack"],
  ["packages", "package"],
  ["packets", "packet"],
  ["pairs", "pair"],
  ["pieces", "piece"],
  ["pinches", "pinch"],
  ["pints", "pint"],
  ["pods", "pod"],
  ["pots", "pot"],
  ["pounds", "pound"],
  ["pts", "pt"],
  ["punnets", "punnet"],
  ["racks", "rack"],
  ["rashers", "rasher"],
  ["recipes", "recipe"],
  ["rectangles", "rectangle"],
  ["ribs", "rib"],
  ["quarts", "quart"],
  ["qt", "qt"],
  ["sachets", "sachet"],
  ["scoops", "scoop"],
  ["sections", "section"],
  ["segments", "segment"],
  ["shakes", "shake"],
  ["sheets", "sheet"],
  ["shots", "shot"],
  ["shoots", "shoot"],
  ["slabs", "slab"],
  ["slices", "slice"],
  ["sprigs", "sprig"],
  ["squares", "square"],
  ["stalks", "stalk"],
  ["stems", "stem"],
  ["sticks", "stick"],
  ["strips", "strip"],
  ["tablespoons", "tablespoon"],
  ["tbsps", "tbsp"],
  ["tbs", "tb"],
  ["teaspoons", "teaspoon"],
  ["tins", "tin"],
  ["tsps", "tsp"],
  ["tubs", "tub"],
  ["tubes", "tube"],
  ["twists", "twist"],
  ["units", "unit"],
  ["wedges", "wedge"],
  ["vials", "vial"],
  ["wheels", "wheel"],
];

// Generate capitalized version of each entry in the UNITS dictionary, then
// merge (equivalent to Python's `UNITS = UNITS | _capitalized_units`).
// Note: some base keys collide when capitalised (e.g. "cl"/"cL" -> "Cl"), so
// the capitalized map has fewer entries than the base (matching Python).
const _capitalizedUnits = new Map<string, string>();
for (const [plural, singular] of _UNITS_BASE) {
  _capitalizedUnits.set(pyCapitalize(plural), pyCapitalize(singular));
}
export const UNITS: Map<string, string> = new Map<string, string>(_UNITS_BASE);
for (const [plural, singular] of _capitalizedUnits) {
  UNITS.set(plural, singular);
}

// Create a flattened set of all keys and values in UNITS dict
// since we need this in a few places
export const FLATTENED_UNITS_LIST: Set<string> = new Set<string>();
for (const [plural, singular] of UNITS) {
  FLATTENED_UNITS_LIST.add(plural);
  FLATTENED_UNITS_LIST.add(singular);
}

// Units that can be part of the name
// e.g. 1 teaspoon ground cloves, or 5 bay leaves
export const AMBIGUOUS_UNITS: string[] = [
  "cloves",
  "leaves",
  "slabs",
  "wedges",
  "ribs",
  "gram", // e.g. gram (chickpea) flour
  "glass", // e.g. glass noodles
];
// Extend list automatically to include singular and capitalized forms
{
  const _ambiguousUnitsAltForms: string[] = [];
  for (const ambUnit of [...AMBIGUOUS_UNITS]) {
    _ambiguousUnitsAltForms.push(pyCapitalize(ambUnit));
    const singular = UNITS.get(ambUnit);
    if (singular) {
      _ambiguousUnitsAltForms.push(singular);
    }
    const singularCapitalised = UNITS.get(pyCapitalize(ambUnit));
    if (singularCapitalised) {
      _ambiguousUnitsAltForms.push(singularCapitalised);
    }
  }
  AMBIGUOUS_UNITS.push(..._ambiguousUnitsAltForms);
}

// Words that indicate ingredient size
export const SIZES: string[] = [
  "big",
  "bite-size",
  "bite-sized",
  "extra-large",
  "jumbo",
  "large",
  "lg",
  "little",
  "md",
  "medium",
  "medium-large",
  "medium-size",
  "medium-sized",
  "medium-small",
  "medium-to-large",
  "miniature",
  "regular",
  "slim",
  "sm",
  "small",
  "small-to-medium",
  "smaller",
  "smallest",
  "thick",
  "thin",
  "tiny",
];

// Strings and their numeric representation
export const STRING_NUMBERS: Map<string, string> = new Map<string, string>([
  ["one-quarter", "1/4"],
  ["one-half", "1/2"],
  ["three-quarter", "3/4"],
  ["three-quarters", "3/4"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["thirteen", "13"],
  ["fourteen", "14"],
  ["fifteen", "15"],
  ["sixteen", "16"],
  ["seventeen", "17"],
  ["eighteen", "18"],
  ["nineteen", "19"],
]);

// Precompile the regular expressions for matching the string numbers.
// This is case insensitive so it replaces e.g. "one" and "One".
// Only match if the string is preceded by a non-word character or is at the
// start of the sentence.
export const STRING_NUMBERS_REGEXES: Map<string, [RegExp, string]> = new Map();
for (const [s, n] of STRING_NUMBERS) {
  // Python: re.compile(rf"\b({s})\b", flags=re.IGNORECASE)
  // NOTE: JS \b is ASCII-only vs Python's unicode \b — residual divergence risk
  // next to non-ASCII word chars; flagged for the Task 8 parity gate.
  STRING_NUMBERS_REGEXES.set(s, [new RegExp(`\\b(${s})\\b`, "gi"), n]);
}

// Unicode fractions and their replacements as string fractions.
// Most of the time we need to insert a space in front of the replacement so we
// don't merge the replacement with the previous token i.e. 1½ != 11/2.
// However, if the prior character is a hyphen, we don't want to insert a space
// as this will mess up any ranges.
export const UNICODE_FRACTIONS: Map<string, string> = new Map<string, string>([
  ["-⅛", "-1/8"],
  ["-⅜", "-3/8"],
  ["-⅝", "-5/8"],
  ["-⅞", "-7/8"],
  ["-⅙", "-1/6"],
  ["-⅚", "-5/6"],
  ["-⅕", "-1/5"],
  ["-⅖", "-2/5"],
  ["-⅗", "-3/5"],
  ["-⅘", "-4/5"],
  ["-\xbc", "-1/4"],
  ["-\xbe", "-3/4"],
  ["-⅓", "-1/3"],
  ["-⅔", "-2/3"],
  ["-\xbd", "-1/2"],
  ["⅛", " 1/8"],
  ["⅜", " 3/8"],
  ["⅝", " 5/8"],
  ["⅞", " 7/8"],
  ["⅙", " 1/6"],
  ["⅚", " 5/6"],
  ["⅕", " 1/5"],
  ["⅖", " 2/5"],
  ["⅗", " 3/5"],
  ["⅘", " 4/5"],
  ["\xbc", " 1/4"],
  ["\xbe", " 3/4"],
  ["⅓", " 1/3"],
  ["⅔", " 2/3"],
  ["\xbd", " 1/2"],
]);

// Stop words - high frequency grammatical words derived from
// nltk.corpus.stopwords. The original list from NLTK has been edited to remove
// words that the tokenizer cannot output.
// See also https://dx.doi.org/10.18653/v1/W18-2502
export const STOP_WORDS: Set<string> = new Set<string>([
  "i",
  "me",
  "my",
  "myself",
  "we",
  "our",
  "ours",
  "ourselves",
  "you",
  "you're",
  "you've",
  "you'll",
  "you'd",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "she's",
  "her",
  "hers",
  "herself",
  "it",
  "it's",
  "its",
  "itself",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "that'll",
  "these",
  "those",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "having",
  "do",
  "does",
  "did",
  "doing",
  "a",
  "an",
  "the",
  "and",
  "but",
  "if",
  "or",
  "because",
  "as",
  "until",
  "while",
  "of",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "to",
  "from",
  "up",
  "down",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "can",
  "will",
  "just",
  "don't",
  "should",
  "should've",
  "now",
  "aren't",
  "couldn't",
  "didn't",
  "doesn't",
  "hadn't",
  "hasn't",
  "haven't",
  "isn't",
  "mightn't",
  "mustn't",
  "needn't",
  "shan't",
  "shouldn't",
  "wasn't",
  "weren't",
  "won't",
  "wouldn't",
]);

// Tokens that indicate a quantity is approximate
export const APPROXIMATE_PREFIXES: string[] = [
  "about",
  "approx",
  "approximately",
  "nearly",
  "roughly",
  "~",
  "generous",
];
export const APPROXIMATE_SUFFIXES: string[][] = [["or", "so"]];
// Tokens that indicate an amount is singular
export const SINGULAR_TOKENS: string[] = ["each"];
// Tokens that indicate an amount refers to the prepared ingredient
export const PREPARED_INGREDIENT_TOKENS: string[][] = [
  ["to", "yield"],
  ["to", "make"],
];

// List of sets, where each set contains the synonyms that represent the same
// unit.
export const UNIT_SYNONYMS: Set<string>[] = [
  new Set(["cup", "c"]),
  new Set(["gram", "g", "gm"]),
  new Set(["kilogram", "kg"]),
  new Set(["litre", "liter", "l"]),
  new Set(["ounce", "oz"]),
  new Set(["pound", "lb"]),
  new Set(["quart", "qt"]),
  new Set(["tablespoon", "tbsp", "tbs", "tb"]),
  new Set(["teaspoon", "tsp"]),
];

// Set of units that refer to lengths.
export const LENGTH_UNITS: Set<string> = new Set<string>([
  "centimeter",
  "centimetre",
  "cm",
  "in",
  "inch",
  "inches",
  "millimeter",
  "millimetre",
  "mm",
]);

// Set of tokens that refer to the physical dimensions of an ingredient.
export const DIMENSIONS: Set<string> = new Set<string>([
  "diameter",
  "inch-long",
  "inch-thick",
  "length",
  "long",
  "thick",
  "thickness",
  "wide",
  "width",
]);

export const INDEFINITE_QUANTIFIERS: Set<string> = new Set<string>([
  "couple",
  "few",
  "many",
  "plenty",
  "more",
  "several",
  "some",
]);
