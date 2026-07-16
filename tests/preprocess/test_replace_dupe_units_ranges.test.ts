import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_replace_dupe_units_ranges.py
describe("TestPreProcessor_replace_dupe_units_ranges", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_no_dupes", () => {
    expect(p.replaceDupeUnitsRanges("100 g grated cheese")).toEqual("100 g grated cheese");
  });

  it("test_no_dupe_range_pattern", () => {
    expect(p.replaceDupeUnitsRanges("100 g - 20 oz goat's cheese")).toEqual(
      "100 g - 20 oz goat's cheese",
    );
  });

  it("test_single_match", () => {
    expect(p.replaceDupeUnitsRanges("400-500 g/14 oz - 17 oz rhubarb")).toEqual(
      "400-500 g/14-17 oz rhubarb",
    );
  });

  it("test_two_match", () => {
    expect(p.replaceDupeUnitsRanges("400 g - 500 g/14 oz - 17 oz rhubarb")).toEqual(
      "400-500 g/14-17 oz rhubarb",
    );
  });
});
