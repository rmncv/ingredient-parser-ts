/**
 * Port of the subset of `nltk.chunk.regexp` (and `nltk.tree.Tree`) used by
 * `ingredient_parser.en._structure_features`.
 *
 * Source: `nltk/chunk/regexp.py` (RegexpParser, RegexpChunkParser, ChunkString,
 * ChunkRule, tag_pattern2re_pattern) and `nltk/tree/tree.py` (Tree.leaves /
 * Tree.label). Only the constructs exercised by the ingredient-parser grammars
 * are ported:
 * - Grammars are strings; every stage is a single `LABEL: {tag-pattern}` chunk
 *   rule. Only ChunkRule (`{...}`) is implemented; other rule shapes throw.
 * - The internal chunk regexes operate purely on ASCII tag strings (POS tags,
 *   angle brackets, braces), so they are compiled WITHOUT the `u` flag to keep
 *   Python `re` semantics for `\{`, `\}` identity escapes inside classes.
 */

/** A leaf of a chunk tree: a (text, tag) tuple. */
export type Leaf = [string, string];

/** A node of a chunk tree: either a leaf tuple or a subtree. */
export type TreeChild = Leaf | Tree;

/**
 * Minimal port of `nltk.tree.Tree`. A Tree has a label and an ordered list of
 * children, each of which is either a leaf (text, tag) tuple or another Tree.
 */
export class Tree {
  constructor(
    public readonly labelValue: string,
    public readonly children: TreeChild[],
  ) {}

  label(): string {
    return this.labelValue;
  }

  /** All leaf tuples in this tree, in order (recursive). */
  leaves(): Leaf[] {
    const out: Leaf[] = [];
    for (const child of this.children) {
      if (child instanceof Tree) {
        out.push(...child.leaves());
      } else {
        out.push(child);
      }
    }
    return out;
  }
}

function isTree(x: TreeChild): x is Tree {
  return x instanceof Tree;
}

// //////////////////////////////////////////////////////
// Tag pattern -> regex conversion
// //////////////////////////////////////////////////////

const CHUNK_TAG_CHAR = "[^\\{\\}<>]";

// ChunkString.IN_STRIP_PATTERN, a zero-width lookahead matching positions that
// are NOT inside a chunk. Python: r"(?=[^\}]*(\{|$))".
const IN_STRIP_PATTERN = "(?=[^}]*(\\{|$))";

function reverseStr(s: string): string {
  return [...s].reverse().join("");
}

/**
 * Convert a tag pattern to a regular expression pattern (source string).
 * Faithful port of nltk's `tag_pattern2re_pattern`, including the
 * reverse-string trick used to replace unescaped `.` with the chunk-tag char
 * class while leaving escaped `\.` alone.
 */
export function tagPattern2rePattern(tagPattern: string): string {
  // Clean up the regular expression.
  let tp = tagPattern.replace(/\s/g, "");
  tp = tp.replace(/</g, "(<(");
  tp = tp.replace(/>/g, ")>)");

  // Replace "." with CHUNK_TAG_CHAR (skipping escaped "\."), via double reverse
  // + lookahead (Python re has no lookbehind in the original implementation).
  const tcRev = reverseStr(CHUNK_TAG_CHAR);
  let reversed = reverseStr(tp);
  reversed = reversed.replace(/\.(?!\\(\\\\)*($|[^\\]))/g, () => tcRev);
  tp = reverseStr(reversed);

  return tp;
}

// //////////////////////////////////////////////////////
// Chunk rule
// //////////////////////////////////////////////////////

/** A chunk rule: wraps substrings matching its tag pattern in braces. */
class ChunkRule {
  private readonly regexp: RegExp;
  private readonly repl: string;

  constructor(tagPattern: string) {
    // (?P<chunk>PATTERN)IN_STRIP_PATTERN  ->  {\g<chunk>}
    this.regexp = new RegExp(
      "(?<chunk>" + tagPattern2rePattern(tagPattern) + ")" + IN_STRIP_PATTERN,
      "g",
    );
    this.repl = "{$<chunk>}";
  }

  apply(chunkstr: ChunkString): void {
    chunkstr.xform(this.regexp, this.repl);
  }
}

/**
 * Create a chunk rule from a single grammar line. Only chunk rules (`{...}`)
 * are supported; the ingredient-parser grammars use nothing else.
 */
function ruleFromString(s: string): ChunkRule {
  // Split off the comment (but don't split on "\#").
  const m = s.match(/^((?:\\.|[^#])*)(#.*)?$/s);
  const rule = (m ? m[1] : s).trim();
  if (!rule) {
    throw new Error("Empty chunk pattern");
  }
  if (rule[0] === "{" && rule[rule.length - 1] === "}") {
    return new ChunkRule(rule.slice(1, -1));
  }
  throw new Error(`Unsupported chunk pattern (only '{...}' supported): ${rule}`);
}

// //////////////////////////////////////////////////////
// ChunkString
// //////////////////////////////////////////////////////

/** String-based encoding of a chunking of a text. Port of nltk ChunkString. */
class ChunkString {
  private readonly rootLabel: string;
  private readonly pieces: TreeChild[];
  private str: string;

  constructor(chunkStruct: Tree) {
    this.rootLabel = chunkStruct.label();
    this.pieces = chunkStruct.children.slice();
    const tags = this.pieces.map((tok) => ChunkString.tag(tok));
    this.str = "<" + tags.join("><") + ">";
  }

  private static tag(tok: TreeChild): string {
    if (isTree(tok)) {
      return tok.label();
    }
    return tok[1];
  }

  xform(regexp: RegExp, repl: string): void {
    let s = this.str.replace(regexp, repl);
    // Remove any "empty chunks" ("{}") generated by the substitution.
    s = s.replace(/\{\}/g, "");
    this.str = s;
  }

  toChunkstruct(chunkLabel: string): Tree {
    const outPieces: TreeChild[] = [];
    let index = 0;
    let pieceInChunk = false;
    for (const piece of this.str.split(/[{}]/)) {
      const length = (piece.match(/</g) ?? []).length;
      const subsequence = this.pieces.slice(index, index + length);
      if (pieceInChunk) {
        outPieces.push(new Tree(chunkLabel, subsequence));
      } else {
        outPieces.push(...subsequence);
      }
      index += length;
      pieceInChunk = !pieceInChunk;
    }
    return new Tree(this.rootLabel, outPieces);
  }
}

// //////////////////////////////////////////////////////
// RegexpChunkParser (a single stage)
// //////////////////////////////////////////////////////

class RegexpChunkParser {
  constructor(
    private readonly rules: ChunkRule[],
    private readonly chunkLabel: string,
    private readonly rootLabel: string,
  ) {}

  parse(chunkStruct: Tree | TreeChild[]): Tree {
    let struct: Tree;
    if (chunkStruct instanceof Tree) {
      struct = chunkStruct;
    } else {
      struct = new Tree(this.rootLabel, chunkStruct);
    }

    if (struct.children.length === 0) {
      return new Tree(this.rootLabel, []);
    }

    const chunkstr = new ChunkString(struct);
    for (const rule of this.rules) {
      rule.apply(chunkstr);
    }
    return chunkstr.toChunkstruct(this.chunkLabel);
  }
}

// //////////////////////////////////////////////////////
// RegexpParser (a cascade of stages)
// //////////////////////////////////////////////////////

/** Grammar-based chunk parser. Port of `nltk.chunk.regexp.RegexpParser`. */
export class RegexpParser {
  private readonly stages: RegexpChunkParser[] = [];
  private readonly loop = 1;

  constructor(grammar: string, rootLabel = "S") {
    this.readGrammar(grammar, rootLabel);
  }

  private readGrammar(grammar: string, rootLabel: string): void {
    let rules: ChunkRule[] = [];
    let lhs: string | null = null;

    for (let line of grammar.split("\n")) {
      line = line.trim();

      // New stage begins if there's an unescaped ':'.
      const m = line.match(/^((?:\\.|[^:])*):(.*)$/);
      if (m) {
        this.addStage(rules, lhs, rootLabel);
        lhs = m[1].trim();
        rules = [];
        line = m[2].trim();
      }

      if (line === "" || line.startsWith("#")) {
        continue;
      }

      rules.push(ruleFromString(line));
    }

    this.addStage(rules, lhs, rootLabel);
  }

  private addStage(rules: ChunkRule[], lhs: string | null, rootLabel: string): void {
    if (rules.length !== 0) {
      if (!lhs) {
        throw new Error("Expected stage marker (eg NP:)");
      }
      this.stages.push(new RegexpChunkParser(rules, lhs, rootLabel));
    }
  }

  parse(chunkStruct: TreeChild[]): Tree {
    let struct: Tree | TreeChild[] = chunkStruct;
    for (let i = 0; i < this.loop; i++) {
      for (const parser of this.stages) {
        struct = parser.parse(struct);
      }
    }
    // With at least one stage, struct is always a Tree by here; guard for the
    // degenerate empty-grammar case.
    return struct instanceof Tree ? struct : new Tree("S", struct);
  }
}
