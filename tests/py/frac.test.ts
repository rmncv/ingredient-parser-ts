import { describe, it, expect } from "vitest";
import { Frac } from "../../src/py/frac.js";

describe("Frac", () => {
  it("parses and normalizes", () => {
    expect(new Frac("1/2").toString()).toBe("1/2");
    expect(new Frac(2, 4).toString()).toBe("1/2");
    expect(new Frac("1.5").toString()).toBe("3/2");
    expect(new Frac("3").toString()).toBe("3");
  });
  it("arithmetic", () => {
    expect(new Frac(1, 3).add(new Frac(1, 6)).toString()).toBe("1/2");
    expect(new Frac(3, 2).mul(new Frac(2, 3)).toString()).toBe("1");
    expect(new Frac(1, 2).cmp(new Frac(2, 3))).toBe(-1);
  });
  it("fromFloat + limitDenominator matches Python", () => {
    // Python: Fraction(0.1).limit_denominator(1000000) == Fraction(1, 10)
    expect(Frac.fromFloat(0.1).limitDenominator(1000000).toString()).toBe("1/10");
    expect(Frac.fromFloat(0.333).limitDenominator(100).toString()).toBe("1/3");
  });
  it("toNumber", () => {
    expect(new Frac(3, 4).toNumber()).toBe(0.75);
  });
  it("toJSON: JSON.stringify serializes as the string form, not bigint fields", () => {
    expect(JSON.stringify(new Frac(3))).toBe('"3"');
    expect(JSON.stringify(new Frac(1, 2))).toBe('"1/2"');
  });
});
