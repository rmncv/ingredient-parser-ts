#!/usr/bin/env python3
"""Export NLTK's averaged perceptron POS tagger ("eng") weights to a compact,
committed JSON asset so the TypeScript port can re-implement POS tagging
without depending on NLTK at runtime.

Dev-time only. Never import this module, or NLTK, from the shipped package.

Usage
-----
    tools/.venv/bin/python tools/export_nltk_tagger.py

Output
------
src/en/data/averaged_perceptron_tagger_eng.json.gz

    {
      "weights": {feature: {tag: number}},
      "tagdict": {token: tag},
      "classes": [tag, ...]
    }
"""

import gzip
import hashlib
import json
from pathlib import Path

import nltk
from nltk.tag import _get_tagger

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "src" / "en" / "data" / "averaged_perceptron_tagger_eng.json.gz"


def main() -> None:
    nltk.download("averaged_perceptron_tagger_eng", quiet=True)
    tagger = _get_tagger("eng")

    payload = {
        "weights": tagger.model.weights,
        "tagdict": tagger.tagdict,
        "classes": sorted(tagger.classes),
    }

    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    digest = hashlib.sha256(body).hexdigest()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with gzip.GzipFile(
        filename="", mode="wb", fileobj=open(OUTPUT_PATH, "wb"), mtime=0
    ) as gz:
        gz.write(body)

    print(f"Wrote {OUTPUT_PATH} ({len(body)} bytes uncompressed)")
    print(f"weights features: {len(payload['weights'])}")
    print(f"tagdict entries:  {len(payload['tagdict'])}")
    print(f"classes:          {len(payload['classes'])}")
    print(f"sha256 (uncompressed json): {digest}")


if __name__ == "__main__":
    main()
