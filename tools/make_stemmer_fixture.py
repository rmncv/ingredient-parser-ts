#!/usr/bin/env python3
"""Generate the Snowball (Porter2) English stemmer fixture used by the
TypeScript test suite to check the ported stemmer against NLTK's reference
implementation.

Dev-time only. Requires the packages in tools/requirements.txt installed into
tools/.venv (see tools/README.md). Never a runtime dependency of the shipped
TypeScript package.

Usage
-----
    tools/.venv/bin/python tools/make_stemmer_fixture.py

Word set collected (per task brief, Step 3):
    (a) every `stem:`-prefixed attribute in the trained CRF model, prefix
        stripped;
    (b) every whitespace-split, alphabetic, lower-cased word extracted from
        every quoted string literal in upstream/tests/**/*.py;
    (c) the 10,000 most frequent tokens in the GloVe embeddings vocabulary
        (frequency order == file order, header line excluded).

Output
------
tests/fixtures/stemmer_fixture.json.gz
    {"<word>": "<nltk EnglishStemmer().stem(word)>", ...}
"""

import gzip
import json
import re
from pathlib import Path

from nltk.stem.snowball import EnglishStemmer

REPO_ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = REPO_ROOT / "upstream" / "tests"
MODEL_PATH = REPO_ROOT / "src" / "en" / "data" / "model.en.json.gz"
GLOVE_PATH = REPO_ROOT / "src" / "en" / "data" / "ingredient_embeddings.35d.glove.txt.gz"
OUTPUT_PATH = REPO_ROOT / "tests" / "fixtures" / "stemmer_fixture.json.gz"

QUOTED_STRING_RE = re.compile(r"""(['"])((?:\\.|(?!\1).)*)\1""", re.DOTALL)
WORD_RE = re.compile(r"[a-zA-Z]+")

GLOVE_TOP_N = 10_000


def words_from_model_attributes() -> set[str]:
    with gzip.open(MODEL_PATH, "rt") as f:
        model = json.load(f)
    words = set()
    for attr in model["attributes"]:
        if attr.startswith("stem:"):
            words.add(attr.split(":", 1)[1])
    return words


def words_from_test_string_literals() -> set[str]:
    words: set[str] = set()
    for fp in sorted(TESTS_DIR.glob("**/*.py")):
        src = fp.read_text(encoding="utf-8")
        for m in QUOTED_STRING_RE.finditer(src):
            body = m.group(2)
            for tok in body.split():
                for w in WORD_RE.findall(tok):
                    words.add(w.lower())
    return words


def words_from_glove_vocab(top_n: int) -> set[str]:
    words: list[str] = []
    with gzip.open(GLOVE_PATH, "rt") as f:
        first_line = f.readline()
        header_parts = first_line.split()
        # word2vec-style header is "<vocab_size> <dim>"; if the first line
        # isn't that, it's actually a data row and must not be discarded.
        is_header = len(header_parts) == 2 and all(
            p.lstrip("-").isdigit() for p in header_parts
        )
        if not is_header:
            words.append(first_line.split()[0])

        for line in f:
            if len(words) >= top_n:
                break
            parts = line.split()
            if not parts:
                continue
            words.append(parts[0])

    return set(words[:top_n])


def main() -> None:
    from_model = words_from_model_attributes()
    from_tests = words_from_test_string_literals()
    from_glove = words_from_glove_vocab(GLOVE_TOP_N)

    all_words = from_model | from_tests | from_glove
    print(f"words from model stem: attributes: {len(from_model)}")
    print(f"words from test string literals:   {len(from_tests)}")
    print(f"words from GloVe vocab (top {GLOVE_TOP_N}): {len(from_glove)}")
    print(f"total distinct candidate words:     {len(all_words)}")

    stemmer = EnglishStemmer()
    fixture = {word: stemmer.stem(word) for word in sorted(all_words)}

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(fixture, sort_keys=True, separators=(",", ":")).encode("utf-8")
    with gzip.GzipFile(
        filename="", mode="wb", fileobj=open(OUTPUT_PATH, "wb"), mtime=0
    ) as gz:
        gz.write(body)

    print(f"Wrote {OUTPUT_PATH} ({len(body)} bytes uncompressed, {OUTPUT_PATH.stat().st_size} bytes gz)")
    print(f"fixture entries: {len(fixture)}")


if __name__ == "__main__":
    main()
