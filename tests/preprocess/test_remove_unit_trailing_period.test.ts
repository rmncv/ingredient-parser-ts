import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_remove_unit_trailing_period.py
describe("TestPreProcessor_remove_unit_trailing_period", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_tsp", () => {
    expect(p.removeUnitTrailingPeriod("2 tsps. ground cinnamon")).toEqual(
      "2 tsps ground cinnamon",
    );
  });

  it("test_tbsp", () => {
    expect(p.removeUnitTrailingPeriod("1 tbsp. tomato sauce")).toEqual(
      "1 tbsp tomato sauce",
    );
  });

  it("test_lb", () => {
    expect(p.removeUnitTrailingPeriod("3 lbs. minced beef")).toEqual("3 lbs minced beef");
  });

  it("test_oz", () => {
    expect(p.removeUnitTrailingPeriod("1 12oz. can chopped tomatoes")).toEqual(
      "1 12oz can chopped tomatoes",
    );
  });
});
