/**
 * Port of `upstream/ingredient_parser/en/_embeddings.py`.
 *
 * GloVe vectors are stored as `Float32Array` (numpy `float32`). The module also
 * provides float32-faithful reduction helpers used by the semantic rankers.
 *
 * Float discipline (plan rule 4):
 *  - numpy `add.reduce` over float32 arrays (used by `np.mean`, and the axis
 *    reductions inside `np.linalg.norm(..., axis=k)`) uses *pairwise summation*
 *    with an 8-lane unrolled inner loop for blocks of <= 128 elements. This is
 *    reproduced bit-for-bit by `pairwiseSumF32` with `Math.fround` applied to
 *    every elementary float32 operation.
 *  - `np.dot` / 1-D `np.linalg.norm` dispatch to BLAS on the reference (macOS)
 *    platform, which is not portably reproducible. We approximate them with the
 *    same pairwise summation of float32 products; residual last-ULP drift is
 *    absorbed by the parity gate's confidence tolerance.
 */

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

/** float32 rounding. */
export const f32 = Math.fround;

/** numpy PW_BLOCKSIZE. */
const PW_BLOCKSIZE = 128;

/**
 * numpy `pairwise_sum` over a float32 view, applying `Math.fround` to every
 * elementary addition. `read(i)` returns the (already float32) i-th summand.
 */
export function pairwiseSumF32(read: (i: number) => number, off: number, n: number): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) {
      res = f32(res + read(off + i));
    }
    return res;
  } else if (n <= PW_BLOCKSIZE) {
    const r = new Float64Array(8);
    for (let j = 0; j < 8; j++) {
      r[j] = read(off + j);
    }
    let i: number;
    for (i = 8; i < n - (n % 8); i += 8) {
      for (let j = 0; j < 8; j++) {
        r[j] = f32(r[j]! + read(off + i + j));
      }
    }
    let res = f32(
      f32(f32(r[0]! + r[1]!) + f32(r[2]! + r[3]!)) + f32(f32(r[4]! + r[5]!) + f32(r[6]! + r[7]!)),
    );
    for (; i < n; i++) {
      res = f32(res + read(off + i));
    }
    return res;
  } else {
    let n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    return f32(pairwiseSumF32(read, off, n2) + pairwiseSumF32(read, off + n2, n - n2));
  }
}

/** Sum a full float32 array (pairwise). */
export function sumF32(a: ArrayLike<number>): number {
  return pairwiseSumF32((i) => a[i]!, 0, a.length);
}

/** float32 dot product (pairwise sum of float32 products). */
export function dotF32(a: ArrayLike<number>, b: ArrayLike<number>, n: number): number {
  return pairwiseSumF32((i) => f32(a[i]! * b[i]!), 0, n);
}

/** float32 L2 norm of a 1-D vector (`sqrt(dot(x, x))`). */
export function normF32(a: ArrayLike<number>, n: number): number {
  return f32(Math.sqrt(dotF32(a, a, n)));
}

/** Class to interact with GloVe embeddings. Port of `GloVeModel`. */
export class GloVeModel {
  vecFile: string;
  vectors: Map<string, Float32Array>;
  vocabSize = 0;
  dimension = 0;

  constructor(vecFileUrl: URL, vecFile: string) {
    this.vecFile = vecFile;
    this.vectors = new Map();
    this._loadVectorsFromFile(vecFileUrl);
  }

  get size(): number {
    return this.vocabSize;
  }

  has(token: string): boolean {
    return this.vectors.has(token);
  }

  getitem(token: string): Float32Array {
    const v = this.vectors.get(token);
    if (v === undefined) {
      throw new Error(`KeyError: ${token}`);
    }
    return v;
  }

  get(token: string, defaultValue: Float32Array | null): Float32Array | null {
    const v = this.vectors.get(token);
    return v === undefined ? defaultValue : v;
  }

  private _loadVectorsFromFile(vecFileUrl: URL): void {
    const buf = readFileSync(vecFileUrl);
    const text = gunzipSync(buf).toString("utf-8");
    // Match Python's `f.readline()` + iteration: split on newlines. The file is
    // newline-terminated; a trailing empty line is ignored.
    const newlineIdx = text.indexOf("\n");
    const header = text.slice(0, newlineIdx).replace(/\s+$/, "");
    const [vocabSize, dimension] = header.split(/\s+/).map((v) => parseInt(v, 10));
    this.vocabSize = vocabSize!;
    this.dimension = dimension!;

    let pos = newlineIdx + 1;
    const len = text.length;
    while (pos < len) {
      let end = text.indexOf("\n", pos);
      if (end === -1) {
        end = len;
      }
      // rstrip the line
      let lineEnd = end;
      while (lineEnd > pos && /\s/.test(text[lineEnd - 1]!)) {
        lineEnd--;
      }
      if (lineEnd > pos) {
        const line = text.slice(pos, lineEnd);
        const parts = line.split(/\s+/);
        const token = parts[0]!;
        const vec = new Float32Array(parts.length - 1);
        for (let i = 1; i < parts.length; i++) {
          vec[i - 1] = f32(parseFloat(parts[i]!));
        }
        this.vectors.set(token, vec);
      }
      pos = end + 1;
    }
  }
}
