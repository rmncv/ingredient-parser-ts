/**
 * Port of `upstream/ingredient_parser/en/foundationfoods/_ff_utils.py`.
 *
 * Includes the FDC ingredient CSV loader (a minimal RFC-4180 reader mirroring
 * `csv.DictReader` over `fdc_ingredients.csv.gz`), token preparation/spelling
 * normalisation, and FDC description tokenisation.
 */

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { consume } from "../../_common.js";
import { loadEmbeddingsModel } from "../_loaders.js";
import { posTag, stemToken, tokenize } from "../_utils.js";
import {
  AMBIGUOUS_ADJECTIVES,
  NEGATION_TOKENS,
  REDUCED_RELEVANCE_TOKENS,
} from "./_ff_constants.js";
import { FDCIngredient, IngredientToken } from "./_ff_dataclasses.js";

/** Result of tokenising an FDC description. Port of `TokenizedFDCDescription`. */
export interface TokenizedFDCDescription {
  tokens: string[];
  posTags: string[];
  embeddingTokens: string[];
  embeddingPosTags: string[];
  embeddingWeights: number[];
}

// Python's `string.punctuation`.
const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/**
 * Phrase substitutions to normalise spelling of ingredient name tokens to the
 * spellings used in the FDC ingredient descriptions. All tokens are stemmed and
 * lower case.
 */
const FDC_PHRASE_SUBSTITUTIONS: Map<string, string[]> = new Map([
  [JSON.stringify(["coriand", "seed"]), ["coriand", "seed"]],
  [JSON.stringify(["doubl", "cream"]), ["heavi", "cream"]],
  [JSON.stringify(["garlic", "granul"]), ["garlic", "powder"]],
  [JSON.stringify(["onion", "granul"]), ["onion", "powder"]],
  [JSON.stringify(["glac", "cherri"]), ["maraschino", "cherri"]],
  [JSON.stringify(["ice", "sugar"]), ["powder", "sugar"]],
  [JSON.stringify(["mang", "tout"]), ["snow", "pea"]],
  [JSON.stringify(["plain", "flour"]), ["all", "purpos", "flour"]],
  [JSON.stringify(["singl", "cream"]), ["light", "cream"]],
  [JSON.stringify(["haa", "avocado"]), ["hass", "avocado"]],
  [JSON.stringify(["broad", "bean"]), ["fava", "bean"]],
  [JSON.stringify(["self", "rais"]), ["self", "rise"]],
  [JSON.stringify(["appl", "sauc"]), ["applesauc"]],
]);

const FDC_TOKEN_SUBSTITUTIONS: Map<string, string> = new Map([
  ["aubergin", "eggplant"],
  ["beetroot", "beet"],
  ["capsicum", "bell"],
  ["chile", "chili"],
  ["chilli", "chili"],
  ["coriand", "cilantro"],
  ["cornflour", "cornstarch"],
  ["courgett", "zucchini"],
  ["filo", "phyllo"],
  ["gherkin", "pickl"],
  ["mangetout", "snowpea"],
  ["mint", "spearmint"],
  ["prawn", "shrimp"],
  ["puré", "pure"],
  ["rocket", "arugula"],
  ["swede", "rutabaga"],
  ["yoghurt", "yogurt"],
  ["demerara", "turbinado"],
  ["gruyèr", "gruyer"],
]);

const FDC_TOKEN_TO_PHRASE_SUBSTITUTIONS: Map<string, string[]> = new Map([
  ["lemongrass", ["lemon", "grass"]],
  ["low-sodium", ["low", "sodium"]],
  ["long-grain", ["long", "grain"]],
  ["medium-grain", ["medium", "grain"]],
  ["short-grain", ["short", "grain"]],
  ["bone-in", ["bone", "in"]],
  ["water", ["tap", "water"]],
  ["beansprout", ["bean", "sprout"]],
  ["breadcrumb", ["bread", "crumb"]],
]);

// Types of pasta that should be normalised to "pasta, dry" (stemmed).
const PASTA_TYPES = [
  "bucatini", "conchigli", "ditalini", "farfall", "fettuccin", "fusilli",
  "gemelli", "lasagn", "lasagna", "linguin", "macaroni", "orecchiett", "orzo",
  "paccheri", "pappardell", "penn", "rigatoni", "rotini", "stellin",
  "tagliatell",
];
for (const type of PASTA_TYPES) {
  FDC_TOKEN_TO_PHRASE_SUBSTITUTIONS.set(type, ["pasta", "dri"]);
}

/**
 * Normalise spelling in `tokens` to standard spellings used in FDC ingredient
 * descriptions. Port of `normalise_spelling`.
 */
export function normaliseSpelling(tokens: IngredientToken[]): IngredientToken[] {
  const normalisedTokens: IngredientToken[] = [];
  const itokens = tokens[Symbol.iterator]();
  let i = 0;
  for (let next = itokens.next(); !next.done; next = itokens.next(), i++) {
    const ingToken = next.value;
    const token = ingToken.token.toLowerCase();
    const nextToken = i < tokens.length - 1 ? tokens[i + 1]!.token.toLowerCase() : "";

    const phraseKey = JSON.stringify([token, nextToken]);
    const phraseSub = FDC_PHRASE_SUBSTITUTIONS.get(phraseKey);
    const tokenToPhrase = FDC_TOKEN_TO_PHRASE_SUBSTITUTIONS.get(token);
    const tokenSub = FDC_TOKEN_SUBSTITUTIONS.get(token);

    if (phraseSub !== undefined) {
      for (const t of phraseSub) {
        normalisedTokens.push(new IngredientToken(t, ingToken.posTag));
      }
      // Jump forward to avoid processing next_token again.
      consume(itokens, 1);
      i++;
    } else if (tokenToPhrase !== undefined) {
      for (const t of tokenToPhrase) {
        normalisedTokens.push(new IngredientToken(t, ingToken.posTag));
      }
    } else if (tokenSub !== undefined) {
      normalisedTokens.push(new IngredientToken(tokenSub, ingToken.posTag));
    } else {
      normalisedTokens.push(ingToken);
    }
  }

  return normalisedTokens;
}

// Python `str.isnumeric()`/`isdigit()`/`isdecimal()`: `isdecimal ⊆ isdigit ⊆
// isnumeric`, so the three-way OR in `prepare_tokens` reduces to `isnumeric`.
const NUMERIC_RE = /^[\p{N}]+$/u;
const SPACE_RE = /^\s+$/;

function isPyNumeric(s: string): boolean {
  return s.length > 0 && NUMERIC_RE.test(s);
}

// Cache for prepare_tokens (Python `@lru_cache(maxsize=512)`; a pure function,
// so eviction never changes results).
const prepareTokensCache = new Map<string, IngredientToken[]>();

/**
 * Prepare tokens for use with the embeddings model: split on hyphens, discard
 * numeric/punctuation/short/whitespace tokens, stem, then normalise spelling.
 * Port of `prepare_tokens`.
 */
export function prepareTokens(tokens: IngredientToken[]): IngredientToken[] {
  const cacheKey = JSON.stringify(tokens.map((t) => [t.token, t.posTag]));
  const cached = prepareTokensCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Split tokens on hyphens.
  const splitTokens: IngredientToken[] = [];
  for (const ingToken of tokens) {
    if (ingToken.token.includes("-")) {
      const parts = ingToken.token.split("-").filter((t) => t);
      for (const p of parts) {
        splitTokens.push(new IngredientToken(p, ingToken.posTag));
      }
    } else {
      splitTokens.push(ingToken);
    }
  }

  const stemmedTokens: IngredientToken[] = [];
  for (const ingToken of splitTokens) {
    const tok = ingToken.token;
    if (
      !isPyNumeric(tok) &&
      !SPACE_RE.test(tok) &&
      !PUNCTUATION.includes(tok) &&
      tok.length > 1
    ) {
      stemmedTokens.push(new IngredientToken(stemToken(tok.toLowerCase()), ingToken.posTag));
    }
  }

  const result = normaliseSpelling(stemmedTokens);
  if (prepareTokensCache.size >= 8192) {
    const firstKey = prepareTokensCache.keys().next().value;
    if (firstKey !== undefined) {
      prepareTokensCache.delete(firstKey);
    }
  }
  prepareTokensCache.set(cacheKey, result);
  return result;
}

/** Parse a single RFC-4180 CSV line into fields (no embedded newlines). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i]!;
    if (c === '"') {
      i++;
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
    } else if (c === ",") {
      fields.push(field);
      field = "";
      i++;
    } else {
      field += c;
      i++;
    }
  }
  fields.push(field);
  return fields;
}

let fdcIngredientsCache: FDCIngredient[] | undefined;

/**
 * Load FDC ingredients from `fdc_ingredients.csv.gz`. Cached (Python
 * `@lru_cache`). Port of `load_fdc_ingredients`.
 */
export function loadFdcIngredients(): FDCIngredient[] {
  if (fdcIngredientsCache !== undefined) {
    return fdcIngredientsCache;
  }

  const url = new URL("../data/fdc_ingredients.csv.gz", import.meta.url);
  const text = gunzipSync(readFileSync(url)).toString("utf-8");
  // The CSV uses CRLF line endings; Python's text-mode reader normalises these,
  // so split on CRLF/LF and drop trailing empty lines from the final newline.
  const lines = text.split(/\r\n|\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const header = parseCsvLine(lines[0]!);
  const foundationFoods: FDCIngredient[] = [];
  for (let li = 1; li < lines.length; li++) {
    const values = parseCsvLine(lines[li]!);
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]!] = values[c] ?? "";
    }

    const tokenized = tokenizeFdcDescription(row["description"]!);
    if (tokenized.embeddingTokens.length === 0) {
      continue;
    }
    foundationFoods.push(
      new FDCIngredient({
        fdcId: parseInt(row["fdc_id"]!, 10),
        dataType: row["data_type"]!,
        description: row["description"]!,
        category: row["category"]!,
        tokens: tokenized.tokens,
        posTags: tokenized.posTags,
        embeddingTokens: tokenized.embeddingTokens,
        // Upstream stores `pos_tags` here (not `embedding_pos_tags`).
        embeddingPosTags: tokenized.posTags,
        embeddingWeights: tokenized.embeddingWeights,
      }),
    );
  }

  fdcIngredientsCache = foundationFoods;
  return foundationFoods;
}

/** Group consecutive items by key (itertools.groupby). */
function* groupby<T, K>(items: T[], key: (x: T) => K): Generator<[K, T[]]> {
  let i = 0;
  while (i < items.length) {
    const k = key(items[i]!);
    const group: T[] = [items[i]!];
    i++;
    while (i < items.length && key(items[i]!) === k) {
      group.push(items[i]!);
      i++;
    }
    yield [k, group];
  }
}

/**
 * Tokenize an FDC ingredient description, returning tokens and per-token
 * weights. Port of `tokenize_fdc_description`.
 */
export function tokenizeFdcDescription(description: string): TokenizedFDCDescription {
  const embeddings = loadEmbeddingsModel();
  const tokens = tokenize(description.toLowerCase());
  const tagged = posTag(tokens);
  const posTags = tagged.map((t) => t[1]);

  const prepared = prepareTokens(
    tokens.map((tok, i) => new IngredientToken(tok, posTags[i]!)),
  );

  const embeddingWeights: number[] = [];
  const preparedEmbeddingTokens: string[] = [];
  const preparedEmbeddingPosTags: string[] = [];
  let phraseCount = 0;

  const zipped: [string, string][] = tokens.map((tok, i) => [tok, posTags[i]!]);
  for (const [isPhrase, phrase] of groupby(zipped, (x) => x[0] !== ",")) {
    if (!isPhrase) {
      // Comma group: set weight to 0 if the token is in vocab (dead in practice
      // because "," is not in the embeddings vocabulary).
      for (const [token] of phrase) {
        if (embeddings.has(token)) {
          embeddingWeights.push(0.0);
        }
      }
      continue;
    }

    const preparedPhrase = prepareTokens(
      phrase.map(([t, tag]) => new IngredientToken(t, tag)),
    );
    const phraseTags = preparedPhrase.filter((tok) => embeddings.has(tok.token)).map((tok) => tok.posTag);
    const phraseTokens = preparedPhrase.filter((tok) => embeddings.has(tok.token)).map((tok) => tok.token);
    const phraseWeights: number[] = new Array(phraseTokens.length).fill(1.0 - phraseCount * 1e-3);

    // Check for negated tokens and set weight to 0.
    for (const neg of NEGATION_TOKENS) {
      const negIdx = phraseTokens.indexOf(neg);
      if (negIdx !== -1) {
        for (let k = negIdx; k < phraseTokens.length; k++) {
          phraseWeights[k] = 0;
        }
      }
    }

    // Check for reduced relevance tokens and reduce their weight.
    for (const rr of REDUCED_RELEVANCE_TOKENS) {
      const rrIdx = phraseTokens.indexOf(rr);
      if (rrIdx !== -1) {
        for (let k = rrIdx; k < phraseTokens.length; k++) {
          phraseWeights[k] = Math.max(phraseWeights[k]! - 0.5, 0);
        }
      }
    }

    for (const t of phraseTokens) {
      preparedEmbeddingTokens.push(t);
    }
    for (const t of phraseTags) {
      preparedEmbeddingPosTags.push(t);
    }
    for (const w of phraseWeights) {
      embeddingWeights.push(w);
    }
    phraseCount++;
  }

  return {
    tokens: prepared.map((t) => t.token),
    posTags: prepared.map((t) => t.posTag),
    embeddingTokens: preparedEmbeddingTokens,
    embeddingPosTags: preparedEmbeddingPosTags,
    embeddingWeights,
  };
}

/**
 * Strip ambiguous leading adjectives (like "hot") from `tokens`. If all tokens
 * are ambiguous adjectives, return the original list. Port of
 * `strip_ambiguous_leading_adjectives`.
 */
export function stripAmbiguousLeadingAdjectives(tokens: IngredientToken[]): IngredientToken[] {
  const originalTokens = tokens;
  while (
    tokens.length > 0 &&
    tokens[0]!.posTag.startsWith("J") &&
    AMBIGUOUS_ADJECTIVES.includes(tokens[0]!.token)
  ) {
    tokens = tokens.slice(1);
    if (tokens.length === 0) {
      break;
    }
  }

  if (tokens.length === 0) {
    return originalTokens;
  }

  return tokens;
}
