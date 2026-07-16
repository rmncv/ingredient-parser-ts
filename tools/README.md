# tools/

Dev-time-only Python scripts. **Never a runtime dependency** of the
published TypeScript package (`ingredient-parser-ts`) -- nothing under
`src/` imports Python, and none of these scripts run as part of `npm
install`, `npm run build`, or the published npm package. They exist purely
to regenerate committed fixtures/assets from the upstream Python
`ingredient-parser` library (vendored, read-only, at `upstream/`, pinned to
v2.7.0) so the TypeScript port and its tests can be checked for exact
behavioural parity without needing Python at test time.

This is also the only part of the whole project allowed to touch the
network (to `pip install` the upstream package and to `nltk.download(...)`
its POS tagger resource). Everything else -- the TypeScript source, its
tests, and CI -- runs fully offline against the committed fixtures.

## Setup

```bash
cd tools
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -c "import nltk; nltk.download('averaged_perceptron_tagger_eng')"
```

Verify the install:

```bash
.venv/bin/python -c "import ingredient_parser; print(ingredient_parser.__version__)"
# -> 2.7.0
```

`tools/.venv/` is gitignored and must never be committed.

## Scripts

Run all three from the repo root using the venv's interpreter. Regenerate
in this order if the pinned upstream version or the vendored test suite
changes.

### `export_nltk_tagger.py`

Exports NLTK's `averaged_perceptron_tagger_eng` model (weights, tag
dictionary, class list) to a plain, gzipped JSON asset so the TypeScript
port can re-implement the same POS tagging without an NLTK dependency at
runtime.

```bash
tools/.venv/bin/python tools/export_nltk_tagger.py
```

Writes `src/en/data/averaged_perceptron_tagger_eng.json.gz` (shipped with
the package) and prints the sha256 of the uncompressed JSON for
reproducibility checks.

### `make_stemmer_fixture.py`

Builds a `{word: nltk_stem}` fixture from NLTK's `EnglishStemmer`
(Snowball/Porter2), covering: every `stem:`-prefixed feature in the trained
CRF model, every word found in the vendored upstream test suite, and the
10,000 most frequent tokens in the GloVe embeddings vocabulary.

```bash
tools/.venv/bin/python tools/make_stemmer_fixture.py
```

Writes `tests/fixtures/stemmer_fixture.json.gz`.

### `generate_parity_corpus.py`

AST-walks `upstream/tests/**/*.py` (plus the installed package's README
example, read from the wheel's metadata) to extract candidate ingredient
sentences, then runs the real upstream `parse_ingredient` /
`inspect_parser` for every sentence across a matrix of option sets
(defaults, `separate_names=False`, `string_units=True`,
`foundation_foods=True`, each `volumetric_units_system` value), recording
tokens, labels, per-token confidences, per-token features (default-options
entry only, since features depend only on the sentence, not on
postprocessing options), and the full `ParsedIngredient` result.

Every corpus entry carries a `"source"` field recording the sentence's
provenance:

- `"call_arg"` -- the first positional string argument of a
  `parse_ingredient` / `parse_ingredient_en` / `PreProcessor` /
  `inspect_parser` call in the upstream test suite (a sentence found both
  as a call argument and as a plain literal counts as `call_arg`). These
  are genuine, curated ingredient sentences. 44 candidate sentences, 43 in
  the final corpus (see below).
- `"string_literal"` -- collected by the deliberately over-broad fallback
  over every string literal in the test files containing a space and a
  letter. Many of these are docstrings or assertion text rather than
  ingredient sentences; they are still valid parity inputs (the fixture
  records whatever the upstream library really does with them), but not
  representative recipe text. 747 sentences.
- `"readme"` -- from the package README example. 1 sentence.

That is 792 distinct sentences total; 1 (the empty string `""`, a
`call_arg`) crashes `inspect_parser` upstream and is skipped, giving 791
sentences x 8 option-sets = 6,328 corpus entries (344 `call_arg`, 5,976
`string_literal`, 8 `readme`).

```bash
tools/.venv/bin/python tools/generate_parity_corpus.py
```

Writes `tests/parity/corpus.json.gz` and `tests/fixtures/pos_fixture.json.gz`
(unique tokenised sentences tagged with the ingredient-tagdict-aware POS
tagger). Sentences that crash `inspect_parser`, or `(sentence, option-set)`
combinations that crash `parse_ingredient`, are skipped and counted rather
than aborting the run.

## Serialization notes

All three scripts write gzip with `mtime=0` and JSON with sorted keys and
`separators=(",", ":")`, so regenerating from an unchanged upstream/venv
produces byte-identical output (deterministic diffs) for
`export_nltk_tagger.py` and `make_stemmer_fixture.py`, and for the vast
majority of `generate_parity_corpus.py`'s output.

`generate_parity_corpus.py` sets single-threaded-BLAS environment variables
before importing numpy, to make the foundation-foods embedding similarity
search (a numpy dot product) reproducible. This reliably works with
OpenBLAS (e.g. on Linux). On macOS, numpy typically links against Apple's
Accelerate framework instead, which does not consistently honour these
variables; as a result, regenerating the corpus on macOS can occasionally
(observed: ~0.1% of entries, all with `foundation_foods=True`) produce a
ULP-level difference in the 6th decimal place of a `foundation_foods` match
`confidence` value (e.g. `0.704792` vs. `0.704793`) due to BLAS summation
order. This never changes which FDC entry matches, nor any token, label,
name, amount, or unit in the output -- only the last digit of that one
confidence field. If exact byte-for-byte reproduction matters, regenerate
on Linux/OpenBLAS, or tolerate a small float epsilon when diffing.

In `corpus.json.gz`, values from the upstream dataclasses that aren't
natively JSON-serialisable are converted as follows:

- `pint.Unit` -> `str(unit)`, e.g. `"pound"`, `"imperial_pint"`.
- `fractions.Fraction` -> `{"__fraction__": [numerator, denominator]}`,
  which round-trips exactly with this project's `Frac` port
  (`src/py/frac.ts`) via `new Frac(numerator, denominator)`.
- `enum.Enum` members (e.g. `UnitSystem`) -> their `.value` string.
- Any other type that shows up unexpectedly is stringified with a
  `WARNING` printed to stdout, rather than aborting the run.

## Regenerating

Only regenerate when the pinned upstream version changes (bump
`tools/requirements.txt` and `upstream/`) or the vendored test suite is
updated. Regenerating produces large diffs in the gzipped fixtures (they're
binary), so keep it to its own commit.
