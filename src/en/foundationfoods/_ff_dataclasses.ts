/**
 * Port of `upstream/ingredient_parser/en/foundationfoods/_ff_dataclasses.py`.
 *
 * `IngredientToken` mirrors the Python `NamedTuple` (`token`, `pos_tag`).
 * `FDCIngredient` and `FDCIngredientMatch` mirror the dataclasses; Python's
 * `__eq__`/`__hash__` on `FDCIngredient` are keyed on `fdc_id`, so throughout
 * the port sets/dicts of FDC ingredients are keyed on `fdcId` (a number) rather
 * than the object identity.
 */

/** Port of the `IngredientToken` NamedTuple. */
export class IngredientToken {
  token: string;
  posTag: string;

  constructor(token: string, posTag: string) {
    this.token = token;
    this.posTag = posTag;
  }
}

/** Element-wise equality of two IngredientToken lists (Python tuple `==`). */
export function ingredientTokensEqual(a: IngredientToken[], b: IngredientToken[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((t, i) => t.token === b[i]!.token && t.posTag === b[i]!.posTag);
}

/** Details of an ingredient from the FoodDataCentral database. Port of `FDCIngredient`. */
export class FDCIngredient {
  fdcId: number;
  dataType: string;
  description: string;
  category: string;
  tokens: string[];
  posTags: string[];
  embeddingTokens: string[];
  embeddingPosTags: string[];
  embeddingWeights: number[];

  constructor(init: {
    fdcId: number;
    dataType: string;
    description: string;
    category: string;
    tokens: string[];
    posTags: string[];
    embeddingTokens: string[];
    embeddingPosTags: string[];
    embeddingWeights: number[];
  }) {
    this.fdcId = init.fdcId;
    this.dataType = init.dataType;
    this.description = init.description;
    this.category = init.category;
    this.tokens = init.tokens;
    this.posTags = init.posTags;
    this.embeddingTokens = init.embeddingTokens;
    this.embeddingPosTags = init.embeddingPosTags;
    this.embeddingWeights = init.embeddingWeights;
  }
}

/** Details of a matching FDC ingredient. Port of `FDCIngredientMatch`. */
export class FDCIngredientMatch {
  fdc: FDCIngredient;
  score: number;

  constructor(fdc: FDCIngredient, score: number) {
    this.fdc = fdc;
    this.score = score;
  }
}
