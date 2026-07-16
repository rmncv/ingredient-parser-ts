#!/usr/bin/env node
/**
 * CLI entrypoint. Parse one or more ingredient sentences and print the
 * structured result as JSON.
 *
 *   ingredient-parser "3 pounds pork shoulder, cut into 2-inch chunks"
 *   ingredient-parser "a pinch of salt" "2 large eggs, beaten"
 *
 * A single sentence prints one object (via `parseIngredient`); two or more
 * print a JSON array (via `parseMultipleIngredients`).
 */
import { parseIngredient, parseMultipleIngredients } from "./index.js";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  const usage = [
    "Usage: ingredient-parser <sentence> [sentence...]",
    "",
    "Parse recipe ingredient sentences into structured JSON.",
    "",
    "Examples:",
    '  ingredient-parser "3 pounds pork shoulder, cut into 2-inch chunks"',
    '  ingredient-parser "a pinch of salt" "2 large eggs, beaten"',
  ].join("\n");
  // No args is an error; explicit help request is not.
  const help = args.length === 0;
  (help ? console.error : console.log)(usage);
  process.exit(help ? 1 : 0);
}

const result =
  args.length === 1
    ? parseIngredient(args[0])
    : parseMultipleIngredients(args);

console.log(JSON.stringify(result, null, 2));
