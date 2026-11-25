#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-i18n-contract.mjs...");

const transFile = readFileSync(join(root, "public", "translations.js"), "utf8");

// Extract translations catalog
const match = transFile.match(/window\.ATLAS_BN\s*=\s*({[\s\S]*?});/);
if (!match) {
  console.error("FAIL: Could not parse window.ATLAS_BN catalog in translations.js");
  process.exit(1);
}

let catalog;
try {
  // Safe evaluation
  catalog = (new Function(`return ${match[1]}`))();
} catch (e) {
  console.error("FAIL: Syntax error in translations catalog:", e);
  process.exit(1);
}

const keys = Object.keys(catalog);
console.log(`  Checking ${keys.length} Bengali translation entries...`);

if (keys.length < 30) {
  console.error(`FAIL: Insufficient translation catalog entries (${keys.length} < 30)`);
  process.exit(1);
}

for (const k of keys) {
  if (!catalog[k] || typeof catalog[k] !== "string" || catalog[k].trim() === "") {
    console.error(`FAIL: Translation key has empty translation: "${k}"`);
    process.exit(1);
  }
}

console.log("✓ test-i18n-contract.mjs passed: 100% translation key validity verified.");

// ── The language switch must be bound once, not twice ──────────────────────
// The same control appears in the header (wide screens) and in the Map menu
// (phones). The menu copy was bound twice, and a double binding on a
// toggle is not a double click: the first handler switched the language and
// the second switched it back, so the control on a phone did nothing at all.
// The failure is invisible in the header, which is why it needs a guard.
const i18n = readFileSync(join(root, "public", "i18n.js"), "utf8");
const index = readFileSync(join(root, "public", "index.html"), "utf8");

for (const id of ["language-toggle", "language-toggle-menu"]) {
  const bindings = [...i18n.matchAll(
    new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener`, "g"))].length;
  if (bindings !== 1) {
    console.error(
      `FAIL: the ${id} control has ${bindings} click bindings — a toggle bound twice switches the language and switches it back, so the control does nothing`);
    process.exit(1);
  }
  if (!index.includes(`id="${id}"`)) {
    console.error(`FAIL: public/index.html has no control with id "${id}"`);
    process.exit(1);
  }
}

// The two controls are the same switch, so they must be told the same thing.
const handlerFor = (id) => {
  const m = i18n.match(new RegExp(
    `getElementById\\('${id}'\\)\\?\\.addEventListener\\('click',\\s*\\(\\)\\s*=>\\s*set\\(([^)]*)\\)\\s*\\)`));
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
};
const headerHandler = handlerFor("language-toggle");
const menuHandler = handlerFor("language-toggle-menu");
if (!headerHandler || !menuHandler) {
  console.error("FAIL: the two language controls are not both wired to the language switch");
  process.exit(1);
}
if (headerHandler !== menuHandler) {
  console.error(
    `FAIL: the two language controls switch differently — the header sets ${headerHandler}, the menu sets ${menuHandler}`);
  process.exit(1);
}

console.log("✓ The language switch is bound once in the header and once in the Map menu.");

