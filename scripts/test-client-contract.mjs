#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-client-contract.mjs...");

const html = readFileSync(join(root, "public", "index.html"), "utf8");

const REQUIRED_DOM_ELEMENTS = [
  'id="atlas-map"',
  'id="atlas-lenses"',
  'id="atlas-lens-title"',
  'id="atlas-lens-description"',
  'id="atlas-watch"',
  'id="atlas-view"',
  'id="atlas-basemap"',
  'id="atlas-theme"',
  'id="language-toggle"',
  'id="quick-jump-dialog"',
  'id="flood-dialog"',
  'id="air-dialog"',
  'id="economy-dialog"',
  'id="transit-dialog"',
  'class="atlas-skip"'
];

for (const el of REQUIRED_DOM_ELEMENTS) {
  if (!html.includes(el)) {
    console.error(`FAIL: public/index.html missing required DOM element: ${el}`);
    process.exit(1);
  }
}

// Check Accessibility & Mobile contracts
if (!html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0"')) {
  console.error("FAIL: Missing standard responsive viewport meta tag");
  process.exit(1);
}

if (!html.includes("<noscript>")) {
  console.error("FAIL: Missing noscript graceful degradation block");
  process.exit(1);
}

console.log("✓ test-client-contract.mjs passed: DOM and accessibility contracts verified.");
