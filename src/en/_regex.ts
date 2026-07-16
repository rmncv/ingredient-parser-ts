/**
 * Port of `upstream/ingredient_parser/en/_regex.py`.
 *
 * Porting notes (porting rule 1):
 * - Every pattern carries a comment with the original Python pattern.
 * - Patterns use the `u` flag. Under `u`, JS forbids the redundant identity
 *   escapes Python allows, so `\-` -> `-` (outside classes), `\#` -> `#`; but
 *   `\$`, `\*`, `\(`, `\)`, `\[`, `\]`, `\{`, `\}`, `\?`, `\/` remain valid.
 * - Python's unicode `\d` becomes `\p{Nd}` (matching Python's unicode-digit
 *   semantics). `[0-9]` stays `[0-9]` where the Python source used the explicit
 *   ASCII range.
 * - `(?P<name>)` -> `(?<name>)` (none present here).
 * - The `g` flag is added to patterns that Python uses with `.sub`, `.findall`
 *   or `.finditer` (i.e. replace-all / find-all semantics).
 * - re.IGNORECASE -> `i`; re.VERBOSE patterns are de-verbosed by hand.
 * - The tokeniser split patterns (see `_utils.ts`) live there, not here,
 *   matching the Python module layout.
 */

import { FLATTENED_UNITS_LIST, LENGTH_UNITS, STRING_NUMBERS } from "./_constants.js";

// Regex pattern for fraction parts.
// Matches 0+ numbers followed by 0+ white space characters followed by a number
// then a forward slash then another number.
// Python: r"(\d*\s*\d/\d+)"
export const FRACTION_PARTS_PATTERN = /(\p{Nd}*\s*\p{Nd}\/\p{Nd}+)/gu;

// Regex pattern for checking if token starts with a capital letter.
// Python: r"^[A-Z]"
export const CAPITALISED_PATTERN = /^[A-Z]/u;

// Add additional strings to units set that aren't necessarily units, but we
// want to treat them like units for the purposes of splitting quantities from
// units. (Python: units_list = FLATTENED_UNITS_LIST | {"x"} | LENGTH_UNITS)
const unitsList = [...new Set<string>([...FLATTENED_UNITS_LIST, "x", ...LENGTH_UNITS])];
const unitsAlt = unitsList.join("|");
const stringNumbersAlt = [...STRING_NUMBERS.keys()].join("|");

// The negative lookahead at the end of QUANTITY_UNITS_PATTERN is there
// specifically to handle units like 'c' where it could be the start of another
// word. We have to check that the next character after the unit is *not*
// another letter in order to match.
// "x" is excluded from the possible following characters to allow constructs
// like 2cmx2cm.
// Python: rf"(\d)\-?({'|'.join(units_list)})(?![a-wyzA-WYZ])"
export const QUANTITY_UNITS_PATTERN = new RegExp(
  `(\\p{Nd})-?(${unitsAlt})(?![a-wyzA-WYZ])`,
  "gu",
);
// Python: rf"({'|'.join(units_list)})(\d)"
export const UNITS_QUANTITY_PATTERN = new RegExp(`(${unitsAlt})(\\p{Nd})`, "gu");
// Python: rf"({'|'.join(units_list)})\-(\d)"
export const UNITS_HYPHEN_QUANTITY_PATTERN = new RegExp(`(${unitsAlt})-(\\p{Nd})`, "gu");
// Python (re.VERBOSE | re.IGNORECASE):
//   \b(<string numbers>)\b   # Capture string number
//   \-                       # Followed by hyphen
//   \b(<units_list>)\b       # Followed by unit
// NOTE: JS \b is ASCII-only vs Python's unicode \b — residual divergence risk
// next to non-ASCII word chars; flagged for the Task 8 parity gate.
export const STRING_QUANTITY_HYPHEN_PATTERN = new RegExp(
  `\\b(${stringNumbersAlt})\\b-\\b(${unitsAlt})\\b`,
  "gui",
);

// Regex pattern for matching a range in string format e.g. 1 to 2, 8.5 to 12,
// 4 or 5. Assumes fractions have been converted to the #1$2 form.
// Allows the range to include a hyphen, which are captured in separate groups.
// Captures the two numbers in the range in separate capture groups.
// If a number starts with a zero, it must be followed by decimal point to be
// matched.
// Python (re.VERBOSE):
//   (0\.[0-9]|[1-9][\d\.]*?|\d*\#\d+\$\d+)  # Capture number
//   \s* (\-)? \s* (to|or) \s* (\-)* \s*
//   ( (0\.[0-9]+|[1-9][\d\.]*?|\d*\#\d+\$\d+) (\-)? )
export const STRING_RANGE_PATTERN = new RegExp(
  "(0\\.[0-9]|[1-9][\\p{Nd}.]*?|\\p{Nd}*#\\p{Nd}+\\$\\p{Nd}+)" +
    "\\s*(-)?\\s*(to|or)\\s*(-)*\\s*" +
    "((0\\.[0-9]+|[1-9][\\p{Nd}.]*?|\\p{Nd}*#\\p{Nd}+\\$\\p{Nd}+)(-)?)",
  "gu",
);

// Regex pattern to match quantities split by "and" e.g. 1 and 1/2.
// Capture the whole match, and the quantities before and after the "and".
// Python: r"((\d+)\sand\s(\d/\d+))"
export const FRACTION_SPLIT_AND_PATTERN = /((\p{Nd}+)\sand\s(\p{Nd}\/\p{Nd}+))/gu;

// Regex pattern to match ranges where the unit appears after both quantities
// e.g. 100 g - 200 g. Assumes quantities and units have already been separated
// by a single space and that all numbers are decimals.
// Python (re.I | re.VERBOSE):
//   ( ([\d\.]+|\d*\#\d+\$\d+) \s ([a-zA-Z]+) \s* (?:\-|to|or) \s*
//     ([\d\.]+|\d*\#\d+\$\d+) \s ([a-zA-Z]+) )
export const DUPE_UNIT_RANGES_PATTERN = new RegExp(
  "(([\\p{Nd}.]+|\\p{Nd}*#\\p{Nd}+\\$\\p{Nd}+)\\s([a-zA-Z]+)\\s*(?:-|to|or)\\s*" +
    "([\\p{Nd}.]+|\\p{Nd}*#\\p{Nd}+\\$\\p{Nd}+)\\s([a-zA-Z]+))",
  "gui",
);

// Regex pattern to match a decimal number followed by an "x" followed by a
// space e.g. 0.5 x, 1 x, 2 x. The number is captured in a capture group.
// Python (re.VERBOSE):
//   ([\d\.]+|\d*\#\d+\$\d+)  \s  [xX]  \s*
export const QUANTITY_X_PATTERN = new RegExp(
  "([\\p{Nd}.]+|\\p{Nd}*#\\p{Nd}+\\$\\p{Nd}+)\\s[xX]\\s*",
  "gu",
);

// Regex pattern to match a range that has spaces between the numbers and hyphen
// e.g. 0.5 - 1. The numbers are captured in capture groups.
// Allow the second number to start with # to catch fractions e.g. #1$4 - #1$2.
// Python: r"(\d)\s*\-\s*([\d\#])"
export const EXPANDED_RANGE = /(\p{Nd})\s*-\s*([\p{Nd}#])/gu;

// Python: r"[a-z]"
export const LOWERCASE_PATTERN = /[a-z]/gu;
// Python: r"[A-Z]"
export const UPPERCASE_PATTERN = /[A-Z]/gu;
// Python: r"[0-9]"
export const DIGIT_PATTERN = /[0-9]/gu;

// Regex pattern to match a fraction token or a range formed by fractions.
// This is a token for a fraction where the forward slash has been replaced by $
// and any space between the whole part and fraction part has been replaced by #
// e.g. #1$2 for 1/2, or 1#1$3 for 1 1/3. The group at the end is optional, for
// capturing the upper end if the token is a range.
// Python: r"^\d*\#\d+\$\d+(?:\-\d*\#\d+\$\d+)?$"
export const FRACTION_TOKEN_PATTERN =
  /^\p{Nd}*#\p{Nd}+\$\p{Nd}+(?:-\p{Nd}*#\p{Nd}+\$\p{Nd}+)?$/u;

// Regex pattern to match currency within parentheses e.g. ($1.99)
// Allows optional white space after opening parenthesis, before currency
// symbol, and before closing parenthesis. Also allows the currency to be
// suffixed with any number of asterisk characters (seen on budgetbytes.com).
// Python: rf"\(\s*(?:{currency_pattern})\s*[0-9.,]+\**\s*\)"
// where currency_pattern = re.escape-joined ["$", "£", "€", "¥", "₹"].
export const CURRENCY_PATTERN = /\(\s*(?:\$|£|€|¥|₹)\s*[0-9.,]+\**\s*\)/gu;
