import { describe, it, expect } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_split_quantity_and_units.py

/**
 * Mirror of the upstream pytest fixture: an empty PreProcessor object to use
 * for testing the PreProcessor class methods.
 */
function p(): PreProcessor {
  return new PreProcessor(".", {});
}

describe("TestPreProcessor_split_quantity_and_units", () => {
  it("test_basic: a space is inserted between the integer quantity and the unit", () => {
    const inputSentence = "100g plain flour";
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual("100 g plain flour");
  });

  it("test_decimal: a space is inserted between the decimal quantity and the unit", () => {
    const inputSentence = "2.5cups orange juice";
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual("2.5 cups orange juice");
  });

  it("test_inch: no space is inserted between the quantity and the inches symbol", () => {
    const inputSentence = '2.5" square chocolate';
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual('2.5" square chocolate');
  });

  it("test_hyphen_seperator: the hyphen between the quantity and unit is replaced by a space", () => {
    const inputSentence = "2-pound whole chicken";
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual("2 pound whole chicken");
  });

  it("test_unit_then_number: a space is inserted between adjacent number and letters", () => {
    const inputSentence = "2lb1oz cherry tomatoes";
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual("2 lb 1 oz cherry tomatoes");
  });

  it("test_unit_hyphen_number: a space is inserted between the letter and hyphen, and hyphen and number", () => {
    const inputSentence = "2lb-1oz cherry tomatoes";
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual("2 lb - 1 oz cherry tomatoes");
  });

  it("test_non_unit_c: no space is inserted between 4 and chop, and the hyphen is retained", () => {
    const inputSentence = "1 4-chop rack of lamb";
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual("1 4-chop rack of lamb");
  });

  it("test_non_unit_g: no space is inserted between 5 and grain, and the hyphen is retained", () => {
    const inputSentence = "2 slices 5-grain bread";
    expect(p().splitQuantityAndUnits(inputSentence)).toEqual("2 slices 5-grain bread");
  });
});
