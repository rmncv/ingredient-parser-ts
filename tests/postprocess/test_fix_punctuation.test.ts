import { describe, it, expect, beforeEach } from "vitest";
import { PostProcessor } from "../../src/en/postprocess.js";
import { labelledTokens } from "./helpers.js";

// Port of upstream/tests/postprocess/test_fix_punctuation.py

function makeP(): PostProcessor {
  const sentence = "2 14 ounce cans coconut milk";
  const tokens = ["2", "14", "ounce", "can", "coconut", "milk"];
  const posTags = ["CD", "CD", "NN", "MD", "VB", "NN"];
  const labels = ["QTY", "QTY", "UNIT", "UNIT", "B_NAME_TOK", "I_NAME_TOK"];
  const scores = [
    0.9991370577083561, 0.9725378063405858, 0.9978510889596651,
    0.9922350007952175, 0.9886087821704076, 0.9969237827902526,
  ];
  return new PostProcessor(sentence, labelledTokens({ tokens, posTags, labels, scores }), {});
}

describe("TestPostProcessor_fix_punctuation", () => {
  let p: PostProcessor;
  beforeEach(() => {
    p = makeP();
  });

  it("test_space_following_open_parens", () => {
    expect(p.fixPunctuation("finely chopped ( diced)")).toBe("finely chopped (diced)");
  });

  it("test_space_leading_close_parens", () => {
    expect(p.fixPunctuation("finely chopped (diced )")).toBe("finely chopped (diced)");
  });

  it("test_multiple_space_before_comma", () => {
    expect(p.fixPunctuation("finely chopped , diced")).toBe("finely chopped, diced");
  });

  it("test_multiple_space_before_semicolon", () => {
    expect(p.fixPunctuation("finely chopped ; diced")).toBe("finely chopped; diced");
  });

  it("test_space_before_full_stop", () => {
    expect(p.fixPunctuation("finely chopped .")).toBe("finely chopped.");
  });

  it("test_space_before_question_mark", () => {
    expect(p.fixPunctuation("finely chopped !")).toBe("finely chopped!");
  });

  it("test_space_before_asterisk", () => {
    expect(p.fixPunctuation("chopped *")).toBe("chopped*");
  });
});
