import { describe, it, expect } from "vitest";
import { parseIngredient } from "../../src/index.js";

// Port of upstream/tests/foundationfoods/test_foundation_foods.py

const OVERRIDE_EXAMPLES: [string, number][] = [
  ["1 egg", 748967],
  ["2 eggs", 748967],
  ["1 tbsp salt", 746775],
  ["4 cloves garlic, crushed", 1104647],
];

const SIMPLE_EXAMPLES: [string, number][] = [
  ["½ yellow bell pepper, chopped", 2258589],
  ["8 large strawberries, hulled and halved", 2346409],
  ["1 cup white wine", 2710689],
  ["1 lg yellow onion, chopped", 790646],
  ["3 red chili peppers, seeded and finely chopped", 170106],
  ["1/2 teaspoon ground ginger", 170926],
  ["2 large red onions, sliced", 790577],
  ["3 skinless, boneless chicken breasts, chopped into 2 cm cubes", 2646170],
  ["200 g canned chopped tomatoes", 2685581],
  ["4 tbsp tomato ketchup", 2709733],
  ["small handful fresh parsley, leaves picked and chopped", 170416],
];

const BIAS_EXAMPLES: [string, number[]][] = [
  ["2 red or green peppers", [2258588, 2258590]],
  ["2 cooked red or green peppers", [2709976, 2709977]],
];

const MULTIPLE_EXAMPLES: [string, number[]][] = [
  ["salt and black pepper", [170931, 746775]],
  ["24 fresh basil leaves or dried basil", [172232, 171317]],
  ["2 red or green peppers", [2258588, 2258590]],
  ["250 ml hot beef or chicken stock", [172883, 172884]],
];

const NO_MATCH_EXAMPLES: string[] = ["twelve bonbons"];

const NO_EMBEDDING_TOKENS: [string, number | null][] = [
  ["1 waxgourd", 170069], // not in embeddings, but has FDC match
  ["200 g lionfish", null], // not in embeddings and no FDC match
  ["1 cup x", null], // no valid ingredient name tokens
];

describe("PostProcessor.matchFoundationFoods", () => {
  it.each(OVERRIDE_EXAMPLES)("override: %s -> %d", (sentence, fdcId) => {
    const p = parseIngredient(sentence, { foundationFoods: true });
    expect(p.foundationFoods).not.toEqual([]);
    expect(p.foundationFoods[0]!.fdcId).toBe(fdcId);
    expect(p.foundationFoods[0]!.confidence).toBe(1);
  });

  it.each(SIMPLE_EXAMPLES)("simple: %s -> %d", (sentence, fdcId) => {
    const p = parseIngredient(sentence, { foundationFoods: true });
    expect(p.foundationFoods).not.toEqual([]);
    expect(p.foundationFoods[0]!.fdcId).toBe(fdcId);
  });

  it.each(SIMPLE_EXAMPLES)("simple combined names: %s -> %d", (sentence, fdcId) => {
    const p = parseIngredient(sentence, { separateNames: false, foundationFoods: true });
    expect(p.foundationFoods).not.toEqual([]);
    expect(p.foundationFoods[0]!.fdcId).toBe(fdcId);
  });

  it.each(MULTIPLE_EXAMPLES)("multiple: %s", (sentence, fdcIds) => {
    const p = parseIngredient(sentence, { foundationFoods: true });
    expect(p.foundationFoods.length).toBeGreaterThan(1);
    for (const ff of p.foundationFoods) {
      expect(fdcIds).toContain(ff.fdcId);
    }
  });

  it.each(BIAS_EXAMPLES)("bias: %s", (sentence, fdcIds) => {
    const p = parseIngredient(sentence, { foundationFoods: true });
    expect(p.foundationFoods.length).toBeGreaterThan(1);
    for (const ff of p.foundationFoods) {
      expect(fdcIds).toContain(ff.fdcId);
    }
  });

  it.each(NO_MATCH_EXAMPLES)("no match: %s", (sentence) => {
    const p = parseIngredient(sentence, { foundationFoods: true });
    expect(p.foundationFoods).toEqual([]);
  });

  it.each(NO_EMBEDDING_TOKENS)("no embeddings: %s -> %s", (sentence, fdcId) => {
    const p = parseIngredient(sentence, { foundationFoods: true });
    if (fdcId) {
      expect(p.foundationFoods).not.toEqual([]);
      expect(p.foundationFoods[0]!.fdcId).toBe(fdcId);
    } else {
      expect(p.foundationFoods).toEqual([]);
    }
  });
});
