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

// The type scale is three sizes, and the browser's own <small> is a fourth
// one at 10.83px. A desk that renders a secondary line without saying what
// size it wants puts that size on the page, so the element is pinned to the
// micro scale by the stylesheet.
if (!/small\s*\{[^}]*font-size:\s*var\(--text-micro\)/.test(css)) {
  console.error("FAIL: public/style.css must pin <small> to the micro type size");
  process.exit(1);
}

// No element may name a pixel size directly: the scale lives in the tokens.
const hardCoded = css.match(/font-size:\s*\d+(?:\.\d+)?px/g) || [];
if (hardCoded.length) {
  console.error(`FAIL: public/style.css names pixel font sizes directly: ${hardCoded.join(", ")}`);
  process.exit(1);
}

console.log("✓ test-theme-contract.mjs passed: Wada Sanzo palette, theme definitions and the three-size type scale verified.");
