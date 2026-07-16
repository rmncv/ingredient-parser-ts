/**
 * Lazy, cached loaders for the English-language data assets, mirroring
 * `upstream/ingredient_parser/en/_loaders.py`'s `lru_cache`-wrapped loader
 * functions. Only the loaders needed so far (tagger weights/tagdict/classes
 * and the ingredient-specific POS tagdict overlay) are implemented here;
 * remaining loaders (parser model, embeddings) belong to later tasks.
 */

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { TaggerData } from "../nlp/perceptron_tagger.js";
import { NumpyCRFInference } from "../inference.js";
import { GloVeModel } from "./_embeddings.js";

function readGzipJson(relativePath: string): unknown {
  const buf = readFileSync(new URL(relativePath, import.meta.url));
  return JSON.parse(gunzipSync(buf).toString("utf-8"));
}

let taggerData: TaggerData | undefined;

/**
 * Load the averaged-perceptron POS tagger data (weights, tagdict, classes).
 * Cached after the first call.
 */
export function loadTaggerData(): TaggerData {
  if (taggerData === undefined) {
    taggerData = readGzipJson("data/averaged_perceptron_tagger_eng.json.gz") as TaggerData;
  }
  return taggerData;
}

let ingredientTagdict: Map<string, string> | undefined;

/**
 * Load the ingredient-specific token part-of-speech tagdict. Entries in this
 * dict bypass the part of speech tagging model so the token is always given
 * the tag in this dict. Cached after the first call.
 */
export function loadIngredientTagdict(): Map<string, string> {
  if (ingredientTagdict === undefined) {
    const obj = readGzipJson("data/ingredient_tagdict.json.gz") as Record<string, string>;
    ingredientTagdict = new Map(Object.entries(obj));
  }
  return ingredientTagdict;
}

let parserModel: NumpyCRFInference | undefined;

/**
 * Load the CRF parser model (`model.en.json.gz`) into a NumpyCRFInference.
 * Cached after the first call, mirroring the `lru_cache`-wrapped
 * `load_parser_model` in `upstream/ingredient_parser/en/_loaders.py`.
 */
export function loadParserModel(): NumpyCRFInference {
  if (parserModel === undefined) {
    const modelUrl = new URL("data/model.en.json.gz", import.meta.url);
    parserModel = new NumpyCRFInference(modelUrl);
  }
  return parserModel;
}

let embeddingsModel: GloVeModel | undefined;

/**
 * Load the GloVe embeddings model (`ingredient_embeddings.35d.glove.txt.gz`)
 * into `Float32Array` vectors. Cached after the first call (lazy singleton),
 * mirroring the `lru_cache`-wrapped `load_embeddings_model` in
 * `upstream/ingredient_parser/en/_loaders.py`. Parsing the ~3 MB gzip is the
 * slow part, so this must only happen once per process.
 */
export function loadEmbeddingsModel(): GloVeModel {
  if (embeddingsModel === undefined) {
    const relPath = "data/ingredient_embeddings.35d.glove.txt.gz";
    const url = new URL(relPath, import.meta.url);
    embeddingsModel = new GloVeModel(url, relPath);
  }
  return embeddingsModel;
}
