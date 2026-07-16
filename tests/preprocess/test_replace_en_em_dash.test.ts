import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_replace_en_em_dash.py
describe("TestPreProcessor_replace_en_em_dash", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor(".", {});
  });

  it("test_en_dash", () => {
    expect(p.replaceEnEmDash("2 cups flour – white or self-raising")).toEqual(
      "2 cups flour - white or self-raising",
    );
  });

  it("test_em_dash", () => {
    expect(p.replaceEnEmDash("2 cups flour — white or self-raising")).toEqual(
      "2 cups flour  -  white or self-raising",
    );
  });
});
