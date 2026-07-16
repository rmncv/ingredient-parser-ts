import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { loadFdcIngredients } from "../../src/en/foundationfoods/_ff_utils.js";

// Pin the FDC CSV row counts (task brief requirement). The expected values were
// obtained from Python's csv.reader/DictReader over fdc_ingredients.csv.gz:
//   - 11372 physical CSV records including the header -> 11371 data rows
//   - 11362 loaded FDCIngredient entries (9 rows are dropped because their
//     descriptions have no tokens in the embeddings vocabulary)
describe("loadFdcIngredients", () => {
  it("parses the CSV to exactly 11371 data rows (RFC-4180 record count)", () => {
    const url = new URL("../../src/en/data/fdc_ingredients.csv.gz", import.meta.url);
    const text = gunzipSync(readFileSync(url)).toString("utf-8");
    // No field in this CSV contains a newline, so records = non-empty lines.
    // (Verified against Python's csv.reader, which returned 11372 records
    // including the header.)
    const lines = text.split(/\r\n|\n/).filter((l) => l !== "");
    expect(lines.length - 1).toBe(11371);
  });

  it("loads exactly 11362 FDC ingredients (matches Python's DictReader loader)", () => {
    const fdcIngredients = loadFdcIngredients();
    expect(fdcIngredients.length).toBe(11362);
  });

  it("parses quoted fields with embedded commas and doubled quotes", () => {
    const fdcIngredients = loadFdcIngredients();
    const byId = new Map(fdcIngredients.map((f) => [f.fdcId, f]));
    // 168609 is stored as: "Beef, flank, steak, ... trimmed to 0"" fat, choice, raw"
    const beef = byId.get(168609);
    expect(beef).toBeDefined();
    expect(beef!.description).toBe(
      'Beef, flank, steak, separable lean only, trimmed to 0" fat, choice, raw',
    );
    expect(beef!.category).toBe("Beef Products");
    expect(beef!.dataType).toBe("sr_legacy_food");
  });
});
