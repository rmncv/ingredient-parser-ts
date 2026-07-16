#!/usr/bin/env node
// Copies runtime data assets into `dist/` after `tsc` builds it.
//
// Runtime code resolves these assets relative to its own compiled location
// via `new URL("...", import.meta.url)` (see `src/en/_loaders.ts` and
// `src/nlp/html_unescape.ts`). `tsc` only emits `.js`/`.d.ts` — it never
// copies non-TS files — so without this step the published package would
// throw ENOENT the first time a consumer imports it, because
// `dist/en/data/` and `dist/nlp/_html5_entities.json` would not exist.
//
// Zero new dependencies: plain `node:fs` recursive copy.

import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const copies = [
  {
    from: join(repoRoot, "src", "en", "data"),
    to: join(repoRoot, "dist", "en", "data"),
  },
  {
    from: join(repoRoot, "src", "nlp", "_html5_entities.json"),
    to: join(repoRoot, "dist", "nlp", "_html5_entities.json"),
  },
];

for (const { from, to } of copies) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`Copied ${from} -> ${to}`);
}
