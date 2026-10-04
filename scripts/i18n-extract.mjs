// Lists every translatable string in the storefront: the first argument of tr("…") and msg("…").
// Usage: node scripts/i18n-extract.mjs            → prints the strings as JSON
//        node scripts/i18n-extract.mjs --missing  → prints, per language, the strings with no translation yet
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CALL = /\b(?:tr|msg)\(\s*("(?:[^"\\\n]|\\.)*")/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.includes(`${path.sep}i18n${path.sep}messages`)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Source strings in the order they are first met, without duplicates. */
export function extractStrings() {
  const found = new Set();
  for (const file of walk(path.join(root, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(CALL)) {
      const value = JSON.parse(m[1]);
      // The helper files mention tr("…") in their comments.
      if (value !== "…") found.add(value);
    }
  }
  return [...found];
}

/** Keys of a dictionary file (src/lib/i18n/messages/<locale>.ts), read without compiling it. */
export function dictionaryKeys(locale) {
  const text = fs.readFileSync(path.join(root, "src", "lib", "i18n", "messages", `${locale}.ts`), "utf8");
  return new Set([...text.matchAll(/^\s*("(?:[^"\\\n]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const strings = extractStrings();
  if (process.argv.includes("--missing")) {
    for (const locale of ["es", "fr", "de"]) {
      const have = dictionaryKeys(locale);
      const missing = strings.filter((s) => !have.has(s));
      console.log(`${locale}: ${missing.length} missing of ${strings.length}`);
      for (const s of missing) console.log(`  ${JSON.stringify(s)}`);
    }
  } else {
    console.log(JSON.stringify(strings, null, 1));
  }
}
