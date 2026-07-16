import { describe, it, expect } from "vitest";
import { parseIngredient } from "../../src/index.js";
import { guessIngredientName } from "../../src/en/parser.js";

// Port of upstream/tests/parser/test_expect_name_in_output.py

describe("Test_expect_name_in_output", () => {
  describe("model_dependent", () => {
    it("test_enabled", () => {
      // The returned name is not []
      const sentence = "1 cup, plus 2 tablespoons olive oil";
      const parsed = parseIngredient(sentence, { expectNameInOutput: true });
      expect(parsed.name).not.toEqual([]);
    });

    it("test_disabled", () => {
      // The returned name is []
      const sentence = "1 cup, plus 2 tablespoons olive oil";
      const parsed = parseIngredient(sentence, { expectNameInOutput: false });
      expect(parsed.name).toEqual([]);
    });

    it("test_disabled_name_not_separate", () => {
      // The returned name is [] when not separating names
      const sentence = "1 cup, plus 2 tablespoons olive oil";
      const parsed = parseIngredient(sentence, {
        expectNameInOutput: false,
        separateNames: false,
      });
      expect(parsed.name).toEqual([]);
    });

    it("test_enabled_but_no_name", () => {
      // The returned name is [] even though the fallback is enabled.
      const sentence = "2 tablespoons";
      const parsed = parseIngredient(sentence, { expectNameInOutput: true });
      expect(parsed.name).toEqual([]);
    });
  });
});

/** Mock tagger providing `marginal(label, idx)` from a lookup table. */
function mockTagger(marginals: Record<number, Record<string, number>>): {
  marginal(label: string, position: number): number;
} {
  return {
    marginal(label: string, idx: number): number {
      return marginals[idx]?.[label] ?? 0.0;
    },
  };
}

describe("Test_guess_ingredient_name", () => {
  it("test_simple", () => {
    // The first COMMENT label becomes B_NAME_TOK, the second I_NAME_TOK.
    const labels = ["QTY", "UNIT", "COMMENT", "COMMENT"];
    const scores = [1.0, 1.0, 0.6, 0.5];

    const tagger = mockTagger({
      2: { B_NAME_TOK: 0.3, I_NAME_TOK: 0.0, NAME_SEP: 0.0, NAME_VAR: 0.05, NAME_MOD: 0.07 },
      3: { B_NAME_TOK: 0.02, I_NAME_TOK: 0.35, NAME_SEP: 0.0, NAME_VAR: 0.15, NAME_MOD: 0.02 },
    });

    const [newLabels, newScores] = guessIngredientName(tagger, labels, scores);
    expect(newLabels).toEqual(["QTY", "UNIT", "B_NAME_TOK", "I_NAME_TOK"]);
    expect(newScores).toEqual([1.0, 1.0, 0.3, 0.35]);
  });

  it("test_below_threshold", () => {
    // The second COMMENT stays because its best NAME score is below threshold.
    const labels = ["QTY", "UNIT", "COMMENT", "COMMENT"];
    const scores = [1.0, 1.0, 0.6, 0.5];

    const tagger = mockTagger({
      2: { B_NAME_TOK: 0.3, I_NAME_TOK: 0.0, NAME_SEP: 0.0, NAME_VAR: 0.05, NAME_MOD: 0.07 },
      3: { B_NAME_TOK: 0.02, I_NAME_TOK: 0.15, NAME_SEP: 0.0, NAME_VAR: 0.15, NAME_MOD: 0.02 },
    });

    const [newLabels, newScores] = guessIngredientName(tagger, labels, scores);
    expect(newLabels).toEqual(["QTY", "UNIT", "B_NAME_TOK", "COMMENT"]);
    expect(newScores).toEqual([1.0, 1.0, 0.3, 0.5]);
  });

  it("test_multiple_options", () => {
    // The PREP labels become NAME labels because they form a longer consecutive
    // sequence than the two COMMENT labels.
    const labels = ["QTY", "UNIT", "COMMENT", "COMMENT", "PUNC", "PREP", "PREP", "PREP"];
    const scores = [1.0, 1.0, 0.6, 0.5, 1.0, 0.4, 0.45, 0.28];

    const tagger = mockTagger({
      2: { B_NAME_TOK: 0.3, I_NAME_TOK: 0.0, NAME_SEP: 0.0, NAME_VAR: 0.05, NAME_MOD: 0.07 },
      3: { B_NAME_TOK: 0.02, I_NAME_TOK: 0.27, NAME_SEP: 0.0, NAME_VAR: 0.15, NAME_MOD: 0.02 },
      5: { B_NAME_TOK: 0.3, I_NAME_TOK: 0.0, NAME_SEP: 0.0, NAME_VAR: 0.05, NAME_MOD: 0.07 },
      6: { B_NAME_TOK: 0.02, I_NAME_TOK: 0.52, NAME_SEP: 0.0, NAME_VAR: 0.15, NAME_MOD: 0.02 },
      7: { B_NAME_TOK: 0.22, I_NAME_TOK: 0.3, NAME_SEP: 0.0, NAME_VAR: 0.05, NAME_MOD: 0.07 },
    });

    const [newLabels, newScores] = guessIngredientName(tagger, labels, scores);
    expect(newLabels).toEqual([
      "QTY",
      "UNIT",
      "COMMENT",
      "COMMENT",
      "PUNC",
      "B_NAME_TOK",
      "I_NAME_TOK",
      "I_NAME_TOK",
    ]);
    expect(newScores).toEqual([1.0, 1.0, 0.6, 0.5, 1.0, 0.3, 0.52, 0.3]);
  });
});
