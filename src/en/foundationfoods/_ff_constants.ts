/**
 * Port of `upstream/ingredient_parser/en/foundationfoods/_ff_constants.py`.
 *
 * `FOUNDATION_FOOD_OVERRIDES` is keyed on a tuple of stemmed tokens; here the
 * key is the JSON-encoded token array and the value is the field data used to
 * construct a fresh `FoundationFood` (with the caller's `name_index`).
 *
 * Note: `AMBIGUOUS_ADJECTIVES` reproduces an upstream quirk — a missing comma
 * causes implicit string concatenation, so "strong" + "hard" becomes the single
 * token "stronghard".
 */

/** Field data for a foundation food override (text, confidence, fdcId, category, dataType). */
export interface OverrideData {
  text: string;
  confidence: number;
  fdcId: number;
  category: string;
  dataType: string;
}

function makeKey(tokens: string[]): string {
  return JSON.stringify(tokens);
}

const OVERRIDE_ENTRIES: [string[], OverrideData][] = [
  [["salt"], { text: "Salt, table, iodized", confidence: 1.0, fdcId: 746775, category: "Spices and Herbs", dataType: "foundation_food" }],
  [["sea", "salt"], { text: "Salt, table, iodized", confidence: 1.0, fdcId: 746775, category: "Spices and Herbs", dataType: "foundation_food" }],
  [["pepper"], { text: "Spices, pepper, black", confidence: 1.0, fdcId: 170931, category: "Spices and Herbs", dataType: "sr_legacy_food" }],
  [["white", "pepper"], { text: "Spices, pepper, white", confidence: 1.0, fdcId: 170933, category: "Spices and Herbs", dataType: "sr_legacy_food" }],
  [["egg"], { text: "Eggs, Grade A, Large, egg whole", confidence: 1.0, fdcId: 748967, category: "Dairy and Egg Products", dataType: "foundation_food" }],
  [["butter"], { text: "Butter, stick, unsalted", confidence: 1.0, fdcId: 789828, category: "Dairy and Egg Products", dataType: "foundation_food" }],
  [["all-purpos", "flour"], { text: "Flour, wheat, all-purpose, unenriched, unbleached", confidence: 1.0, fdcId: 790018, category: "Cereal Grains and Pasta", dataType: "foundation_food" }],
  [["all", "purpos", "flour"], { text: "Flour, wheat, all-purpose, unenriched, unbleached", confidence: 1.0, fdcId: 790018, category: "Cereal Grains and Pasta", dataType: "foundation_food" }],
  [["sugar"], { text: "Sugar, NFS", confidence: 1.0, fdcId: 2710257, category: "Sugars and honey", dataType: "survey_fndds_food" }],
  [["caster", "sugar"], { text: "Sugar, NFS", confidence: 1.0, fdcId: 2710257, category: "Sugars and honey", dataType: "survey_fndds_food" }],
  [["rice"], { text: "Rice, cooked, NFS", confidence: 1.0, fdcId: 2708402, category: "Rice", dataType: "survey_fndds_food" }],
  [["dill"], { text: "Dill weed, fresh", confidence: 1.0, fdcId: 172233, category: "Spices and Herbs", dataType: "sr_legacy_food" }],
];

export const FOUNDATION_FOOD_OVERRIDES: Map<string, OverrideData> = new Map(
  OVERRIDE_ENTRIES.map(([tokens, data]) => [makeKey(tokens), data]),
);

/** Look up an override by an array of stemmed tokens. */
export function lookupOverride(tokens: string[]): OverrideData | undefined {
  return FOUNDATION_FOOD_OVERRIDES.get(makeKey(tokens));
}

/**
 * Verb stems, the presence of which indicates the food is not raw and therefore
 * should not be biased towards a raw food.
 */
export const NON_RAW_FOOD_VERB_STEMS: Set<string> = new Set([
  "age", "bake", "black", "blanch", "boil", "brais", "brew", "broil", "butter",
  "can", "cook", "crisp", "cultur", "cure", "decaffein", "dehydr", "devil",
  "distil", "dri", "ferment", "flavor", "fortifi", "fresh", "fri", "grill",
  "ground", "heat", "hull", "microwav", "parboil", "pasteur", "pickl", "poach",
  "precook", "prepar", "preserv", "powder", "reconstitut", "refin", "refri",
  "reheat", "rehydr", "render", "roast", "simmer", "smoke", "soak", "spice",
  "steam", "stew", "toast", "unbak", "unsalt",
  // Also include "raw" so we don't add it again if already present.
  "raw",
]);

/**
 * Noun stems, for foods that are implicitly not raw and therefore should not be
 * biased towards a raw food.
 */
export const NON_RAW_FOOD_NOUN_STEMS: Set<string> = new Set([
  "bread", "broth", "butter", "cream", "custard", "fat", "ketchup", "mayonnais",
  "milk", "oliv", "pasta", "pure", "salt", "sauce", "stock", "sugar", "syrup",
]);

/** Tokens that indicate following words are negated. NS = not specified. */
export const NEGATION_TOKENS: Set<string> = new Set(["no", "not", "without", "NS"]);

/** Tokens that indicate following words have reduced relevance to the ingredient. */
export const REDUCED_RELEVANCE_TOKENS: Set<string> = new Set(["with", "on"]);

/** Ambiguous ingredient name adjectives (see quirk note above). */
export const AMBIGUOUS_ADJECTIVES: string[] = ["hot", "cool", "stronghard"];
