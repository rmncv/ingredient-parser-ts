import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { IngredientText, ParsedIngredient } from "../../src/dataclasses.js";
import { ingredientAmountFactory } from "../../src/en/_utils.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_postprocess.py

function pFixture(): PostProcessor {
  const lt = labelledTokens({
    tokens: ["2", "14", "ounce", "can", "of", "coconut", "milk"],
    posTags: ["CD", "CD", "NN", "MD", "VB", "NN", "NN"],
    labels: ["QTY", "QTY", "UNIT", "UNIT", "COMMENT", "B_NAME_TOK", "I_NAME_TOK"],
    scores: [
      0.9995971493946465, 0.9941502269360797, 0.9978571790476597,
      0.9343053167729019, 0.8352859914316577, 0.9907929042080257,
      0.9954196827665529,
    ],
  });
  return new PostProcessor("2 14 ounce cans of coconut milk", lt, {}, { discardIsolatedStopWords: true });
}

describe("TestPostProcessor__builtins__", () => {
  it("test__str__", () => {
    const truth =
      "Post-processed recipe ingredient sentence\n" +
      "\t[('2', 'QTY'), ('14', 'QTY'), ('ounce', 'UNIT'), ('can', 'UNIT'), ('of', 'COMMENT'), " +
      "('coconut', 'B_NAME_TOK'), ('milk', 'I_NAME_TOK')]";
    expect(pFixture().toString()).toBe(truth);
  });

  it("test__repr__", () => {
    expect(pFixture().repr()).toBe('PostProcessor("2 14 ounce cans of coconut milk")');
  });
});

describe("TestPostProcessor_parsed", () => {
  it("test", () => {
    const p = pFixture();
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "coconut milk", confidence: 0.993106, startingIndex: 5 })],
      size: null,
      amount: [
        ingredientAmountFactory("2", "cans", "2 cans", 0.966951, 0),
        ingredientAmountFactory("14", "ounce", "14 ounces", 0.99415, 1, { SINGULAR: true }),
      ],
      preparation: null,
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "2 14 ounce cans of coconut milk",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_string_numbers", () => {
    const lt = labelledTokens({
      tokens: ["2", "butternut", "squash", ",", "about", "one", "and", "one-half", "pound", "each"],
      posTags: ["CD", "NN", "NN", ",", "IN", "CD", "CC", "JJ", "NN", "DT"],
      labels: ["QTY", "B_NAME_TOK", "I_NAME_TOK", "PUNC", "COMMENT", "QTY", "QTY", "QTY", "UNIT", "COMMENT"],
      scores: [
        0.9984380824450226, 0.9978651159111281, 0.9994189046396519,
        0.9999962272946663, 0.9922077606027025, 0.8444345718042952,
        0.711112570789477, 0.7123166610204924, 0.7810746702425934,
        0.9447105511029686,
      ],
    });
    const p = new PostProcessor("2 butternut squash, about one and one-half pounds each", lt, {}, { discardIsolatedStopWords: true });
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "butternut squash", confidence: 0.998642, startingIndex: 1 })],
      size: null,
      amount: [
        ingredientAmountFactory("2", "", "2", 0.998438, 0),
        ingredientAmountFactory("1.5", "pound", "1 1/2 pounds", 0.768515, 5, { APPROXIMATE: true, SINGULAR: true }),
      ],
      preparation: null,
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "2 butternut squash, about one and one-half pounds each",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_string_numbers_range", () => {
    const lt = labelledTokens({
      tokens: ["2", "butternut", "squash", ",", "about", "one", "or", "two", "pounds", "each"],
      posTags: ["CD", "NN", "NN", ",", "IN", "CD", "CC", "CD", "NNS", "DT"],
      labels: ["QTY", "B_NAME_TOK", "I_NAME_TOK", "PUNC", "COMMENT", "QTY", "QTY", "QTY", "UNIT", "COMMENT"],
      scores: [
        0.9984380824450226, 0.9978651159111281, 0.9994189046396519,
        0.9999962272946663, 0.9922077606027025, 0.8444345718042952,
        0.711112570789477, 0.7123166610204924, 0.7810746702425934,
        0.9447105511029686,
      ],
    });
    const p = new PostProcessor("2 butternut squash, about one or two pounds each", lt, {}, { discardIsolatedStopWords: true });
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "butternut squash", confidence: 0.998642, startingIndex: 1 })],
      size: null,
      amount: [
        ingredientAmountFactory("2", "", "2", 0.998438, 0),
        ingredientAmountFactory("1-2", "pounds", "1-2 pounds", 0.768515, 5, { APPROXIMATE: true, SINGULAR: true }),
      ],
      preparation: null,
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "2 butternut squash, about one or two pounds each",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_postprep_amounts", () => {
    const lt = labelledTokens({
      tokens: ["1", "tbsp", "chopped", "pistachios"],
      posTags: ["CD", "NN", "VBD", "NNS"],
      labels: ["QTY", "UNIT", "PREP", "B_NAME_TOK"],
      scores: [0.9997566777785302, 0.9975314001146002, 0.9936702913782429, 0.9988409678348467],
    });
    const p = new PostProcessor("1 tbsp chopped pistachios", lt, {}, { discardIsolatedStopWords: false });
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "pistachios", confidence: 0.998841, startingIndex: 3 })],
      size: null,
      amount: [ingredientAmountFactory("1", "tbsp", "1 tbsp", 0.998644, 0)],
      preparation: new IngredientText({ text: "chopped", confidence: 0.99367, startingIndex: 2 }),
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "1 tbsp chopped pistachios",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_no_discard_isolated_stop_words", () => {
    const lt = labelledTokens({
      tokens: ["2", "14", "ounce", "can", "of", "coconut", "milk"],
      posTags: ["CD", "CD", "NN", "MD", "IN", "NN", "NN"],
      labels: ["QTY", "QTY", "UNIT", "UNIT", "COMMENT", "B_NAME_TOK", "I_NAME_TOK"],
      scores: [
        0.9995971493946465, 0.9941502269360797, 0.9978571790476597,
        0.9343053167729019, 0.8352859914316577, 0.9907929042080257,
        0.9954196827665529,
      ],
    });
    const p = new PostProcessor("2 14 ounce cans of coconut milk", lt, {}, { discardIsolatedStopWords: false });
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "coconut milk", confidence: 0.993106, startingIndex: 5 })],
      size: null,
      amount: [
        ingredientAmountFactory("2", "cans", "2 cans", 0.966951, 0),
        ingredientAmountFactory("14", "ounce", "14 ounces", 0.99415, 1, { SINGULAR: true }),
      ],
      preparation: null,
      comment: new IngredientText({ text: "of", confidence: 0.835286, startingIndex: 4 }),
      purpose: null,
      foundationFoods: [],
      sentence: "2 14 ounce cans of coconut milk",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_fraction_in_prep", () => {
    const lt = labelledTokens({
      tokens: ["3", "carrots", ",", "peeled", "and", "sliced", "into", "5", "mm", "(", "#1$4", "in", ")", "coins"],
      posTags: ["CD", "NNS", ",", "VBD", "CC", "VBD", "IN", "CD", "NN", "(", "NNP", "IN", ")", "NNS"],
      labels: ["QTY", "B_NAME_TOK", "PUNC", "PREP", "PREP", "PREP", "PREP", "PREP", "PREP", "PUNC", "PREP", "PREP", "PUNC", "PREP"],
      scores: [
        0.9994675946370136, 0.9982121821692039, 0.9999986664162547,
        0.9999349193863984, 0.999720763986239, 0.9999682855629554,
        0.9999116643460678, 0.9998989415285744, 0.9994126452404396,
        0.999365113705119, 0.649315853101702, 0.651598144547812,
        0.9992304409607873, 0.660356736493678,
      ],
    });
    const p = new PostProcessor("3 carrots, peeled and sliced into 5mm (¼in) coins", lt, {});
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "carrots", confidence: 0.998212, startingIndex: 1 })],
      size: null,
      amount: [ingredientAmountFactory("3", "", "3", 0.999468, 0)],
      preparation: new IngredientText({ text: "peeled and sliced into 5 mm (1/4 in) coins", confidence: 0.905338, startingIndex: 3 }),
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "3 carrots, peeled and sliced into 5mm (¼in) coins",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_fraction_range_in_prep", () => {
    const lt = labelledTokens({
      tokens: ["3", "carrots", ",", "peeled", "and", "sliced", "into", "5-10", "mm", "(", "#1$4-#1$2", "in", ")", "coins"],
      posTags: ["CD", "NNS", ",", "VBD", "CC", "VBD", "IN", "JJ", "NN", "(", "JJ", "IN", ")", "NNS"],
      labels: ["QTY", "B_NAME_TOK", "PUNC", "PREP", "PREP", "PREP", "PREP", "PREP", "PREP", "PUNC", "PREP", "PREP", "PUNC", "PREP"],
      scores: [
        0.9994675946370136, 0.9982121821692039, 0.9999986664162547,
        0.9999349193863984, 0.999720763986239, 0.9999682855629554,
        0.9999116643460678, 0.9998989415285744, 0.9994126452404396,
        0.999365113705119, 0.649315853101702, 0.651598144547812,
        0.9992304409607873, 0.660356736493678,
      ],
    });
    const p = new PostProcessor("3 carrots, peeled and sliced into 5-10mm (¼-½in) coins", lt, {});
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "carrots", confidence: 0.998212, startingIndex: 1 })],
      size: null,
      amount: [ingredientAmountFactory("3", "", "3", 0.999468, 0)],
      preparation: new IngredientText({ text: "peeled and sliced into 5-10 mm (1/4-1/2 in) coins", confidence: 0.905338, startingIndex: 3 }),
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "3 carrots, peeled and sliced into 5-10mm (¼-½in) coins",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_split_ingredient_name", () => {
    const lt = labelledTokens({
      tokens: ["5", "fresh", "large", "basil", "leaves"],
      posTags: ["CD", "JJ", "JJ", "NN", "NN"],
      labels: ["QTY", "B_NAME_TOK", "SIZE", "B_NAME_TOK", "I_NAME_TOK"],
      scores: [0.99938548647492, 0.968725226931013, 0.9588222550056443, 0.5092435116086577, 0.9877923155569212],
    });
    const p = new PostProcessor("5 fresh large basil leaves", lt, {}, { discardIsolatedStopWords: false });
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "fresh basil leaves", confidence: 0.858622, startingIndex: 1 })],
      size: new IngredientText({ text: "large", confidence: 0.958822, startingIndex: 2 }),
      amount: [ingredientAmountFactory("5", "", "5", 0.999385, 0)],
      preparation: null,
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "5 fresh large basil leaves",
    });
    expect(p.parsed()).toEqual(expected);
  });

  it("test_multiplier_range", () => {
    const lt = labelledTokens({
      tokens: ["3-4x", "15", "ml", "tablespoon", "olive", "oil"],
      posTags: ["CD", "CD", "NN", "NNS", "JJ", "NN"],
      labels: ["QTY", "QTY", "UNIT", "UNIT", "B_NAME_TOK", "I_NAME_TOK"],
      scores: [
        0.9999535063384082, 0.9997353684954745, 0.9999941074194176,
        0.999910213422632, 0.9994944350996183, 0.9995007468043913,
      ],
    });
    const p = new PostProcessor("3 - 4 x 15ml tablespoons olive oil", lt, {});
    const expected = new ParsedIngredient({
      name: [new IngredientText({ text: "olive oil", confidence: 0.999498, startingIndex: 4 })],
      size: null,
      amount: [
        ingredientAmountFactory("3-4x", "", "3-4x", 0.999954, 0),
        ingredientAmountFactory("15", "ml tablespoons", "15 ml tablespoon", 0.99988, 1, { SINGULAR: true }),
      ],
      preparation: null,
      comment: null,
      purpose: null,
      foundationFoods: [],
      sentence: "3 - 4 x 15ml tablespoons olive oil",
    });
    expect(p.parsed()).toEqual(expected);
    expect(expected.amount[0]!.MULTIPLIER).toBe(true);
    expect(expected.amount[0]!.RANGE).toBe(true);
  });
});
