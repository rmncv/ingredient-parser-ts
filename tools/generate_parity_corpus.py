#!/usr/bin/env python3
"""Generate the parity corpus and POS fixture used by the TypeScript test
suite to check behavioural parity with the upstream Python
`ingredient-parser` (v2.7.0) library.

Dev-time only. Requires the packages in tools/requirements.txt installed into
tools/.venv (see tools/README.md). Never a runtime dependency of the shipped
TypeScript package.

Usage
-----
    tools/.venv/bin/python tools/generate_parity_corpus.py

Outputs
-------
tests/parity/corpus.json.gz
    [{"sentence": str,
      "source": "call_arg" | "string_literal" | "readme",
      "options": {...}, "tokens": [...], "labels": [...],
      "confidences": [...], "features": [...] (default-options entry only),
      "raw_labels": [...], "raw_confidences": [...]
          (default-options entry only: the direct output of the CRF model's
          tag_from_features(features), bypassing parser postprocessing such
          as guess_ingredient_name),
      "parsed": <ParsedIngredient as plain JSON>}, ...]

    "source" records the provenance of the sentence: "call_arg" means it
    was the first positional string argument of a parse_ingredient /
    parse_ingredient_en / PreProcessor / inspect_parser call in the
    upstream test suite (a sentence found both ways counts as call_arg);
    "readme" means it came from the package README example; and
    "string_literal" means it came from the over-collecting fallback over
    every string literal in the test files (these include docstrings and
    other non-ingredient text -- still valid parity inputs, but not
    representative ingredient sentences).

tests/fixtures/pos_fixture.json.gz
    [{"tokens": [...], "tags": [...]}, ...] for every distinct token sequence
    seen while building the corpus.
"""

import ast
import dataclasses
import enum
import gzip
import json
import os
import re
from fractions import Fraction
from pathlib import Path

# Force single-threaded BLAS *before* numpy is imported (directly, or
# transitively via `ingredient_parser`). The foundation-foods embedding
# similarity search uses numpy dot products; with multi-threaded BLAS the
# summation order (and therefore the last decimal place of some confidence
# scores) is nondeterministic across runs, which breaks byte-identical
# fixture regeneration. Single-threaded BLAS makes generation fully
# reproducible at a small, one-off cost in runtime.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import pint
from ingredient_parser import inspect_parser, parse_ingredient
from ingredient_parser.en._loaders import load_parser_model
from ingredient_parser.en._utils import pos_tag

REPO_ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = REPO_ROOT / "upstream" / "tests"
CORPUS_PATH = REPO_ROOT / "tests" / "parity" / "corpus.json.gz"
POS_FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "pos_fixture.json.gz"

TARGET_CALL_NAMES = {
    "parse_ingredient",
    "parse_ingredient_en",
    "PreProcessor",
    "inspect_parser",
}

DEFAULT_OPTIONS = {
    "separate_names": True,
    "discard_isolated_stop_words": True,
    "expect_name_in_output": True,
    "string_units": False,
    "volumetric_units_system": "us_customary",
    "foundation_foods": False,
}

# (name, overrides-from-default) pairs, per the task brief: defaults;
# separate_names=False; string_units=True; foundation_foods=True; each
# volumetric_units_system value ("us_customary" is already covered by
# defaults, so it is not repeated).
OPTION_SETS = [
    ("default", {}),
    ("separate_names_false", {"separate_names": False}),
    ("string_units_true", {"string_units": True}),
    ("foundation_foods_true", {"foundation_foods": True}),
    ("volumetric_imperial", {"volumetric_units_system": "imperial"}),
    ("volumetric_metric", {"volumetric_units_system": "metric"}),
    ("volumetric_australian", {"volumetric_units_system": "australian"}),
    ("volumetric_japanese", {"volumetric_units_system": "japanese"}),
]


def _funcname(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def extract_sentences() -> tuple[set[str], set[str]]:
    """Extract candidate ingredient sentences from the upstream test suite.

    Returns
    -------
    tuple[set[str], set[str]]
        (sentences passed as the first positional arg to a target call,
         every other string literal in the test files containing a space
         and at least one letter).
    """
    call_sentences: set[str] = set()
    all_strings: set[str] = set()

    files = sorted(TESTS_DIR.glob("**/*.py"))
    for fp in files:
        src = fp.read_text(encoding="utf-8")
        try:
            tree = ast.parse(src, filename=str(fp))
        except SyntaxError as exc:
            print(f"WARNING: could not parse {fp}: {exc}")
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = _funcname(node.func)
                if fn in TARGET_CALL_NAMES and node.args:
                    arg0 = node.args[0]
                    if isinstance(arg0, ast.Constant) and isinstance(arg0.value, str):
                        call_sentences.add(arg0.value)
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                s = node.value
                if " " in s and re.search("[a-zA-Z]", s):
                    all_strings.add(s)

    return call_sentences, all_strings


def extract_readme_examples() -> set[str]:
    """Extract example sentences from the package README.

    The vendored upstream/README.md is a read-only pointer stub (not the
    actual project README), so we pull the real README text bundled in the
    installed wheel's metadata instead -- no network access required, this
    was already fetched when `pip install` ran in Step 1.
    """
    dist_info_dirs = list(
        (REPO_ROOT / "tools" / ".venv").glob("lib/*/site-packages/ingredient_parser_nlp-*.dist-info")
    )
    sentences: set[str] = set()
    for d in dist_info_dirs:
        metadata = d / "METADATA"
        if not metadata.exists():
            continue
        text = metadata.read_text(encoding="utf-8")
        for line in text.splitlines():
            m = re.match(r"\s*>>>\s*parse_ingredient\((.*)\)\s*$", line)
            if m:
                try:
                    value = ast.literal_eval(m.group(1))
                except (ValueError, SyntaxError):
                    continue
                if isinstance(value, str):
                    sentences.add(value)
    return sentences


def to_jsonable(obj):
    """Recursively convert dataclasses / pint / Fraction / enum values from
    the upstream library into plain JSON-serialisable Python values.

    - `pint.Unit` -> `str(unit)`
    - `Fraction`  -> {"__fraction__": [numerator, denominator]} (exact,
      round-trips losslessly with the TS `Frac` port)
    - `enum.Enum` -> `.value`
    - dataclasses -> plain dict of their fields, recursively converted
    - anything else unexpected -> `str(obj)` (and a warning is printed)
    """
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, Fraction):
        return {"__fraction__": [obj.numerator, obj.denominator]}
    if isinstance(obj, pint.Unit):
        return str(obj)
    if isinstance(obj, enum.Enum):
        return obj.value
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {
            f.name: to_jsonable(getattr(obj, f.name)) for f in dataclasses.fields(obj)
        }
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    print(f"WARNING: stringifying non-serialisable type {type(obj)!r}: {obj!r}")
    return str(obj)


def write_gz_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    with gzip.GzipFile(filename="", mode="wb", fileobj=open(path, "wb"), mtime=0) as gz:
        gz.write(body)
    print(f"Wrote {path} ({len(body)} bytes uncompressed, {path.stat().st_size} bytes gz)")


def main() -> None:
    call_sentences, all_strings = extract_sentences()
    readme_sentences = extract_readme_examples()

    all_candidates = call_sentences | all_strings | readme_sentences

    # Provenance for each sentence. Priority: a sentence found as a direct
    # call argument counts as "call_arg" even if it also appears elsewhere;
    # then "readme"; everything else is a fallback "string_literal".
    source_by_sentence: dict[str, str] = {}
    for s in all_candidates:
        if s in call_sentences:
            source_by_sentence[s] = "call_arg"
        elif s in readme_sentences:
            source_by_sentence[s] = "readme"
        else:
            source_by_sentence[s] = "string_literal"

    print(f"call-site sentences:     {len(call_sentences)}")
    print(f"all string literals:     {len(all_strings)}")
    print(f"README example sentences:{len(readme_sentences)}")
    print(f"total distinct candidates: {len(all_candidates)}")
    for src in ("call_arg", "string_literal", "readme"):
        n = sum(1 for v in source_by_sentence.values() if v == src)
        print(f"  source={src}: {n}")

    corpus = []
    pos_sequences: dict[tuple[str, ...], list[str]] = {}

    n_inspect_failed = 0
    n_parse_failed = 0
    n_entries = 0

    for sentence in sorted(all_candidates):
        try:
            debug = inspect_parser(sentence)
        except Exception as exc:  # noqa: BLE001 - deliberately broad, dev tool
            n_inspect_failed += 1
            continue

        tokens = [t.text for t in debug.PreProcessor.tokenized_sentence]
        features = debug.PreProcessor.sentence_features()
        labelled_tokens = debug.PostProcessor.tokens
        labels = [t.label for t in labelled_tokens]
        confidences = [t.score for t in labelled_tokens]

        # Raw CRF model output for these features, bypassing parser
        # postprocessing (guess_ingredient_name can rewrite labels/scores
        # when the raw tagger emits no NAME label). This is the exact parity
        # target for the TypeScript CRF inference port.
        raw_tagged = load_parser_model().tag_from_features(features)
        raw_labels = [label for label, _ in raw_tagged]
        raw_confidences = [float(score) for _, score in raw_tagged]

        token_key = tuple(tokens)
        if token_key not in pos_sequences and tokens:
            tags = [tag for _, tag in pos_tag(tokens)]
            pos_sequences[token_key] = tags

        for option_name, overrides in OPTION_SETS:
            resolved_options = {**DEFAULT_OPTIONS, **overrides}
            try:
                parsed = parse_ingredient(sentence, **resolved_options)
            except Exception as exc:  # noqa: BLE001 - deliberately broad, dev tool
                n_parse_failed += 1
                continue

            entry = {
                "sentence": sentence,
                "source": source_by_sentence[sentence],
                "options": resolved_options,
                "tokens": tokens,
                "labels": labels,
                "confidences": confidences,
                "parsed": to_jsonable(parsed),
            }
            if option_name == "default":
                entry["features"] = to_jsonable(features)
                entry["raw_labels"] = raw_labels
                entry["raw_confidences"] = raw_confidences

            corpus.append(entry)
            n_entries += 1

    pos_fixture = [
        {"tokens": list(tokens), "tags": tags}
        for tokens, tags in sorted(pos_sequences.items())
    ]

    write_gz_json(CORPUS_PATH, corpus)
    write_gz_json(POS_FIXTURE_PATH, pos_fixture)

    print(f"distinct sentences attempted:   {len(all_candidates)}")
    print(f"sentences failed inspect_parser: {n_inspect_failed}")
    print(f"(sentence, option-set) failed parse_ingredient: {n_parse_failed}")
    print(f"corpus entries written:          {n_entries}")
    print(f"distinct token sequences (pos_fixture): {len(pos_fixture)}")


if __name__ == "__main__":
    main()
