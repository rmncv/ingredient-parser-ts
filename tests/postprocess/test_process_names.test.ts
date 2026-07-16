import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { IngredientText } from "../../src/dataclasses.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_process_names.py

describe("TestPostProcessor_postprocess_names", () => {
  it("test_single_name", () => {
    const lt = labelledTokens({
      tokens: ["2", "14", "ounce", "can", "of", "coconut", "milk"],
      posTags: ["CD", "CD", "NN", "MD", "IN", "NN", "NN"],
      labels: ["QTY", "QTY", "UNIT", "UNIT", "COMMENT", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("2 14 ounce cans of coconut milk", lt, {});
    const [names] = p.postprocessNames();
    expect(names).toEqual([
      new IngredientText({ text: "coconut milk", confidence: 0, startingIndex: 5 }),
    ]);
  });

  it("test_multiple_independent_names", () => {
    const lt = labelledTokens({
      tokens: ["2", "tbsp", "butter", "or", "olive", "oil"],
      posTags: ["CD", "JJ", "NN", "CC", "JJ", "NN"],
      labels: ["QTY", "UNIT", "B_NAME_TOK", "NAME_SEP", "B_NAME_TOK", "I_NAME_TOK"],
    });
    const p = new PostProcessor("2 tbsp butter or olive oil", lt, {});
    const [names] = p.postprocessNames();
    expect(names).toEqual([
      new IngredientText({ text: "butter", confidence: 0, startingIndex: 2 }),
      new IngredientText({ text: "olive oil", confidence: 0, startingIndex: 4 }),
    ]);
  });

  it("test_multiple_variant_names", () => {
    const lt = labelledTokens({
      tokens: ["2", "cup", "beef", "or", "vegetable", "stock"],
      posTags: ["CD", "NN", "NN", "CC", "JJ", "NN"],
      labels: ["QTY", "UNIT", "NAME_VAR", "NAME_SEP", "NAME_VAR", "B_NAME_TOK"],
    });
    const p = new PostProcessor("2 cups beef or vegetable stock", lt, {});
    const [names] = p.postprocessNames();
    expect(names).toEqual([
      new IngredientText({ text: "beef stock", confidence: 0, startingIndex: 2 }),
      new IngredientText({ text: "vegetable stock", confidence: 0, startingIndex: 4 }),
    ]);
  });

  it("test_multiple_modified_names", () => {
    const lt = labelledTokens({
      tokens: ["1", "handful", "of", "fresh", "basil", "or", "coriander"],
      posTags: ["CD", "NN", "IN", "JJ", "NN", "CC", "NN"],
      labels: ["QTY", "UNIT", "COMMENT", "NAME_MOD", "B_NAME_TOK", "NAME_SEP", "B_NAME_TOK"],
    });
    const p = new PostProcessor("1 handful of fresh basil or coriander", lt, {});
    const [names] = p.postprocessNames();
    expect(names).toEqual([
      new IngredientText({ text: "fresh basil", confidence: 0, startingIndex: 3 }),
      new IngredientText({ text: "fresh coriander", confidence: 0, startingIndex: 3 }),
    ]);
  });

  it("test_multiple_modified_variant_names", () => {
    const lt = labelledTokens({
      tokens: ["2", "cup", "hot", "beef", "or", "vegetable", "stock"],
      posTags: ["CD", "NN", "JJ", "NN", "CC", "JJ", "NN"],
      labels: ["QTY", "UNIT", "NAME_MOD", "NAME_VAR", "NAME_SEP", "NAME_VAR", "B_NAME_TOK"],
    });
    const p = new PostProcessor("2 cups hot beef or vegetable stock", lt, {});
    const [names] = p.postprocessNames();
    expect(names).toEqual([
      new IngredientText({ text: "hot beef stock", confidence: 0, startingIndex: 2 }),
      new IngredientText({ text: "hot vegetable stock", confidence: 0, startingIndex: 2 }),
    ]);
  });

  it("test_deuplicate_ingredient_names", () => {
    const lt = labelledTokens({
      tokens: ["#1$2", "cup", "sugar", "plus", "1#1$2", "tablespoon", "sugar"],
      posTags: ["CD", "NN", "NN", "CC", "CD", "NN", "NN"],
      labels: ["QTY", "UNIT", "B_NAME_TOK", "COMMENT", "QTY", "UNIT", "B_NAME_TOK"],
    });
    const p = new PostProcessor("1/2 cup sugar plus 1 1/2 tablespoons sugar", lt, {});
    const [names] = p.postprocessNames();
    expect(names).toEqual([
      new IngredientText({ text: "sugar", confidence: 0, startingIndex: 2 }),
    ]);
  });
});
