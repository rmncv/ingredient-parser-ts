import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { stem } from "../../src/nlp/stemmer.js";

describe("snowball english stemmer", () => {
  const fixture: Record<string, string> = JSON.parse(
    gunzipSync(
      readFileSync(new URL("../fixtures/stemmer_fixture.json.gz", import.meta.url)),
    ).toString(),
  );

  it("matches nltk on the full fixture vocabulary", () => {
    const mismatches: string[] = [];
    for (const [word, expected] of Object.entries(fixture)) {
      const got = stem(word);
      if (got !== expected) mismatches.push(`${word}: ${got} != ${expected}`);
    }
    const preview = mismatches.slice(0, 20).join("\n");
    expect(
      mismatches.length,
      `${mismatches.length} mismatches (showing first 20):\n${preview}`,
    ).toBe(0);
  });
});
