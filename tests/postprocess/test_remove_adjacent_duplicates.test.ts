import { describe, it, expect } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_remove_adjacent_duplicates.py

function makeP(): PostProcessor {
  const tokens = ["2", "14", "ounce", "can", "coconut", "milk"];
  const posTags = ["CD", "CD", "NN", "MD", "VB", "NN"];
  const labels = ["QTY", "QTY", "UNIT", "UNIT", "B_NAME_TOK", "I_NAME_TOK"];
  const scores = [
    0.9991370577083561, 0.9725378063405858, 0.9978510889596651,
    0.9922350007952175, 0.9886087821704076, 0.9969237827902526,
  ];
  return new PostProcessor(
    "2 14 ounce cans coconut milk",
    labelledTokens({ tokens, posTags, labels, scores }),
    {},
  );
}

describe("TestPostProcessor_remove_adjacent_duplicates", () => {
  it("test_adjacent_duplicate", () => {
    const p = makeP();
    expect(p.removeAdjacentDuplicates(["finely", "finely", "chopped"])).toEqual([1, 2]);
  });

  it("test_non_adjacent_duplicate", () => {
    const p = makeP();
    expect(p.removeAdjacentDuplicates(["finely", "chopped", "finely"])).toEqual([0, 1, 2]);
  });
});
