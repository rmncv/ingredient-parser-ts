import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_is_singular.py

describe("TestPostProcessor_is_singular", () => {
  it("test_is_singular", () => {
    const lt = labelledTokens({
      tokens: ["4", "salmon", "fillets", "2", "pounds", "each"],
      posTags: ["CD", "JJ", "NNS", "CD", "NNS", "DT"],
      labels: ["QTY", "B_NAME_TOK", "I_NAME_TOK", "QTY", "UNIT", "COMMENT"],
    });
    const p = new PostProcessor("4 salmon fillets 2 pounds each", lt, {});
    expect(p.isSingular(4, lt)).toBe(true);
    expect(p.consumed).toEqual([5]);
  });

  it("test_is_singular_in_brackets", () => {
    const lt = labelledTokens({
      tokens: ["4", "salmon", "fillets", "2", "pounds", "(", "900", "g", ")", "each"],
      posTags: ["CD", "JJ", "NNS", "CD", "NNS", "(", "CD", "NN", ")", "DT"],
      labels: [
        "QTY", "B_NAME_TOK", "I_NAME_TOK", "QTY", "UNIT", "COMMENT", "QTY",
        "UNIT", "COMMENT", "COMMENT",
      ],
    });
    const p = new PostProcessor("4 salmon fillets 2 pounds (900 g) each", lt, {});
    expect(p.isSingular(7, lt)).toBe(true);
    expect(p.consumed).toEqual([9]);
  });

  it("test_not_singular", () => {
    const lt = labelledTokens({
      tokens: ["4", "salmon", "fillets", "2", "pounds", "minimum"],
      posTags: ["CD", "JJ", "NNS", "CD", "NNS", "JJ"],
      labels: ["QTY", "B_NAME_TOK", "I_NAME_TOK", "QTY", "UNIT", "COMMENT"],
    });
    const p = new PostProcessor("4 salmon fillets 2 pounds minimum", lt, {});
    expect(p.isSingular(4, lt)).toBe(false);
    expect(p.consumed).toEqual([]);
  });
});
