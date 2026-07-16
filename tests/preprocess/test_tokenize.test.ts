import { describe, it, expect } from "vitest";
import { tokenize } from "../../src/en/_utils.js";

// Port of upstream/tests/preprocess/test_tokenize.py

describe("TestTokenize", () => {
  it("test_simple_sentence: simple sentence is tokenised correctly", () => {
    const sentence = "1 tbsp mint sauce";
    expect(tokenize(sentence)).toEqual(["1", "tbsp", "mint", "sauce"]);
  });

  it("test_parens: parentheses are correctly isolated as tokens", () => {
    const sentence = "14 ounce (400 g) can chickpeas";
    expect(tokenize(sentence)).toEqual([
      "14",
      "ounce",
      "(",
      "400",
      "g",
      ")",
      "can",
      "chickpeas",
    ]);
  });

  it("test_square_brackets: square brackets are correctly isolated as tokens", () => {
    const sentence = "14 ounce [400 g] can chickpeas";
    expect(tokenize(sentence)).toEqual([
      "14",
      "ounce",
      "[",
      "400",
      "g",
      "]",
      "can",
      "chickpeas",
    ]);
  });

  it("test_curly_braces: curly braces are correctly isolated as tokens", () => {
    const sentence = "14 ounce {400 g} can chickpeas";
    expect(tokenize(sentence)).toEqual([
      "14",
      "ounce",
      "{",
      "400",
      "g",
      "}",
      "can",
      "chickpeas",
    ]);
  });

  it("test_comma_quote: quote and comma are correctly isolated as tokens", () => {
    const sentence = '1" piece ginger, finely grated';
    expect(tokenize(sentence)).toEqual([
      '1"',
      "piece",
      "ginger",
      ",",
      "finely",
      "grated",
    ]);
  });

  it("test_colon_semicolon: colon and semicolon are correctly isolated as tokens", () => {
    const sentence = "Egg wash: 2 egg yolks; whisked";
    expect(tokenize(sentence)).toEqual([
      "Egg",
      "wash",
      ":",
      "2",
      "egg",
      "yolks",
      ";",
      "whisked",
    ]);
  });

  it("test_degree_symbol: degree symbol is correctly kept within tokens", () => {
    const sentence = "0.25 cup warm water (105°F)";
    expect(tokenize(sentence)).toEqual([
      "0.25",
      "cup",
      "warm",
      "water",
      "(",
      "105°F",
      ")",
    ]);
  });

  it("test_full_stop: full stop at end of sentence is separated from prior word", () => {
    const sentence = "Freshly grated Parmesan cheese, for garnish.";
    expect(tokenize(sentence)).toEqual([
      "Freshly",
      "grated",
      "Parmesan",
      "cheese",
      ",",
      "for",
      "garnish",
      ".",
    ]);
  });

  it("test_full_stop_acronym: full stop at end of acronym is not separated", () => {
    const sentence = "Sprigs of herbs (e.g., rosemary, thyme, or oregano)";
    expect(tokenize(sentence)).toEqual([
      "Sprigs",
      "of",
      "herbs",
      "(",
      "e.g.",
      ",",
      "rosemary",
      ",",
      "thyme",
      ",",
      "or",
      "oregano",
      ")",
    ]);
  });

  it("test_asteriks: asterisk at end of word is separated", () => {
    const sentence = "2 onions, finely chopped*";
    expect(tokenize(sentence)).toEqual(["2", "onions", ",", "finely", "chopped", "*"]);
  });

  it("test_fake_fraction: fake fraction is not separated", () => {
    const sentence = "#1$2 cups milk";
    expect(tokenize(sentence)).toEqual(["#1$2", "cups", "milk"]);
  });

  it('test_and_or_with_space: "and / or" is output as a single token', () => {
    const sentence = "2 cups beef and / or chicken stock";
    expect(tokenize(sentence)).toEqual(["2", "cups", "beef", "and/or", "chicken", "stock"]);
  });

  it('test_and_or_without_space: "and/or" is output as a single token', () => {
    const sentence = "2 cups beef and/or chicken stock";
    expect(tokenize(sentence)).toEqual(["2", "cups", "beef", "and/or", "chicken", "stock"]);
  });
});
