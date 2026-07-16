import { describe, it, expect } from "vitest";
import { pyRound, pyFloatStr } from "../../src/py/pyops.js";

describe("pyRound", () => {
  it("banker's rounding at .5", () => {
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(-0.5)).toBe(-0);
  });
  it("ndigits follows float representation", () => {
    expect(pyRound(2.675, 2)).toBe(2.67);
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(1.005, 2)).toBe(1.0);
    expect(pyRound(3.14159, 3)).toBe(3.142);
  });
});

describe("pyFloatStr", () => {
  it("matches Python str(float)", () => {
    expect(pyFloatStr(2)).toBe("2.0");
    expect(pyFloatStr(2.5)).toBe("2.5");
    expect(pyFloatStr(0.00001)).toBe("1e-05");
    expect(pyFloatStr(1e16)).toBe("1e+16");
    expect(pyFloatStr(123456789012345.6)).toBe("123456789012345.6");
  });
});
