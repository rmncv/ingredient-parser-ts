import { describe, it, expect, beforeEach } from "vitest";
import { PreProcessor } from "../../src/en/preprocess.js";

// Port of upstream/tests/preprocess/test_remove_price_annotations.py
describe("TestPreProcessor_remove_price_annotations", () => {
  let p: PreProcessor;
  beforeEach(() => {
    p = new PreProcessor("", {});
  });

  it("test_remove_dollar_price", () => {
    expect(p.removePriceAnnotations("1 cup flour ($0.20)")).toEqual("1 cup flour ");
  });

  it("test_remove_pound_price", () => {
    expect(p.removePriceAnnotations("2 eggs (£1.50)")).toEqual("2 eggs ");
  });

  it("test_remove_euro_price", () => {
    expect(p.removePriceAnnotations("3 tomatoes (€2.00)")).toEqual("3 tomatoes ");
  });

  it("test_remove_yen_price", () => {
    expect(p.removePriceAnnotations("1 onion (¥100)")).toEqual("1 onion ");
  });

  it("test_remove_rupee_price", () => {
    expect(p.removePriceAnnotations("1 potato (₹10.50)")).toEqual("1 potato ");
  });

  it("test_multiple_prices", () => {
    expect(p.removePriceAnnotations("1 apple ($0.50) and 1 orange (£0.30)")).toEqual(
      "1 apple  and 1 orange ",
    );
  });

  it("test_no_price_annotation", () => {
    expect(p.removePriceAnnotations("1 cup sugar")).toEqual("1 cup sugar");
  });

  it("test_malformed_price_annotation", () => {
    expect(p.removePriceAnnotations("1 cup flour ($0.20")).toEqual("1 cup flour ($0.20");
  });

  it("test_price_with_comma", () => {
    expect(p.removePriceAnnotations("1 steak (€1,200.00)")).toEqual("1 steak ");
  });

  it("test_price_with_multiple_decimals", () => {
    expect(p.removePriceAnnotations("1 cheese ($1.99) and 1 bread ($2.49)")).toEqual(
      "1 cheese  and 1 bread ",
    );
  });

  it("test_price_annotation_at_start", () => {
    expect(p.removePriceAnnotations("($0.20) 1 cup flour")).toEqual(" 1 cup flour");
  });

  it("test_price_annotation_in_middle", () => {
    expect(p.removePriceAnnotations("1 cup ($0.20) flour")).toEqual("1 cup  flour");
  });

  it("test_price_annotation_at_end", () => {
    expect(p.removePriceAnnotations("1 cup flour ($0.20)")).toEqual("1 cup flour ");
  });

  it("test_price_annotation_with_leading_space", () => {
    expect(p.removePriceAnnotations("1 cup flour ( $0.20)")).toEqual("1 cup flour ");
  });

  it("test_price_annotation_with_inner_spaces", () => {
    expect(p.removePriceAnnotations("1 cup flour ( $ 0.20 )")).toEqual("1 cup flour ");
  });

  it("test_price_annotation_with_multiple_spaces", () => {
    expect(p.removePriceAnnotations("1 cup flour (  $  0.20  )")).toEqual("1 cup flour ");
  });

  it("test_price_annotation_with_tab_spaces", () => {
    expect(p.removePriceAnnotations("1 cup flour (\t$0.20\t)")).toEqual("1 cup flour ");
  });

  it("test_price_annotation_with_mixed_whitespace", () => {
    expect(p.removePriceAnnotations("1 cup flour ( \t $ 0.20  )")).toEqual("1 cup flour ");
  });

  it("test_price_annotation_with_asterisk_suffix", () => {
    expect(p.removePriceAnnotations("1 cup flour ($0.20**)")).toEqual("1 cup flour ");
  });

  it("test_non_price_parenthetical_remains", () => {
    expect(p.removePriceAnnotations("1 cup flour (organic)")).toEqual(
      "1 cup flour (organic)",
    );
  });

  it("test_multiple_non_price_parentheticals", () => {
    expect(p.removePriceAnnotations("2 eggs (free-range) (large)")).toEqual(
      "2 eggs (free-range) (large)",
    );
  });

  it("test_mixed_price_and_non_price_parentheticals", () => {
    expect(p.removePriceAnnotations("1 cup flour ($0.20) (organic)")).toEqual(
      "1 cup flour  (organic)",
    );
  });

  it("test_non_price_parenthetical_with_spaces", () => {
    expect(p.removePriceAnnotations("1 cup flour ( see note )")).toEqual(
      "1 cup flour ( see note )",
    );
  });

  it("test_non_price_parenthetical_with_numbers", () => {
    expect(p.removePriceAnnotations("1 cup flour (2nd batch)")).toEqual(
      "1 cup flour (2nd batch)",
    );
  });
});
