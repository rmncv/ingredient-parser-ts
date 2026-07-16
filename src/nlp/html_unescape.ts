/**
 * Port of Python's `html.unescape` (CPython `Lib/html/__init__.py`).
 *
 * Converts all named and numeric character references in a string to the
 * corresponding unicode characters, using the HTML 5 rules for valid and
 * invalid references and the `html.entities.html5` named-reference table
 * (embedded as `_html5_entities.json`, generated from the reference
 * interpreter).
 */

import { readFileSync } from "node:fs";

let html5: Record<string, string> | undefined;

function loadHtml5(): Record<string, string> {
  if (html5 === undefined) {
    const buf = readFileSync(new URL("_html5_entities.json", import.meta.url));
    html5 = JSON.parse(buf.toString("utf-8")) as Record<string, string>;
  }
  return html5;
}

// see https://html.spec.whatwg.org/multipage/parsing.html#numeric-character-reference-end-state
const INVALID_CHARREFS: Record<number, string> = {
  0x00: "�",
  0x0d: "\r",
  0x80: "€",
  0x81: "\x81",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8d: "\x8d",
  0x8e: "Ž",
  0x8f: "\x8f",
  0x90: "\x90",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9d: "\x9d",
  0x9e: "ž",
  0x9f: "Ÿ",
};

const INVALID_CODEPOINTS: Set<number> = new Set<number>([
  // 0x0001 to 0x0008
  0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8,
  // 0x000E to 0x001F
  0xe, 0xf, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b,
  0x1c, 0x1d, 0x1e, 0x1f,
  // 0x007F to 0x009F
  0x7f, 0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c,
  0x8d, 0x8e, 0x8f, 0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a,
  0x9b, 0x9c, 0x9d, 0x9e, 0x9f,
  // 0xFDD0 to 0xFDEF
  0xfdd0, 0xfdd1, 0xfdd2, 0xfdd3, 0xfdd4, 0xfdd5, 0xfdd6, 0xfdd7, 0xfdd8, 0xfdd9, 0xfdda,
  0xfddb, 0xfddc, 0xfddd, 0xfdde, 0xfddf, 0xfde0, 0xfde1, 0xfde2, 0xfde3, 0xfde4, 0xfde5,
  0xfde6, 0xfde7, 0xfde8, 0xfde9, 0xfdea, 0xfdeb, 0xfdec, 0xfded, 0xfdee, 0xfdef,
  // others
  0xb, 0xfffe, 0xffff, 0x1fffe, 0x1ffff, 0x2fffe, 0x2ffff, 0x3fffe, 0x3ffff, 0x4fffe,
  0x4ffff, 0x5fffe, 0x5ffff, 0x6fffe, 0x6ffff, 0x7fffe, 0x7ffff, 0x8fffe, 0x8ffff,
  0x9fffe, 0x9ffff, 0xafffe, 0xaffff, 0xbfffe, 0xbffff, 0xcfffe, 0xcffff, 0xdfffe,
  0xdffff, 0xefffe, 0xeffff, 0xffffe, 0xfffff, 0x10fffe, 0x10ffff,
]);

// Python: r'&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)'
const CHARREF = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/g;

function rstripSemicolon(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === ";") {
    end -= 1;
  }
  return s.slice(0, end);
}

function replaceCharref(group1: string): string {
  const table = loadHtml5();
  if (group1[0] === "#") {
    // Numeric charref.
    let num: number;
    if (group1[1] === "x" || group1[1] === "X") {
      num = parseInt(rstripSemicolon(group1.slice(2)), 16);
    } else {
      num = parseInt(rstripSemicolon(group1.slice(1)), 10);
    }
    if (Object.prototype.hasOwnProperty.call(INVALID_CHARREFS, num)) {
      return INVALID_CHARREFS[num];
    }
    if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) {
      return "�";
    }
    if (INVALID_CODEPOINTS.has(num)) {
      return "";
    }
    return String.fromCodePoint(num);
  }

  // Named charref.
  if (Object.prototype.hasOwnProperty.call(table, group1)) {
    return table[group1];
  }
  // Find the longest matching name (as defined by the standard).
  for (let x = group1.length - 1; x > 1; x--) {
    const prefix = group1.slice(0, x);
    if (Object.prototype.hasOwnProperty.call(table, prefix)) {
      return table[prefix] + group1.slice(x);
    }
  }
  return "&" + group1;
}

/** Convert all named and numeric character references in `s`. */
export function htmlUnescape(s: string): string {
  if (!s.includes("&")) {
    return s;
  }
  return s.replace(CHARREF, (_m, g1: string) => replaceCharref(g1));
}
