import { describe, it, expect, vi } from "vitest";
import { parseIngredient } from "../../src/index.js";

// Port of upstream/tests/parser/test_parser_arg_validation.py

describe("TestParserArgumentValidation", () => {
  it("test_unsupported_language", () => {
    // A ValueError (Error) is raised for an unsupported language.
    expect(() => parseIngredient("1 apple", { lang: "es" })).toThrow(
      /Unsupported language/,
    );
  });

  it("test_imperial_units_warning", () => {
    // A DeprecationWarning is emitted when imperialUnits is specified.
    const spy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    try {
      parseIngredient("1 apple", { imperialUnits: true });
      expect(spy).toHaveBeenCalled();
      const message = String(spy.mock.calls[0]![0]);
      expect(message).toMatch(/imperial_units=True argument is deprecated\./);
      const options = spy.mock.calls[0]![1] as { type?: string } | undefined;
      expect(options?.type).toBe("DeprecationWarning");
    } finally {
      spy.mockRestore();
    }
  });

  it("test_unsupported_volumetric_units_system", () => {
    // A ValueError (Error) is raised for an unsupported volumetric units system.
    expect(() =>
      parseIngredient("1 apple", { volumetricUnitsSystem: "uk" as never }),
    ).toThrow(/Unsupported volumetric_units_system/);
  });
});
