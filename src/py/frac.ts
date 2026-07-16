/**
 * A minimal port of CPython's `fractions.Fraction`, covering the operations
 * used elsewhere in this port: parsing (from string/number/bigint), exact
 * conversion from `float` (`as_integer_ratio`), arithmetic, comparison, and
 * `limit_denominator` (ported verbatim from `fractions.py`).
 */

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n !== b < 0n ? q - 1n : q;
}

function toIntBigInt(v: bigint | number): bigint {
  if (typeof v === "bigint") {
    return v;
  }
  if (!Number.isInteger(v)) {
    throw new TypeError(`Expected an integer value, got ${v}`);
  }
  return BigInt(v);
}

// Mirrors CPython's fractions._RATIONAL_FORMAT: sign, then either
// "num/denom", or "num[.decimal][eExp]" (all-integer counts as this branch
// too, with empty decimal part).
const RATIONAL_FORMAT =
  /^\s*([+-]?)(?:(\d+)\/(\d+)|(\d*)\.(\d*)(?:[eE]([+-]?\d+))?|(\d+)(?:[eE]([+-]?\d+))?)\s*$/;

function parseFracString(s: string): { num: bigint; den: bigint } {
  const m = RATIONAL_FORMAT.exec(s);
  if (!m) {
    throw new RangeError(`Invalid literal for Frac: ${JSON.stringify(s)}`);
  }
  const [, sign, numFrac, denomFrac, numDec, decDigits, expDec, numInt, expInt] = m;

  let num: bigint;
  let den: bigint;

  if (numFrac !== undefined) {
    num = BigInt(numFrac);
    den = BigInt(denomFrac);
  } else if (numDec !== undefined || decDigits !== undefined) {
    num = BigInt(numDec || "0");
    if (decDigits !== undefined && decDigits.length > 0) {
      const scale = 10n ** BigInt(decDigits.length);
      num = num * scale + BigInt(decDigits);
      den = scale;
    } else {
      den = 1n;
    }
    if (expDec !== undefined) {
      const exp = Number(expDec);
      if (exp >= 0) {
        num *= 10n ** BigInt(exp);
      } else {
        den *= 10n ** BigInt(-exp);
      }
    }
  } else {
    num = BigInt(numInt);
    den = 1n;
    if (expInt !== undefined) {
      const exp = Number(expInt);
      if (exp >= 0) {
        num *= 10n ** BigInt(exp);
      } else {
        den *= 10n ** BigInt(-exp);
      }
    }
  }

  if (sign === "-") {
    num = -num;
  }
  return { num, den };
}

export class Frac {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint | number | string, den?: bigint | number) {
    let n: bigint;
    let d: bigint;

    if (den !== undefined) {
      n = toIntBigInt(num as bigint | number);
      d = toIntBigInt(den);
    } else if (typeof num === "string") {
      ({ num: n, den: d } = parseFracString(num));
    } else if (typeof num === "bigint") {
      n = num;
      d = 1n;
    } else if (typeof num === "number") {
      if (Number.isInteger(num)) {
        n = BigInt(num);
        d = 1n;
      } else {
        const f = Frac.fromFloat(num);
        n = f.num;
        d = f.den;
      }
    } else {
      throw new TypeError("Invalid Frac numerator");
    }

    if (d === 0n) {
      throw new RangeError("Frac(x, 0) is not a valid fraction");
    }
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    if (g > 1n) {
      n /= g;
      d /= g;
    }
    this.num = n;
    this.den = d;
  }

  add(o: Frac): Frac {
    return new Frac(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  sub(o: Frac): Frac {
    return new Frac(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  mul(o: Frac): Frac {
    return new Frac(this.num * o.num, this.den * o.den);
  }

  div(o: Frac): Frac {
    if (o.num === 0n) {
      throw new RangeError("division by zero");
    }
    return new Frac(this.num * o.den, this.den * o.num);
  }

  cmp(o: Frac): -1 | 0 | 1 {
    const l = this.num * o.den;
    const r = o.num * this.den;
    if (l < r) return -1;
    if (l > r) return 1;
    return 0;
  }

  eq(o: Frac): boolean {
    return this.num === o.num && this.den === o.den;
  }

  toNumber(): number {
    return Number(this.num) / Number(this.den);
  }

  toString(): string {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
  }

  /**
   * Serialize as the string form ("3", "1/2" — matching Python's
   * `str(Fraction)`), so `JSON.stringify` on parse results doesn't throw
   * `TypeError: Do not know how to serialize a BigInt` on the bigint
   * num/den fields. (Python's `json.dumps` also rejects `Fraction`, so
   * exposing `Frac` itself is parity-faithful; this only makes the default
   * JSON serialization usable.)
   */
  toJSON(): string {
    return this.toString();
  }

  /** Ported verbatim from CPython's `fractions.Fraction.limit_denominator`. */
  limitDenominator(maxDenominator: number): Frac {
    const maxDen = toIntBigInt(maxDenominator);
    if (maxDen < 1n) {
      throw new RangeError("maxDenominator should be at least 1");
    }
    if (this.den <= maxDen) {
      return new Frac(this.num, this.den);
    }

    let p0 = 0n;
    let q0 = 1n;
    let p1 = 1n;
    let q1 = 0n;
    let n = this.num;
    let d = this.den;

    for (;;) {
      const a = floorDiv(n, d);
      const q2 = q0 + a * q1;
      if (q2 > maxDen) {
        break;
      }
      [p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2];
      [n, d] = [d, n - a * d];
    }
    const k = floorDiv(maxDen - q0, q1);

    if (2n * d * (q0 + k * q1) <= this.den) {
      return new Frac(p1, q1);
    }
    return new Frac(p0 + k * p1, q0 + k * q1);
  }

  /** Exact conversion from a `float`, matching Python's `float.as_integer_ratio`. */
  static fromFloat(x: number): Frac {
    if (!Number.isFinite(x)) {
      throw new RangeError("Cannot convert non-finite float to Frac");
    }
    if (x === 0) {
      return new Frac(0n, 1n);
    }

    const negative = x < 0;
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setFloat64(0, Math.abs(x));
    const hi = dv.getUint32(0);
    const lo = dv.getUint32(4);
    const expBits = (hi >>> 20) & 0x7ff;
    const mantHi = hi & 0xfffff;
    let mantissa = (BigInt(mantHi) << 32n) | BigInt(lo >>> 0);
    let exponent: number;
    if (expBits === 0) {
      // Subnormal.
      exponent = -1074;
    } else {
      mantissa |= 1n << 52n;
      exponent = expBits - 1075;
    }

    let num = negative ? -mantissa : mantissa;
    let den = 1n;
    if (exponent >= 0) {
      num <<= BigInt(exponent);
    } else {
      den = 1n << BigInt(-exponent);
    }
    return new Frac(num, den);
  }
}
