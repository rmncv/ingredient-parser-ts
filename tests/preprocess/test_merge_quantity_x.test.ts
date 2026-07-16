import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_merge_quantity_x.py
describe("TestPreProcessor_replace_dupe_units_ranges", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_no_x", () => {
    expect(p.mergeQuantityX("100 g grated cheese")).toEqual("100 g grated cheese");
  });

  it("test_single_match", () => {
    expect(p.mergeQuantityX("1 x 390 g jar roasted red peppers")).toEqual(
      "1x 390 g jar roasted red peppers",
    );
  });

  it("test_two_match", () => {
    expect(p.mergeQuantityX("1 x can or 0.5 x large jar tomato paste")).toEqual(
      "1x can or 0.5x large jar tomato paste",
    );
  });
});
