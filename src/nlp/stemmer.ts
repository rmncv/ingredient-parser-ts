/**
 * Snowball English stemmer.
 *
 * Direct translation of nltk's `nltk.stem.snowball.EnglishStemmer.stem`
 * (and the `_r1r2_standard` helper from `_StandardStemmer`), reproducing
 * nltk's exact behaviour including its deviations from the official Snowball
 * spec. The upstream Python library constructs `EnglishStemmer()` with no
 * `ignore_stopwords`, so there is no stopword bypass here.
 *
 * Reference: tools/.venv/.../nltk/stem/snowball.py (class EnglishStemmer)
 */

const VOWELS = "aeiouy";
const DOUBLE_CONSONANTS = ["bb", "dd", "ff", "gg", "mm", "nn", "pp", "rr", "tt"];
const LI_ENDING = "cdeghkmnrt";

const STEP0_SUFFIXES = ["'s'", "'s", "'"];
const STEP1A_SUFFIXES = ["sses", "ied", "ies", "us", "ss", "s"];
const STEP1B_SUFFIXES = ["eedly", "ingly", "edly", "eed", "ing", "ed"];
const STEP2_SUFFIXES = [
  "ization",
  "ational",
  "fulness",
  "ousness",
  "iveness",
  "tional",
  "biliti",
  "lessli",
  "entli",
  "ation",
  "alism",
  "aliti",
  "ousli",
  "iviti",
  "fulli",
  "enci",
  "anci",
  "abli",
  "izer",
  "ator",
  "alli",
  "bli",
  "ogi",
  "li",
];
const STEP3_SUFFIXES = [
  "ational",
  "tional",
  "alize",
  "icate",
  "iciti",
  "ative",
  "ical",
  "ness",
  "ful",
];
const STEP4_SUFFIXES = [
  "ement",
  "ance",
  "ence",
  "able",
  "ible",
  "ment",
  "ant",
  "ent",
  "ism",
  "ate",
  "iti",
  "ous",
  "ive",
  "ize",
  "ion",
  "al",
  "er",
  "ic",
];
const SPECIAL_WORDS: Record<string, string> = {
  skis: "ski",
  skies: "sky",
  dying: "die",
  lying: "lie",
  tying: "tie",
  idly: "idl",
  gently: "gentl",
  ugly: "ugli",
  early: "earli",
  only: "onli",
  singly: "singl",
  sky: "sky",
  news: "news",
  howe: "howe",
  atlas: "atlas",
  cosmos: "cosmos",
  bias: "bias",
  andes: "andes",
  inning: "inning",
  innings: "inning",
  outing: "outing",
  outings: "outing",
  canning: "canning",
  cannings: "canning",
  herring: "herring",
  herrings: "herring",
  earring: "earring",
  earrings: "earring",
  proceed: "proceed",
  proceeds: "proceed",
  proceeded: "proceed",
  proceeding: "proceed",
  exceed: "exceed",
  exceeds: "exceed",
  exceeded: "exceed",
  exceeding: "exceed",
  succeed: "succeed",
  succeeds: "succeed",
  succeeded: "succeed",
  succeeding: "succeed",
};

const isVowel = (ch: string | undefined): boolean =>
  ch !== undefined && VOWELS.includes(ch);

/**
 * Emulates Python negative-index access `s[i]`. Positive indices behave like
 * `s.charAt(i)` but return undefined when out of range (Python would raise;
 * the surrounding guards keep us from hitting those cases on real input).
 */
const at = (s: string, i: number): string | undefined => {
  const idx = i < 0 ? s.length + i : i;
  if (idx < 0 || idx >= s.length) return undefined;
  return s[idx];
};

/** Emulates Python `original[:-len(old)] + new`. */
const suffixReplace = (original: string, oldSuffix: string, next: string): string =>
  original.slice(0, -oldSuffix.length) + next;

/** Emulates Python slice `s[:-n]` (n >= 1). */
const dropLast = (s: string, n: number): string => s.slice(0, -n);

/**
 * Compute R1 and R2 as in nltk `_StandardStemmer._r1r2_standard`.
 */
function r1r2Standard(word: string): [string, string] {
  let r1 = "";
  let r2 = "";
  for (let i = 1; i < word.length; i++) {
    if (!isVowel(word[i]) && isVowel(word[i - 1])) {
      r1 = word.slice(i + 1);
      break;
    }
  }
  for (let i = 1; i < r1.length; i++) {
    if (!isVowel(r1[i]) && isVowel(r1[i - 1])) {
      r2 = r1.slice(i + 1);
      break;
    }
  }
  return [r1, r2];
}

export function stem(word: string): string {
  word = word.toLowerCase();

  // No stopwords are configured upstream, so only the length guard applies.
  if (word.length <= 2) {
    return word;
  }

  if (Object.prototype.hasOwnProperty.call(SPECIAL_WORDS, word)) {
    return SPECIAL_WORDS[word]!;
  }

  // Map the different apostrophe characters to a single consistent one.
  word = word
    .replace(/’/g, "\x27")
    .replace(/‘/g, "\x27")
    .replace(/‛/g, "\x27");

  if (word.startsWith("\x27")) {
    word = word.slice(1);
  }

  if (word.startsWith("y")) {
    word = "Y" + word.slice(1);
  }

  {
    const n = word.length;
    for (let i = 1; i < n; i++) {
      if (isVowel(word[i - 1]) && word[i] === "y") {
        word = word.slice(0, i) + "Y" + word.slice(i + 1);
      }
    }
  }

  let step1aVowelFound = false;
  let step1bVowelFound = false;

  let r1 = "";
  let r2 = "";

  if (
    word.startsWith("gener") ||
    word.startsWith("commun") ||
    word.startsWith("arsen")
  ) {
    if (word.startsWith("gener") || word.startsWith("arsen")) {
      r1 = word.slice(5);
    } else {
      r1 = word.slice(6);
    }
    for (let i = 1; i < r1.length; i++) {
      if (!isVowel(r1[i]) && isVowel(r1[i - 1])) {
        r2 = r1.slice(i + 1);
        break;
      }
    }
  } else {
    [r1, r2] = r1r2Standard(word);
  }

  // STEP 0
  for (const suffix of STEP0_SUFFIXES) {
    if (word.endsWith(suffix)) {
      word = dropLast(word, suffix.length);
      r1 = dropLast(r1, suffix.length);
      r2 = dropLast(r2, suffix.length);
      break;
    }
  }

  // STEP 1a
  for (const suffix of STEP1A_SUFFIXES) {
    if (word.endsWith(suffix)) {
      if (suffix === "sses") {
        word = dropLast(word, 2);
        r1 = dropLast(r1, 2);
        r2 = dropLast(r2, 2);
      } else if (suffix === "ied" || suffix === "ies") {
        if (word.slice(0, -suffix.length).length > 1) {
          word = dropLast(word, 2);
          r1 = dropLast(r1, 2);
          r2 = dropLast(r2, 2);
        } else {
          word = dropLast(word, 1);
          r1 = dropLast(r1, 1);
          r2 = dropLast(r2, 1);
        }
      } else if (suffix === "s") {
        for (const letter of word.slice(0, -2)) {
          if (VOWELS.includes(letter)) {
            step1aVowelFound = true;
            break;
          }
        }
        if (step1aVowelFound) {
          word = dropLast(word, 1);
          r1 = dropLast(r1, 1);
          r2 = dropLast(r2, 1);
        }
      }
      break;
    }
  }

  // STEP 1b
  for (const suffix of STEP1B_SUFFIXES) {
    if (word.endsWith(suffix)) {
      if (suffix === "eed" || suffix === "eedly") {
        if (r1.endsWith(suffix)) {
          word = suffixReplace(word, suffix, "ee");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ee") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ee") : "";
        }
      } else {
        for (const letter of word.slice(0, -suffix.length)) {
          if (VOWELS.includes(letter)) {
            step1bVowelFound = true;
            break;
          }
        }
        if (step1bVowelFound) {
          word = dropLast(word, suffix.length);
          r1 = dropLast(r1, suffix.length);
          r2 = dropLast(r2, suffix.length);

          if (word.endsWith("at") || word.endsWith("bl") || word.endsWith("iz")) {
            word = word + "e";
            r1 = r1 + "e";
            if (word.length > 5 || r1.length >= 3) {
              r2 = r2 + "e";
            }
          } else if (DOUBLE_CONSONANTS.some((dc) => word.endsWith(dc))) {
            word = dropLast(word, 1);
            r1 = dropLast(r1, 1);
            r2 = dropLast(r2, 1);
          } else if (
            (r1 === "" &&
              word.length >= 3 &&
              !isVowel(at(word, -1)) &&
              !"wxY".includes(at(word, -1) ?? "￿") &&
              isVowel(at(word, -2)) &&
              !isVowel(at(word, -3))) ||
            (r1 === "" &&
              word.length === 2 &&
              isVowel(at(word, 0)) &&
              !isVowel(at(word, 1)))
          ) {
            word = word + "e";
            if (r1.length > 0) r1 = r1 + "e";
            if (r2.length > 0) r2 = r2 + "e";
          }
        }
      }
      break;
    }
  }

  // STEP 1c
  if (
    word.length > 2 &&
    (at(word, -1) === "y" || at(word, -1) === "Y") &&
    !isVowel(at(word, -2))
  ) {
    word = dropLast(word, 1) + "i";
    r1 = r1.length >= 1 ? dropLast(r1, 1) + "i" : "";
    r2 = r2.length >= 1 ? dropLast(r2, 1) + "i" : "";
  }

  // STEP 2
  for (const suffix of STEP2_SUFFIXES) {
    if (word.endsWith(suffix)) {
      if (r1.endsWith(suffix)) {
        if (suffix === "tional") {
          word = dropLast(word, 2);
          r1 = dropLast(r1, 2);
          r2 = dropLast(r2, 2);
        } else if (suffix === "enci" || suffix === "anci" || suffix === "abli") {
          word = dropLast(word, 1) + "e";
          r1 = r1.length >= 1 ? dropLast(r1, 1) + "e" : "";
          r2 = r2.length >= 1 ? dropLast(r2, 1) + "e" : "";
        } else if (suffix === "entli") {
          word = dropLast(word, 2);
          r1 = dropLast(r1, 2);
          r2 = dropLast(r2, 2);
        } else if (suffix === "izer" || suffix === "ization") {
          word = suffixReplace(word, suffix, "ize");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ize") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ize") : "";
        } else if (suffix === "ational" || suffix === "ation" || suffix === "ator") {
          word = suffixReplace(word, suffix, "ate");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ate") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ate") : "e";
        } else if (suffix === "alism" || suffix === "aliti" || suffix === "alli") {
          word = suffixReplace(word, suffix, "al");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "al") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "al") : "";
        } else if (suffix === "fulness") {
          word = dropLast(word, 4);
          r1 = dropLast(r1, 4);
          r2 = dropLast(r2, 4);
        } else if (suffix === "ousli" || suffix === "ousness") {
          word = suffixReplace(word, suffix, "ous");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ous") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ous") : "";
        } else if (suffix === "iveness" || suffix === "iviti") {
          word = suffixReplace(word, suffix, "ive");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ive") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ive") : "e";
        } else if (suffix === "biliti" || suffix === "bli") {
          word = suffixReplace(word, suffix, "ble");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ble") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ble") : "";
        } else if (suffix === "ogi" && at(word, -4) === "l") {
          word = dropLast(word, 1);
          r1 = dropLast(r1, 1);
          r2 = dropLast(r2, 1);
        } else if (suffix === "fulli" || suffix === "lessli") {
          word = dropLast(word, 2);
          r1 = dropLast(r1, 2);
          r2 = dropLast(r2, 2);
        } else if (suffix === "li" && LI_ENDING.includes(at(word, -3) ?? "￿")) {
          word = dropLast(word, 2);
          r1 = dropLast(r1, 2);
          r2 = dropLast(r2, 2);
        }
      }
      break;
    }
  }

  // STEP 3
  for (const suffix of STEP3_SUFFIXES) {
    if (word.endsWith(suffix)) {
      if (r1.endsWith(suffix)) {
        if (suffix === "tional") {
          word = dropLast(word, 2);
          r1 = dropLast(r1, 2);
          r2 = dropLast(r2, 2);
        } else if (suffix === "ational") {
          word = suffixReplace(word, suffix, "ate");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ate") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ate") : "";
        } else if (suffix === "alize") {
          word = dropLast(word, 3);
          r1 = dropLast(r1, 3);
          r2 = dropLast(r2, 3);
        } else if (suffix === "icate" || suffix === "iciti" || suffix === "ical") {
          word = suffixReplace(word, suffix, "ic");
          r1 = r1.length >= suffix.length ? suffixReplace(r1, suffix, "ic") : "";
          r2 = r2.length >= suffix.length ? suffixReplace(r2, suffix, "ic") : "";
        } else if (suffix === "ful" || suffix === "ness") {
          word = dropLast(word, suffix.length);
          r1 = dropLast(r1, suffix.length);
          r2 = dropLast(r2, suffix.length);
        } else if (suffix === "ative" && r2.endsWith(suffix)) {
          word = dropLast(word, 5);
          r1 = dropLast(r1, 5);
          r2 = dropLast(r2, 5);
        }
      }
      break;
    }
  }

  // STEP 4
  for (const suffix of STEP4_SUFFIXES) {
    if (word.endsWith(suffix)) {
      if (r2.endsWith(suffix)) {
        if (suffix === "ion") {
          if ("st".includes(at(word, -4) ?? "￿")) {
            word = dropLast(word, 3);
            r1 = dropLast(r1, 3);
            r2 = dropLast(r2, 3);
          }
        } else {
          word = dropLast(word, suffix.length);
          r1 = dropLast(r1, suffix.length);
          r2 = dropLast(r2, suffix.length);
        }
      }
      break;
    }
  }

  // STEP 5
  if (r2.endsWith("l") && at(word, -2) === "l") {
    word = dropLast(word, 1);
  } else if (r2.endsWith("e")) {
    word = dropLast(word, 1);
  } else if (r1.endsWith("e")) {
    if (
      word.length >= 4 &&
      (isVowel(at(word, -2)) ||
        "wxY".includes(at(word, -2) ?? "￿") ||
        !isVowel(at(word, -3)) ||
        isVowel(at(word, -4)))
    ) {
      word = dropLast(word, 1);
    }
  }

  word = word.replace(/Y/g, "y");

  return word;
}
