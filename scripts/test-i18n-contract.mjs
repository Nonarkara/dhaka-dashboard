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
