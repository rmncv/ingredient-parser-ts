import { describe, it, expect } from "vitest";
import { consume, groupConsecutiveIdx, isFloat, isRange } from "../src/_common.js";

function rangeIterator(n: number): Iterator<number> {
  return (function* () {
    for (let i = 0; i < n; i++) yield i;
  })();
}

describe("consume", () => {
  it("advances iterator by specified amount", () => {
    const it = rangeIterator(10);
    expect(it.next().value).toBe(0);
    consume(it, 2);
    expect(it.next().value).toBe(3);
  });

  it("consumes iterator completely", () => {
    const it = rangeIterator(10);
    expect(it.next().value).toBe(0);
    consume(it, null);
    expect(it.next().done).toBe(true);
  });
});

describe("isFloat", () => {
  it("identifies string '1' as convertable to float", () => {
    expect(isFloat("1")).toBe(true);
  });

  it("identifies string '2.5' as convertable to float", () => {
    expect(isFloat("2.5")).toBe(true);
  });

  it("identifies string '1-2' as not convertable to float", () => {
    expect(isFloat("1-2")).toBe(false);
  });

  it("identifies string '1x' as not convertable to float", () => {
    expect(isFloat("1x")).toBe(false);
  });
});

describe("isRange", () => {
  it("identifies string '1' as not a range", () => {
    expect(isRange("1")).toBe(false);
  });

  it("identifies string '2.5' as not a range", () => {
    expect(isRange("2.5")).toBe(false);
  });

  it("identifies string '1-2' as a range", () => {
    expect(isRange("1-2")).toBe(true);
  });

  it("identifies string '1-2 dozen' as not a range", () => {
    expect(isRange("1-2 dozen")).toBe(false);
  });

  it("identifies string '1x' as not a range", () => {
    expect(isRange("1x")).toBe(false);
  });
});

describe("groupConsecutiveIdx", () => {
  it("returns a single group", () => {
    const inputIndices = [0, 1, 2, 3, 4];
    expect(groupConsecutiveIdx(inputIndices)).toEqual([inputIndices]);
  });

  it("returns groups of consecutive indices", () => {
    const inputIndices = [0, 1, 2, 4, 5, 6, 8, 9];
    expect(groupConsecutiveIdx(inputIndices)).toEqual([
      [0, 1, 2],
      [4, 5, 6],
      [8, 9],
    ]);
  });
});
