import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { PreProcessor } from "../../src/en/preprocess.js";
import type { FeatureDict } from "../../src/inference.js";

interface CorpusEntry {
  sentence: string;
  tokens: string[];
  features?: FeatureDict[];
}

function loadCorpus(): CorpusEntry[] {
  const buf = readFileSync(new URL("corpus.json.gz", import.meta.url));
  return JSON.parse(gunzipSync(buf).toString("utf-8")) as CorpusEntry[];
}

describe("PreProcessor feature parity with Python corpus", () => {
  const corpus = loadCorpus().filter((e) => e.features !== undefined);

  it("has feature-bearing corpus entries to check", () => {
    // Pin the exact count so the guard can't silently shrink.
    expect(corpus.length).toBe(791);
  });

  it.each(corpus.map((e, i) => [i, e] as const))(
    "entry %i matches recorded features and tokens",
    (_i, entry) => {
      const p = new PreProcessor(entry.sentence);
      expect(p.tokenizedSentence.map((t) => t.text)).toEqual(entry.tokens);
      expect(p.sentenceFeatures()).toEqual(entry.features);
    },
  );
});
