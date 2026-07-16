import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { PerceptronTagger } from "../../src/nlp/perceptron_tagger.js";
import { loadTaggerData, loadIngredientTagdict } from "../../src/en/_loaders.js";

interface FixtureEntry {
  tokens: string[];
  tags: string[];
}

describe("averaged perceptron POS tagger", () => {
  const fixture: FixtureEntry[] = JSON.parse(
    gunzipSync(
      readFileSync(new URL("../fixtures/pos_fixture.json.gz", import.meta.url)),
    ).toString(),
  );

  it("matches nltk (with ingredient tagdict overlay) on the full fixture", () => {
    const tagger = new PerceptronTagger(loadTaggerData());
    const ingredientTagdict = loadIngredientTagdict();

    const mismatches: string[] = [];
    for (const { tokens, tags } of fixture) {
      const got = tagger.tag(tokens, ingredientTagdict).map((pair) => pair[1]);
      if (JSON.stringify(got) !== JSON.stringify(tags)) {
        mismatches.push(`${JSON.stringify(tokens)}: ${JSON.stringify(got)} != ${JSON.stringify(tags)}`);
      }
    }
    const preview = mismatches.slice(0, 20).join("\n");
    expect(
      mismatches.length,
      `${mismatches.length} mismatches (showing first 20):\n${preview}`,
    ).toBe(0);
  });

  it("handles astral-plane digits like Python str indexing (Adlam digit one)", () => {
    // Verified against nltk via tools/.venv: pos_tag(["\u{1E951}", "apples"])
    // == [("\u{1E951}", "CD"), ("apples", "NNS")]. Python's word[0].isdigit()
    // sees the whole code point; naive JS word[0] would read a lone surrogate.
    const tagger = new PerceptronTagger(loadTaggerData());
    const got = tagger.tag(["\u{1E951}", "apples"], loadIngredientTagdict());
    expect(got.map((pair) => pair[1])).toEqual(["CD", "NNS"]);
  });
});
