import { describe, it, expect } from "vitest";
import { IngredientToken } from "../../src/en/foundationfoods/_ff_dataclasses.js";
import { normaliseSpelling } from "../../src/en/foundationfoods/_ff_utils.js";

// Port of upstream/tests/foundationfoods/test_normalise_spelling.py

describe("normaliseSpelling", () => {
  it("normalises the phrase 'double cream' to 'heavy cream'", () => {
    const tokens = ["doubl", "cream"];
    const posTags = ["", ""];
    const ingTokens = tokens.map((t, i) => new IngredientToken(t, posTags[i]!));
    const normalised = normaliseSpelling(ingTokens);
    expect(tokens.length).toBe(normalised.length);
    expect(normalised.map((t) => t.token)).toEqual(["heavi", "cream"]);
  });

  it("normalises token 'chilli' to 'chili'", () => {
    const tokens = ["red", "hot", "chilli"];
    const posTags = ["", "", ""];
    const ingTokens = tokens.map((t, i) => new IngredientToken(t, posTags[i]!));
    const normalised = normaliseSpelling(ingTokens);
    expect(tokens.length).toBe(normalised.length);
    expect(normalised.map((t) => t.token)).toEqual(["red", "hot", "chili"]);
  });

  it("normalises token 'chile' to 'chili'", () => {
    const tokens = ["red", "hot", "chile"];
    const posTags = ["", "", ""];
    const ingTokens = tokens.map((t, i) => new IngredientToken(t, posTags[i]!));
    const normalised = normaliseSpelling(ingTokens);
    expect(tokens.length).toBe(normalised.length);
    expect(normalised.map((t) => t.token)).toEqual(["red", "hot", "chili"]);
  });

  it("normalises token 'rocket' to 'arugula'", () => {
    const tokens = ["rocket"];
    const posTags = [""];
    const ingTokens = tokens.map((t, i) => new IngredientToken(t, posTags[i]!));
    const normalised = normaliseSpelling(ingTokens);
    expect(tokens.length).toBe(normalised.length);
    expect(normalised.map((t) => t.token)).toEqual(["arugula"]);
  });
});
