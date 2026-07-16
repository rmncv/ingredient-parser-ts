import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import type { LabelledToken } from "../../src/dataclasses.js";

// Port of upstream/tests/foundationfoods/test_foundation_foods_ordering.py

function buildPostProcessor(): PostProcessor {
  // This sentence has the name split by a token with a non-name label.
  const sentence = "2 cups olive or sunflower oil";
  const tokens = ["2", "cup", "olive", "or", "sunflower", "oil"];
  const posTags = ["CD", "NNS", "NN", "CC", "NN", "NN"];
  const labels = ["QTY", "UNIT", "NAME_VAR", "NAME_SEP", "NAME_VAR", "B_NAME_TOK"];
  const scores = [
    0.9999916198218641, 0.9999194173062287, 0.9455381513097211, 0.9996235422364157,
    0.9649807293441203, 0.9668959628659927,
  ];
  const labelledTokens: LabelledToken[] = tokens.map((text, i) => ({
    index: i,
    text,
    posTag: posTags[i]!,
    label: labels[i]!,
    score: scores[i]!,
    plural: false,
  }));

  return new PostProcessor(sentence, labelledTokens, {}, {
    discardIsolatedStopWords: false,
    foundationFoods: true,
  });
}

describe("PostProcessor foundation foods ordering", () => {
  it("maps foundation foods to the correct name index", () => {
    const p = buildPostProcessor();
    const parsed = p.parsed();
    expect(parsed.name[0]!.text).toBe("olive oil");
    expect(parsed.foundationFoods[0]!.fdcId).toBe(2710186);
    expect(parsed.foundationFoods[0]!.nameIndex).toBe(0);

    expect(parsed.name[1]!.text).toBe("sunflower oil");
    expect(parsed.foundationFoods[1]!.fdcId).toBe(2710192);
    expect(parsed.foundationFoods[1]!.nameIndex).toBe(1);
  });
});
