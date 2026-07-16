import { describe, it, expect } from "vitest";
import {
  tokenizeFdcDescription,
  type TokenizedFDCDescription,
} from "../../src/en/foundationfoods/_ff_utils.js";

// Port of upstream/tests/foundationfoods/test_tokenize_fdc_description.py

describe("tokenizeFdcDescription", () => {
  it("tokenizes and stems a simple description, all weights 1", () => {
    const description = "Vegetable chips";
    const expectedTokens = ["veget", "chip"];
    const expectedPosTags = ["JJ", "NNS"];
    const expectedWeights = [1.0, 1.0];
    const expected: TokenizedFDCDescription = {
      tokens: expectedTokens,
      posTags: expectedPosTags,
      embeddingTokens: expectedTokens,
      embeddingPosTags: expectedPosTags,
      embeddingWeights: expectedWeights,
    };
    expect(tokenizeFdcDescription(description)).toEqual(expected);
  });

  it("decreases weights with each phrase", () => {
    const description = "Chicken, thigh, meat and skin, raw";
    const expectedTokens = ["chicken", "thigh", "meat", "and", "skin", "raw"];
    const expectedPosTags = ["NN", "NN", "NN", "CC", "NN", "JJ"];
    const expectedWeights = [1.0, 1.0 - 1e-3, 1.0 - 2e-3, 1.0 - 2e-3, 1.0 - 2e-3, 1.0 - 3e-3];
    const expected: TokenizedFDCDescription = {
      tokens: expectedTokens,
      posTags: expectedPosTags,
      embeddingTokens: expectedTokens,
      embeddingPosTags: expectedPosTags,
      embeddingWeights: expectedWeights,
    };
    expect(tokenizeFdcDescription(description)).toEqual(expected);
  });

  it("gives negated tokens and following tokens in the phrase 0 weight", () => {
    const description = "Chicken, canned, no broth";
    const expectedTokens = ["chicken", "can", "no", "broth"];
    const expectedPosTags = ["NN", "VBD", "DT", "NN"];
    const expectedWeights = [1.0, 1.0 - 1e-3, 0, 0];
    const expected: TokenizedFDCDescription = {
      tokens: expectedTokens,
      posTags: expectedPosTags,
      embeddingTokens: expectedTokens,
      embeddingPosTags: expectedPosTags,
      embeddingWeights: expectedWeights,
    };
    expect(tokenizeFdcDescription(description)).toEqual(expected);
  });

  it("reduces weight for reduced-relevance tokens and following tokens", () => {
    const description = "Chicken, canned, with broth";
    const expectedTokens = ["chicken", "can", "with", "broth"];
    const expectedPosTags = ["NN", "VBD", "IN", "NN"];
    const expectedWeights = [1.0, 1.0 - 1e-3, 1 - 0.5 - 2e-3, 1 - 0.5 - 2e-3];
    const expected: TokenizedFDCDescription = {
      tokens: expectedTokens,
      posTags: expectedPosTags,
      embeddingTokens: expectedTokens,
      embeddingPosTags: expectedPosTags,
      embeddingWeights: expectedWeights,
    };
    expect(tokenizeFdcDescription(description)).toEqual(expected);
  });
});
