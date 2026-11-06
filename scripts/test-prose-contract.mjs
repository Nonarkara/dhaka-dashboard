/**
 * Prose contract: the documentation must be readable prose.
 *
 * The failure this catches is specific and it is silent. A number written
 * against a word with no space between them — "requires24consecutive",
 * "4,076footprints" — reads as a single nonsense token to a screen reader
 * and to anyone skimming. It survives review because the sentence around it
 * still parses, and it spreads through copy-paste edits.
 *
 * The scan is deliberately narrow: it looks only at prose, never at code
 * spans, code fences, URLs or file paths, and it allows identifiers that
 * genuinely run a number against a word (WGS84, EPSG 32646, commit hashes).
 * Everything else that runs together is a defect.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const FILES = [
  "README.md",
  "context.md",
  ...globSync("docs/**/*.md"),
];

/** Identifiers that legitimately run a number against a word. */
const ALLOWED = new Set([
  "wgs84", "sha256", "epsg3857", "epsg32646", "epsg4326", "utm46n",
  "jsr168", "worldpop2025", "element84", "threejsr168", "r2025a",
  "october30", "plate241", "z19", "z18", "z16", "z13", "z14", "z15", "z17",
  "geojson", "webgl", "openstreetmap", "shapefile", "epsg",
]);

/** Remove the parts of a markdown line that are not prose. */
function proseOf(line) {
  return line
    .replace(/```[\s\S]*$/, "")            // code fence
    .replace(/`[^`]*`/g, " ")              // inline code
    .replace(/\]\([^)]*\)/g, "] ")         // link targets
    .replace(/https?:\/\/\S+/g, " ")       // bare URLs
    .replace(/\b[\w-]+\.(?:gov\.bd|com|org|net|bd|io|dev)\b\S*/gi, " ")  // bare hosts
    .replace(/\b[0-9a-f]{6,}[0-9a-f-]*/gi, " ")  // hashes and worker ids
    .replace(/\b[\w./-]*\.(md|mjs|ts|js|json|geojson|png|sh|py)\b/g, " ");
}

/** A token that runs a number against a word, e.g. "requires24consecutive". */
function gluedTokens(text) {
  const found = [];
  for (const match of text.matchAll(/[A-Za-z]*\d+[A-Za-z]*|[A-Za-z]{3,}\d+|\d+[A-Za-z]{3,}/g)) {
    const token = match[0];
    if (!/\d/.test(token)) continue;
    if (!/[A-Za-z]{3,}/.test(token)) continue;      // numbers alone are fine
    const lower = token.toLowerCase();
    if (ALLOWED.has(lower)) continue;
    // A commit hash, a worker id or a build tag runs hex together already.
    if (/^[0-9a-f]{6,}$/i.test(token)) continue;
    found.push(token);
  }
  return found;
}

let checks = 0;
const offenders = [];

for (const file of FILES) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    for (const token of gluedTokens(proseOf(line))) {
      offenders.push(`${file}:${index + 1}: ${token}`);
    }
  });
  checks += 1;
}

assert.equal(
  offenders.length,
  0,
  `Glued number-and-word tokens in the documentation:\n  ${offenders.join("\n  ")}`,
);

console.log(`✓ Prose contract: ${checks} documents scanned — no number glued to a word in prose`);
