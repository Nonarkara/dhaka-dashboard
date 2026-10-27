#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running smoke-atlas.mjs static page checks...");

const indexHtml = readFileSync(join(root, "public", "index.html"), "utf8");
const researchHtml = readFileSync(join(root, "public", "research.html"), "utf8");

if (!indexHtml.includes("DHKx") || !indexHtml.includes("Dhaka")) {
  console.error("FAIL: index.html missing DHKx brand or title");
  process.exit(1);
}

if (!researchHtml.includes("Methodology") || !researchHtml.includes("Provenance")) {
  console.error("FAIL: research.html missing methodology text");
  process.exit(1);
}

console.log("✓ smoke-atlas.mjs passed: Static app entry points verified.");
