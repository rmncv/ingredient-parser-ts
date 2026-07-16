import { describe, it, expect } from "vitest";
import { IngredientToken } from "../../src/en/foundationfoods/_ff_dataclasses.js";
import { stripAmbiguousLeadingAdjectives } from "../../src/en/foundationfoods/_ff_utils.js";

// Port of upstream/tests/foundationfoods/test_strip_ambiguous_leading_adjectives.py

describe("stripAmbiguousLeadingAdjectives", () => {
  it("strips 'hot' from the start of tokens", () => {
    const tokens = ["hot", "chicken", "stock"];
    const posTags = ["JJ", "NN", "NN"];
    const ingTokens = tokens.map((t, i) => new IngredientToken(t, posTags[i]!));
    expect(stripAmbiguousLeadingAdjectives(ingTokens)).toEqual(ingTokens.slice(1));
  });

  it("does not remove an ambiguous adjective that is not first", () => {
    const tokens = ["red", "hot", "chilli"];
    const posTags = ["JJ", "JJ", "NN"];
    const ingTokens = tokens.map((t, i) => new IngredientToken(t, posTags[i]!));
    expect(stripAmbiguousLeadingAdjectives(ingTokens)).toEqual(ingTokens);
  });

  it("returns input tokens when all are ambiguous adjectives", () => {
    const tokens = ["hot", "hot", "hot"];
    const posTags = ["JJ", "JJ", "JJ"];
    const ingTokens = tokens.map((t, i) => new IngredientToken(t, posTags[i]!));
    expect(stripAmbiguousLeadingAdjectives(ingTokens)).toEqual(ingTokens);
  });
});
