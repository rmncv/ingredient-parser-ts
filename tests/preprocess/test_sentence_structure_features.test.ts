import { describe, it, expect } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";
import type { FeatureDict } from "../../src/inference.js";

// Port of upstream/tests/preprocess/test_sentence_structure_features.py

describe("Test_multi_ingredient_phrase_features", () => {
  it("test_multi_ingredient_phrase_detection", () => {
    const p = new PreProcessor("2 tbsp chicken or beef stock", {});
    expect(p.sentenceStructure.mipPhrases).toEqual([[2, 3, 4, 5]]);
  });

  it("test_multi_ingredient_phrase_detection_with_name_mod", () => {
    const p = new PreProcessor("2 tbsp hot chicken or beef stock", {});
    expect(p.sentenceStructure.mipPhrases).toEqual([[2, 3, 4, 5, 6]]);
  });

  it("test_extended_multi_ingredient_phrase_detection", () => {
    const p = new PreProcessor("2 tbsp olive, vegetable or sunflower oil", {});
    expect(p.sentenceStructure.mipPhrases).toEqual([[2, 3, 4, 5, 6, 7]]);
  });

  it("test_extended_multi_ingredient_phrase_detection_comma", () => {
    const p = new PreProcessor("2 tbsp olive, vegetable, or sunflower oil", {});
    expect(p.sentenceStructure.mipPhrases).toEqual([[2, 3, 4, 5, 6, 7, 8]]);
  });

  it("test_multi_ingredient_phrase_detection_determinant", () => {
    const p = new PreProcessor("½ c grapeseed oil or any mild-flavored oil", {});
    expect(p.sentenceStructure.mipPhrases).toEqual([[2, 3, 4, 5, 6, 7]]);
  });

  it("test_mip_start_feature_unit", () => {
    const p = new PreProcessor("2 tbsp olive, vegetable or sunflower oil", {});
    const feats = p.sentenceFeatures();
    feats.forEach((tf: FeatureDict, i: number) => {
      if (i === 2) {
        expect(tf["mip_start"] ?? false).toBeTruthy();
      } else {
        expect(tf["mip_start"] ?? false).toBeFalsy();
      }
    });
  });

  it("test_mip_start_feature_size", () => {
    const p = new PreProcessor("1 large sweet or Yukon Gold potato", {});
    const feats = p.sentenceFeatures();
    feats.forEach((tf: FeatureDict, i: number) => {
      if (i === 2) {
        expect(tf["mip_start"] ?? false).toBeTruthy();
      } else {
        expect(tf["mip_start"] ?? false).toBeFalsy();
      }
    });
  });

  it("test_mip_end_feature", () => {
    const p = new PreProcessor("2 tbsp hot chicken or beef stock", {});
    const feats = p.sentenceFeatures();
    feats.forEach((tf: FeatureDict, i: number) => {
      if (i === feats.length - 1) {
        expect(tf["mip_end"] ?? false).toBeTruthy();
      } else {
        expect(tf["mip_end"] ?? false).toBeFalsy();
      }
    });
  });
});

describe("Test_compound_sentence_features", () => {
  it("test_detect_compound_sentence_number_unit", () => {
    const p = new PreProcessor("2 tbsp oil or 1 cup butter", {});
    expect(p.sentenceStructure.sentenceSplits).toEqual([3]);
  });

  it("test_detect_compound_sentence_double_number_unit", () => {
    const p = new PreProcessor(
      "1 1/4 cups squash, or 1 10-ounce package frozen squash",
      {},
    );
    expect(p.sentenceStructure.sentenceSplits).toEqual([4]);
  });

  it("test_detect_compound_sentence_number_noun", () => {
    const p = new PreProcessor("2 serrano peppers or 1 jalapeño pepper", {});
    expect(p.sentenceStructure.sentenceSplits).toEqual([3]);
  });

  it("test_detect_compound_sentence_number_size", () => {
    const p = new PreProcessor("2 small carrots or 1 large carrot", {});
    expect(p.sentenceStructure.sentenceSplits).toEqual([3]);
  });

  it("test_detect_compound_sentence_multiple_splits", () => {
    const p = new PreProcessor(
      "2 medium-ripe tomatoes or 4 plum tomatoes or 8 to 10 cherry tomatoes",
      {},
    );
    expect(p.sentenceStructure.sentenceSplits).toEqual([3, 7]);
  });

  it("test_after_sentence_split_feature", () => {
    const p = new PreProcessor("2 small carrots or 1 large carrot", {});
    const feats = p.sentenceFeatures();
    feats.forEach((tf: FeatureDict, i: number) => {
      if (i >= 3) {
        expect(tf["after_sentence_split"] ?? false).toBeTruthy();
      } else {
        expect(tf["after_sentence_split"] ?? false).toBeFalsy();
      }
    });
  });
});

describe("Test_example_phrase_features", () => {
  it("test_example_phrase_detection_like", () => {
    const p = new PreProcessor(
      "2 tbsp chopped fresh herbs, like parsley and chives",
      {},
    );
    expect(p.sentenceStructure.examplePhrases).toEqual([[6, 7, 8, 9]]);
  });

  it("test_example_phrase_detection_such_as", () => {
    const p = new PreProcessor(
      "2 tbsp chopped fresh herbs, such as parsley and chives",
      {},
    );
    expect(p.sentenceStructure.examplePhrases).toEqual([[6, 7, 8, 9, 10]]);
  });

  it("test_example_phrase_detection_eg", () => {
    const p = new PreProcessor(
      "2 tbsp chopped fresh herbs, e.g. parsley and chives",
      {},
    );
    expect(p.sentenceStructure.examplePhrases).toEqual([[6, 7, 8, 9]]);
  });

  it("test_example_phrase_detection_invalid_start_adjective", () => {
    const p = new PreProcessor(
      "1 bottle dry red wine, heavy and coarse like a Zinfandel",
      {},
    );
    expect(p.sentenceStructure.examplePhrases).toEqual([[9, 10, 11]]);
  });

  it("test_example_phrase_detection_multiple_examples", () => {
    const p = new PreProcessor(
      "2 cups ale, like Boddingtons, or lager, like Carlsburg",
      {},
    );
    expect(p.sentenceStructure.examplePhrases).toEqual([
      [4, 5],
      [10, 11],
    ]);
  });

  it("test_example_phrase_detection_duplicate_examples", () => {
    const p = new PreProcessor(
      "2 cups ale, like Carlsburg, or lager, like Carlsburg",
      {},
    );
    expect(p.sentenceStructure.examplePhrases).toEqual([
      [4, 5],
      [10, 11],
    ]);
  });

  it("test_example_phrase_detection_feature", () => {
    const p = new PreProcessor(
      "1 bottle dry red wine, heavy and coarse like a Zinfandel",
      {},
    );
    const feats = p.sentenceFeatures();
    feats.forEach((tf: FeatureDict, i: number) => {
      if (i >= 9) {
        expect(tf["example_phrase"] ?? false).toBeTruthy();
      } else {
        expect(tf["example_phrase"] ?? false).toBeFalsy();
      }
    });
  });
});

describe("Test_dimensional_phrase_features", () => {
  it("test_dimensional_phrase_detection", () => {
    const p = new PreProcessor("1 2 in thick piece of steak", {});
    expect(p.sentenceStructure.dimensionalPhrases).toEqual([[1, 2, 3]]);
  });

  it("test_dimensional_phrase_no_dimension", () => {
    const p = new PreProcessor("2in/5cm piece of ginger", {});
    expect(p.sentenceStructure.dimensionalPhrases).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("test_dimensional_phrase_with_parenthesis", () => {
    const p = new PreProcessor("1 2 in (5 cm) long piece of steak", {});
    expect(p.sentenceStructure.dimensionalPhrases).toEqual([[1, 2, 3, 4, 5, 6, 7]]);
  });

  it("test_dimensional_phrase_with_slash", () => {
    const p = new PreProcessor("1 2 in / 5 cm wide piece of steak", {});
    expect(p.sentenceStructure.dimensionalPhrases).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("test_dimensional_phrase_with_preposition", () => {
    const p = new PreProcessor("1 potato, 3 inches in diameter", {});
    expect(p.sentenceStructure.dimensionalPhrases).toEqual([[3, 4, 5, 6]]);
  });
});
