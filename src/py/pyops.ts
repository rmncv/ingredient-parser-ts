/**
 * Python-compatible numeric operations: `round()` and `str(float)`.
 *
 * These mimic CPython's exact semantics (round-half-to-even on the true
 * binary value of the double, and CPython's `repr(float)` formatting rules)
 * so that ported code produces byte-identical output to the Python source.
 */

/** Decompose a finite, non-zero double into `mantissa * 2^exponent` (both exact). */
function decompose(x: number): { mantissa: bigint; exponent: number } {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setFloat64(0, x);
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
  return { mantissa, exponent };
}

/** Exact decimal digit expansion of `mantissa * 2^exponent`, split at the decimal point. */
function exactDecimalDigits(
  mantissa: bigint,
  exponent: number,
): { intPart: string; fracPart: string } {
  if (mantissa === 0n) {
    return { intPart: "0", fracPart: "" };
  }
  if (exponent >= 0) {
    const intVal = mantissa << BigInt(exponent);
    return { intPart: intVal.toString(), fracPart: "" };
  }
  const k = -exponent;
  const scaled = mantissa * 5n ** BigInt(k); // == value * 10^k, exact integer
  let s = scaled.toString();
  if (s.length <= k) {
    s = "0".repeat(k - s.length + 1) + s;
  }
  const intPart = s.slice(0, s.length - k) || "0";
  const fracPart = s.slice(s.length - k);
  return { intPart, fracPart };
}

/**
 * Python 3's `round(x, ndigits)`: round-half-to-even, computed on the exact
 * binary value of the IEEE-754 double (matching CPython's `double_round`).
 */
export function pyRound(x: number, ndigits?: number): number {
  if (!Number.isFinite(x)) {
    return x;
  }
  if (x === 0) {
    // Preserve the sign of zero (Object.is(-0, -0) semantics).
    return x;
  }
  const nd = ndigits ?? 0;
  const negative = x < 0;
  const { mantissa, exponent } = decompose(Math.abs(x));
  const { intPart, fracPart } = exactDecimalDigits(mantissa, exponent);

  let digits = intPart + fracPart;
  let pointPos = intPart.length;

  // Ensure cutIndex >= 0 by padding leading zeros if ndigits is very negative.
  const padNeeded = Math.max(0, -(pointPos + nd) + 1);
  if (padNeeded > 0) {
    digits = "0".repeat(padNeeded) + digits;
    pointPos += padNeeded;
  }

  const cutIndex = pointPos + nd;
  if (cutIndex >= digits.length) {
    // Requested precision exceeds the exact value's precision: nothing to round.
    return x;
  }

  const keep = digits.slice(0, cutIndex);
  const roundDigit = digits.charCodeAt(cutIndex) - 48; // '0' -> 0
  const remainder = digits.slice(cutIndex + 1);

  let roundUp: boolean;
  if (roundDigit > 5) {
    roundUp = true;
  } else if (roundDigit < 5) {
    roundUp = false;
  } else {
    const remainderNonZero = /[1-9]/.test(remainder);
    if (remainderNonZero) {
      roundUp = true;
    } else {
      const lastKept = keep.length > 0 ? keep.charCodeAt(keep.length - 1) - 48 : 0;
      roundUp = lastKept % 2 === 1;
    }
  }

  let keptBig = keep.length > 0 ? BigInt(keep) : 0n;
  if (roundUp) {
    keptBig += 1n;
  }
  const keptStr = keptBig.toString();

  let valueStr: string;
  if (nd <= 0) {
    valueStr = keptStr + "0".repeat(-nd);
  } else if (keptStr.length > nd) {
    valueStr = keptStr.slice(0, keptStr.length - nd) + "." + keptStr.slice(keptStr.length - nd);
  } else {
    valueStr = "0." + "0".repeat(nd - keptStr.length) + keptStr;
  }

  const signedStr = negative ? "-" + valueStr : valueStr;
  return Number(signedStr);
}

/**
 * Python's `str(float)` / `repr(float)`: shortest round-tripping decimal,
 * formatted per CPython's rules (fixed-point unless the decimal exponent is
 * < -4 or >= 16, always includes a decimal point, exponent zero-padded to 2
 * digits with an explicit sign).
 */
export function pyFloatStr(x: number): string {
  if (Number.isNaN(x)) {
    return "nan";
  }
  if (x === Infinity) {
    return "inf";
  }
  if (x === -Infinity) {
    return "-inf";
  }

  const negative = x < 0 || Object.is(x, -0);
  const abs = Math.abs(x);

  // toExponential() with no argument yields the shortest round-tripping
  // digit sequence, same as String(x) / CPython's repr algorithm.
  const expStr = abs.toExponential();
  const match = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(expStr);
  if (!match) {
    throw new Error(`unexpected toExponential() format: ${expStr}`);
  }
  const digits = match[1] + (match[2] ?? "");
  const e = Number(match[3]);

  let body: string;
  if (e < -4 || e >= 16) {
    const mantissa = digits.length === 1 ? digits : digits[0] + "." + digits.slice(1);
    const sign = e < 0 ? "-" : "+";
    const expDigits = Math.abs(e).toString().padStart(2, "0");
    body = `${mantissa}e${sign}${expDigits}`;
  } else if (e >= 0) {
    const intPart = digits.length > e + 1 ? digits.slice(0, e + 1) : digits.padEnd(e + 1, "0");
    const fracPart = digits.length > e + 1 ? digits.slice(e + 1) : "0";
    body = `${intPart}.${fracPart}`;
  } else {
    const fracPart = "0".repeat(-e - 1) + digits;
    body = `0.${fracPart}`;
  }

  return negative ? "-" + body : body;
}
