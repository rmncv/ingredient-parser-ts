import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PreProcessor } from "../../src/en/preprocess.js";
import type { FeatureDict } from "../../src/inference.js";

// Port of upstream/tests/preprocess/test_preprocess.py

describe("TestPreProcessor__builtins__", () => {
  it("test__str__", () => {
    const p = new PreProcessor("1/2 cup chicken broth", {});
    const truth = [
      "Pre-processed recipe ingredient sentence",
      "\t  Input: 1/2 cup chicken broth",
      "\tCleaned: #1$2 cup chicken broth",
      "\t Tokens: ['#1$2', 'cup', 'chicken', 'broth']",
    ].join("\n");
    expect(p.toString()).toEqual(truth);
  });

  it("test__repr__", () => {
    const p = new PreProcessor("1/2 cup chicken broth", {});
    expect(p.repr()).toEqual('PreProcessor("1/2 cup chicken broth")');
  });
});

// Input sentence -> normalised form.
const normaliseTestCases: [string, string][] = [
  ["&frac12; cup warm water (105°F)", "#1$2 cup warm water (105°F)"],
  ["3 1/2 chilis anchos", "3#1$2 chilis anchos"],
  ["six eggs", "six eggs"],
  ["thumbnail-size piece ginger", "thumbnail-size piece ginger"],
  ["2 cups flour – white or self-raising", "2 cups flour - white or self-raising"],
  ["3–4 sirloin steaks", "3-4 sirloin steaks"],
  ["three large onions", "three large onions"],
  ["twelve bonbons", "twelve bonbons"],
  ["1&frac34; cups tomato ketchup", "1#3$4 cups tomato ketchup"],
  ["1/2 cup icing sugar", "#1$2 cup icing sugar"],
  ["2 3/4 pound chickpeas", "2#3$4 pound chickpeas"],
  ["1 and 1/2 tsp fine grain sea salt", "1#1$2 tsp fine grain sea salt"],
  ["1 and 1/4 cups dark chocolate morsels", "1#1$4 cups dark chocolate morsels"],
  ["½ cup icing sugar", "#1$2 cup icing sugar"],
  ["3⅓ cups warm water", "3#1$3 cups warm water"],
  ["¼-½ teaspoon", "#1$4-#1$2 teaspoon"],
  ["100g green beans", "100 g green beans"],
  ["2-pound red peppers, sliced", "2 pound red peppers, sliced"],
  ["2lb1oz cherry tomatoes", "2 lb 1 oz cherry tomatoes"],
  ["2lb-1oz cherry tomatoes", "2 lb - 1 oz cherry tomatoes"],
  ["1 tsp. garlic powder", "1 tsp garlic powder"],
  ["5 oz. chopped tomatoes", "5 oz chopped tomatoes"],
  ["1 to 2 mashed bananas", "1-2 mashed bananas"],
  ["5- or 6- large apples", "5-6- large apples"],
  ["227 g - 283.5 g/8-10 oz duck breast", "227-283.5 g/8-10 oz duck breast"],
  ["400-500 g/14 oz - 17 oz rhubarb", "400-500 g/14-17 oz rhubarb"],
  ["8 x 450 g/1 lb live lobsters", "8x 450 g/1 lb live lobsters"],
  ["4 x 100 g wild salmon fillet", "4x 100 g wild salmon fillet"],
  [
    "½ - ¾ cup heavy cream, plus extra for brushing the tops of the scones",
    "#1$2-#3$4 cup heavy cream, plus extra for brushing the tops of the scones",
  ],
];

describe("TestPreProcessor_normalise", () => {
  it.each(normaliseTestCases)("normalises %j", (inputSentence, normalised) => {
    const p = new PreProcessor(inputSentence, {});
    expect(p.sentence).toEqual(normalised);
  });
});

describe("TestPreProcessor_sentence_features", () => {
  it("test", () => {
    const p = new PreProcessor("1/2 cup chicken broth", {});
    const expected = JSON.parse(
      readFileSync(
        new URL("fixtures_sentence_features_expected.json", import.meta.url),
        "utf-8",
      ),
    ) as FeatureDict[];
    expect(p.sentenceFeatures()).toEqual(expected);
  });
});
