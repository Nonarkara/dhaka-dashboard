#!/usr/bin/env node
/**
 * Audit the atlas for numbers presented as facts with no upstream.
 *
 * A number in a data readout is fine when it names its source and its date.
 * A number in a sentence — "3,000 trucks nightly", "500-acre zone" — reads
 * exactly like data and carries nothing, so it is a fabrication dressed as
 * description.
 *
 * This scans the prose fields of the project's own data files and lists every
 * numeric claim, so each one can be judged: either it gets a source, or it
 * comes out of the sentence.
 *
 * Usage: node scripts/audit-prose-numbers.mjs [--verbose]
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Prose fields where a bare number is a claim rather than data. */
const PROSE_FIELDS = new Set([
  "description",
  "description_bn",
  "note",
  "note_bn",
  "desc",
  "tooltip",
  "summary",
  "story",
]);

const findings = [];

function scanText(text, where, field) {
  if (!text || typeof text !== "string") return;
  // Numbers written out as words, and digit groups with a unit, count.
  const pattern = /(\d[\d,.]*)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const around = text.slice(Math.max(0, match.index - 60), match.index + 60).replace(/\s+/g, " ").trim();
    findings.push({ where, field, number: match[1], context: around });
  }
}

function scanObject(obj, where) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => scanObject(item, `${where}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (PROSE_FIELDS.has(key)) scanText(value, where, key);
    else if (value && typeof value === "object") scanObject(value, `${where}.${key}`);
  }
}

for (const file of readdirSync(join(ROOT, "public")).filter((f) => f.endsWith(".geojson"))) {
  const data = JSON.parse(readFileSync(join(ROOT, "public", file), "utf8"));
  (data.features ?? []).forEach((f, i) => scanObject(f, `public/${file}#${i}`));
}

for (const file of ["public/dhaka-areas.json", "public/data/parliament-buildings.geojson"]) {
  try {
    const data = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
    if (Array.isArray(data)) data.forEach((d, i) => scanObject(d, `${file}#${i}`));
    else scanObject(data, file);
  } catch {
    // A file that is not present is not a finding.
  }
}

// The TypeScript data module: notes and descriptions there are prose too.
const dhakaData = readFileSync(join(ROOT, "src", "dhaka-data.ts"), "utf8");
for (const m of dhakaData.matchAll(/(?:note|description)(?:_bn)?\s*:\s*[`'"]([^`'"]*)[`'"]/g)) {
  const field = m[0].startsWith("note_bn") ? "note_bn" : m[0].startsWith("note") ? "note" : "description";
  scanText(m[1], "src/dhaka-data.ts", field);
}

// The client lens descriptions.
const appJs = readFileSync(join(ROOT, "public", "app.js"), "utf8");
for (const m of appJs.matchAll(/\bdesc\s*:\s*"([^"]*)"/g)) {
  scanText(m[1], "public/app.js", "desc");
}

const verbose = process.argv.includes("--verbose");
const seen = new Set();
const unique = findings.filter((f) => {
  const key = `${f.where}|${f.field}|${f.number}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`Numeric claims in prose fields: ${unique.length}`);
for (const f of unique) {
  console.log(`\n${f.where}  [${f.field}]  → ${f.number}`);
  if (verbose) console.log(`   …${f.context}…`);
}
