# ingredient-parser-ts

A dependency-free TypeScript port of
[`ingredient-parser`](https://github.com/strangetom/ingredient-parser) — a
Python library that parses free-text recipe ingredient sentences (e.g.
`"3 pounds pork shoulder, cut into 2-inch chunks"`) into structured data
(quantity, unit, ingredient name, size, preparation, comment, and optional
USDA FoundationFoods matches).

This is a from-scratch reimplementation of the original library's
behavior (CRF tagger inference, pre/post-processing, unit registry,
FoundationFoods matching) in TypeScript, with no runtime dependency on
Python, NLTK, pint, or any npm package. See [Parity](#parity) below for how
behavioral equivalence with the original is verified.

## Installation

```bash
npm install ingredient-parser-ts
```

Requires Node.js >= 20. Ships as ESM only (`"type": "module"`).

## Usage

```ts
import { parseIngredient } from "ingredient-parser-ts";

const result = parseIngredient("3 pounds pork shoulder, cut into 2-inch chunks");
console.log(JSON.stringify(result, null, 2));
```

```json
{
  "name": [
    {
      "text": "pork shoulder",
      "confidence": 0.997203,
      "startingIndex": 2
    }
  ],
  "size": null,
  "amount": [
    {
      "quantity": "3",
      "quantityMax": "3",
      "unit": {
        "name": "pound",
        "dimension": "mass",
        "siFactor": 0.45359237
      },
      "text": "3 pounds",
      "confidence": 0.999973,
      "startingIndex": 0,
      "unitSystem": "us_customary",
      "APPROXIMATE": false,
      "SINGULAR": false,
      "RANGE": false,
      "MULTIPLIER": false,
      "PREPARED_INGREDIENT": false
    }
  ],
  "preparation": {
    "text": "cut into 2 inch chunks",
    "confidence": 0.999881,
    "startingIndex": 5
  },
  "comment": null,
  "purpose": null,
  "foundationFoods": [],
  "sentence": "3 pounds pork shoulder, cut into 2-inch chunks"
}
```

Quantities are exact fractions (a `Frac` class mirroring Python's
`fractions.Fraction`, with bigint numerator/denominator); they serialize
to their string form (`"3"`, `"1/2"`) in `JSON.stringify`, and expose
`.toNumber()` for a float value.

Enable USDA FoundationFoods matching (embeds a bundled FDC ingredient
list + GloVe-style word embeddings, no network access):

```ts
import { parseIngredient } from "ingredient-parser-ts";

const result = parseIngredient("1 cup flour", { foundationFoods: true });
// result.foundationFoods -> [{ text: "Flour, 00", fdcId: 2003586, ... }]
```

Parse many sentences, or inspect intermediate pipeline state:

```ts
import { parseMultipleIngredients, inspectParser } from "ingredient-parser-ts";

parseMultipleIngredients(["2 tbsp olive oil", "1 onion, diced"]);

const debug = inspectParser("2 tbsp olive oil");
// debug.PreProcessor / debug.PostProcessor expose tokens, features, labels
```

## CLI

Installing the package provides an `ingredient-parser` command that prints the
structured result as JSON. Pass a single sentence to parse one ingredient, or
several to parse them all:

```bash
# after `npm install -g ingredient-parser-ts` (or via `npx ingredient-parser-ts`)
ingredient-parser "3 pounds pork shoulder, cut into 2-inch chunks"   # single → object
ingredient-parser "a pinch of salt" "2 large eggs, beaten"            # multiple → array
```

A single argument is parsed with `parseIngredient` (prints one object); two or
more are parsed with `parseMultipleIngredients` (prints a JSON array). Use
`--help` for usage.

## API

| Export | Signature | Description |
| --- | --- | --- |
| `parseIngredient` | `(sentence: string, options?: ParseIngredientOptions) => ParsedIngredient` | Parse a single ingredient sentence. |
| `parseMultipleIngredients` | `(sentences: Iterable<string>, options?: ParseIngredientOptions) => ParsedIngredient[]` | Parse several sentences with the same options. |
| `inspectParser` | `(sentence: string, options?: ParseIngredientOptions) => ParserDebugInfo` | Parse and also return the intermediate `PreProcessor`/`PostProcessor` state, for debugging. |
| `PreProcessor` | class | Sentence normalisation, tokenisation, and feature extraction, used internally by the parser; exposed for advanced use. |
| `PostProcessor` | class | Converts labelled tokens into the structured `ParsedIngredient` result. |
| `showModelCard` | `(lang?: string) => string` | Returns the model card markdown for the given language's CRF model. |
| `SUPPORTED_LANGUAGES` | `string[]` | Currently `["en"]`. |
| `ParsedIngredient`, `IngredientAmount`, `CompositeIngredientAmount`, `IngredientText`, `FoundationFood`, `UnitSystem` | classes/enum | Result dataclasses. |
| `ParserDebugInfo`, `LabelledToken`, `FeatureDict` | types | Debug/inspection types. |

### `ParseIngredientOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `lang` | `string` | `"en"` | Only `"en"` is currently supported. |
| `separateNames` | `boolean` | `false` | Return each distinct ingredient name found as a separate `IngredientText` instead of merging them. |
| `discardIsolatedStopWords` | `boolean` | `true` | Drop stray stop words (e.g. "of", "the") that aren't part of a name/comment. |
| `expectNameInOutput` | `boolean` | `true` | If no name is labelled, fall back to guessing one from the highest-confidence tokens. |
| `stringUnits` | `boolean` | `false` | Return `unit` as a plain string instead of a resolved `Unit` object. |
| `imperialUnits` | `boolean` | `false` | **Deprecated** — use `volumetricUnitsSystem: "imperial"`. |
| `volumetricUnitsSystem` | `"us_customary" \| "imperial" \| "metric" \| "australian" \| "japanese"` | `"us_customary"` | Which regional variant to resolve ambiguous volumetric units (cup, pint, tablespoon, ...) against. |
| `foundationFoods` | `boolean` | `false` | Also match the ingredient name(s) against the bundled USDA FoundationFoods dataset. |
| `customUnits` | `Record<string, string> \| null` | `null` | Map of custom singular->plural unit overrides. |

## Parity

This port is checked for exact behavioral parity against the original
Python library, pinned to
[v2.7.0](https://github.com/strangetom/ingredient-parser) (commit
`ffd6ae3c6efb9925c40fc9b4454d77b40469ef91`):

- **Test-count audit**: the upstream test suite has 392 `def test_` functions
  (`grep -rc "def test_" upstream/tests --include="*.py"`); the TypeScript
  port has 54 test files / **7,638 tests**, a superset that includes a 1:1
  port of every upstream test file (each `upstream/tests/**/test_*.py` has
  a `tests/**/test_*.test.ts` counterpart with identical cases) plus a
  corpus-level parity suite (see below).
- **Corpus parity**: 6,328 `(sentence, option-set)` entries — 791 distinct
  sentences (curated call-site arguments, string literals, and the README
  example from the upstream test suite) x 8 option-sets — generated by
  running the real upstream library and recorded as fixtures. The full
  corpus is replayed against this port's implementation in
  `tests/parity/*.test.ts`, asserting equality of tokens, features,
  raw CRF label/confidence output, and final `ParsedIngredient` results
  (floats compared with a `1e-9` tolerance; six foundation-foods confidence
  values require a relaxed `5e-6` tolerance due to platform BLAS drift —
  see `tests/parity/parsed.test.ts`).

Regenerating these fixtures (running the pinned upstream Python package to
re-export tagger weights, stemmer/POS fixtures, and the parity corpus) is
documented in [`tools/README.md`](tools/README.md). `tools/` is a dev-time-only
Python toolchain; it is never a runtime dependency and is not published.

## Zero runtime dependencies

`"dependencies": {}` — everything (CRF inference, POS tagging, stemming,
pint-equivalent unit registry/conversion, HTML entity decoding, BM25/USIF
fuzzy matching for FoundationFoods) is implemented from scratch in
TypeScript, with the corresponding data assets (tagger weights, CRF model,
word embeddings, FDC ingredient list) shipped as gzipped JSON/CSV under
`dist/en/data/`.

## Attribution

- Behavior and CRF model semantics reverse-engineered/ported from
  [`strangetom/ingredient-parser`](https://github.com/strangetom/ingredient-parser)
  (MIT License, Copyright (c) 2021 Tom Strange).
- The `averaged_perceptron_tagger_eng` POS tagger data is derived from
  NLTK (Apache License 2.0).

Full license texts and per-asset attribution are in [`LICENSE`](LICENSE)
and [`NOTICE`](NOTICE).

## License

MIT — see [`LICENSE`](LICENSE).
