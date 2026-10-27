#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-anti-slop-design.mjs...");

// 1. Scan for banned generic placeholder words
const FORBIDDEN_WORDS = [
  "lorem ipsum",
  "coming soon",
  "placeholder text",
  "todo: add",
  "tbd"
];

function checkDir(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === "vendor") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      checkDir(full);
    } else if (/\.(html|js|mjs|ts|json|geojson)$/.test(entry)) {
      const content = readFileSync(full, "utf8").toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        if (content.includes(word)) {
          console.error(`FAIL: Forbidden filler word "${word}" found in ${full}`);
          process.exit(1);
        }
      }
    }
  }
}

checkDir(join(root, "public"));
checkDir(join(root, "src"));

// 2. Check CSS for zero border radius and zero box shadow rules
const css = readFileSync(join(root, "public", "style.css"), "utf8");
if (!css.includes("border-radius: 0 !important") || !css.includes("box-shadow: none !important")) {
  console.error("FAIL: public/style.css must enforce 'border-radius: 0 !important' and 'box-shadow: none !important'");
  process.exit(1);
}

console.log("✓ test-anti-slop-design.mjs passed: No AI slop or generic placeholders; sharp modernist geometry enforced.");
