#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-theme-contract.mjs...");

const css = readFileSync(join(root, "public", "style.css"), "utf8");

const REQUIRED_THEME_SELECTORS = [
  ":root",
  ':root[data-theme="light"]',
  ':root[data-theme="contrast"]'
];

for (const sel of REQUIRED_THEME_SELECTORS) {
  if (!css.includes(sel)) {
    console.error(`FAIL: public/style.css missing theme selector: ${sel}`);
    process.exit(1);
  }
}

const REQUIRED_VARIABLES = [
  "--bg",
  "--line",
  "--ink",
  "--dim",
  "--accent",
  "--water",
  "--metro",
  "--ok",
  "--warn"
];

for (const v of REQUIRED_VARIABLES) {
  if (!css.includes(v + ":")) {
    console.error(`FAIL: public/style.css missing CSS variable definition: ${v}`);
    process.exit(1);
  }
}

console.log("✓ test-theme-contract.mjs passed: Wada Sanzo palette and theme definitions verified.");
