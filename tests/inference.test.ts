import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { loadParserModel } from "../src/en/_loaders.js";
import type { FeatureDict } from "../src/inference.js";

interface CorpusEntry {
  sentence: string;
  source?: string;
  options?: Record<string, unknown>;
  tokens?: string[];
  labels?: string[];
  confidences?: number[];
  features?: FeatureDict[];
  raw_labels?: string[];
  raw_confidences?: number[];
  parsed?: unknown;
}

/**
 * Parity of CRF Viterbi inference against the Python `ingredient-parser`.
 *
 * The corpus stores, per default-options entry, the per-token feature dicts
 * Python computed plus `raw_labels`/`raw_confidences` — the direct output of
 * the Python model's `tag_from_features(features)`, bypassing parser
 * postprocessing. That is the exact parity target for `tagFromFeatures`:
 * every entry must match labels exactly and confidences within 1e-9.
 *
 * The corpus also stores the full parser's `labels`/`confidences`, which
 * differ from the raw output wherever `parse_ingredient_en` applied the
 * `guess_ingredient_name` post-processing step (a later task). A meta-check
 * below pins that landscape so entries cannot silently migrate.
 */
describe("CRF Viterbi inference (parity with Python)", () => {
  const corpus: CorpusEntry[] = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./parity/corpus.json.gz", import.meta.url)),
    ).toString(),
  );

  const entries = corpus.filter(
    (e) => e.features && e.raw_labels && e.raw_confidences,
  );

  it("has feature-bearing corpus entries to test", () => {
    expect(entries.length).toBe(791);
  });

  it("matches Python raw tag_from_features on every entry (labels exact, confidences within 1e-9)", () => {
    const tagger = loadParserModel();

    const labelMismatches: string[] = [];
    const confMismatches: string[] = [];
    let maxDelta = 0;

    for (const e of entries) {
      const features = e.features as FeatureDict[];
      const expectedLabels = e.raw_labels as string[];
      const expectedConf = e.raw_confidences as number[];

      const result = tagger.tagFromFeatures(features);
      const gotLabels = result.map((p) => p[0]);
      const gotConf = result.map((p) => p[1]);

      if (JSON.stringify(gotLabels) !== JSON.stringify(expectedLabels)) {
        labelMismatches.push(
          `[${e.sentence.trim()}]\n  got: ${JSON.stringify(gotLabels)}\n  exp: ${JSON.stringify(expectedLabels)}`,
        );
      }

      for (let i = 0; i < expectedConf.length; i++) {
        const delta = Math.abs(gotConf[i] - expectedConf[i]);
        if (delta > maxDelta) maxDelta = delta;
        if (delta > 1e-9) {
          confMismatches.push(
            `[${e.sentence.trim()}] token ${i}: got ${gotConf[i]} exp ${expectedConf[i]} (delta ${delta})`,
          );
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `inference parity: ${entries.length} entries checked; max confidence delta: ${maxDelta}`,
    );

    const labelPreview = labelMismatches.slice(0, 10).join("\n");
    expect(
      labelMismatches.length,
      `${labelMismatches.length} label mismatches vs raw_labels (showing first 10):\n${labelPreview}`,
    ).toBe(0);

    const confPreview = confMismatches.slice(0, 10).join("\n");
    expect(
      confMismatches.length,
      `${confMismatches.length} confidence mismatches >1e-9 vs raw_confidences (max delta ${maxDelta}, showing first 10):\n${confPreview}`,
    ).toBe(0);
  });

  it("documents the guess_ingredient_name landscape: exactly 120 entries have postprocessed labels", () => {
    // `parse_ingredient_en` applies guess_ingredient_name whenever the raw
    // tagger emits no NAME label, rewriting labels/scores for those entries.
    // That step belongs to a later task; pin the split so a change in either
    // the corpus or the model surfaces here rather than passing silently.
    const postprocessed = entries.filter(
      (e) => JSON.stringify(e.raw_labels) !== JSON.stringify(e.labels),
    );
    expect(postprocessed.length).toBe(120);
    // Every such rewrite added a NAME label to a raw output that had none.
    for (const e of postprocessed) {
      expect((e.raw_labels as string[]).some((l) => l.includes("NAME"))).toBe(false);
      expect((e.labels as string[]).some((l) => l.includes("NAME"))).toBe(true);
    }
  });

  it("throws when the model path is not a .json.gz file", async () => {
    const { NumpyCRFInference } = await import("../src/inference.js");
    expect(() => new NumpyCRFInference("/tmp/model.json")).toThrow(
      "Model must be a .json.gz file.",
    );
  });
});
