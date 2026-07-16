import { describe, it, expect } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_singlarise_units.py

describe("TestPreProcessor_singlarise_units", () => {
  it('test_embedded: the unit "cups" is replaced with "cup"', () => {
    const p = new PreProcessor("2.5 cups beer", {});
    expect(p.tokenizedSentence.map((t) => t.text)).toEqual(["2.5", "cup", "beer"]);
    expect(p.singularisedIndices).toEqual([1]);
  });

  it('test_capitalised: the unit "Boxes" is replaced with "Box", with the capitalisation maintained', () => {
    const p = new PreProcessor("2.5 Boxes Candy", {});
    expect(p.tokenizedSentence.map((t) => t.text)).toEqual(["2.5", "Box", "Candy"]);
    expect(p.singularisedIndices).toEqual([1]);
  });

  it('test_start: the unit "leaves" is replaced with "leaf"', () => {
    const p = new PreProcessor("leaves of basil", {});
    expect(p.tokenizedSentence.map((t) => t.text)).toEqual(["leaf", "of", "basil"]);
    expect(p.singularisedIndices).toEqual([0]);
  });

  it('test_start_capitalised: the unit "wedges" is replaced with "wedge", with the capitalisation maintained', () => {
    const p = new PreProcessor("Wedges of lemon", {});
    expect(p.tokenizedSentence.map((t) => t.text)).toEqual(["Wedge", "of", "lemon"]);
    expect(p.singularisedIndices).toEqual([0]);
  });

  it('test_multiple_units: the units "tablespoons" and "teaspoons" are replaced with "tablespoon" and "teaspoon" respectively', () => {
    const p = new PreProcessor("2 tablespoons plus 2 teaspoons", {});
    expect(p.tokenizedSentence.map((t) => t.text)).toEqual([
      "2",
      "tablespoon",
      "plus",
      "2",
      "teaspoon",
    ]);
    expect(p.singularisedIndices).toEqual([1, 4]);
  });
});
