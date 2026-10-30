#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running verify-local.mjs preflight checks...");
const fixtures = readdirSync(join(root, 'public')).filter(name => name.startsWith('__'));
if (fixtures.length) throw Error(`Local preview fixtures must not ship: ${fixtures.join(', ')}`);

const REQUIRED_FILES = [
  "package.json",
  "tsconfig.json",
  "wrangler.toml",
  "src/index.ts",
  "src/rate-limit.ts",
  "src/dhaka-data.ts",
  "public/index.html",
  "public/research.html",
  "public/app.js",
  "public/people.js",
  "public/data/ddm-source-review.json",
  "public/data/people-manifest.json",
  "public/data/people-grid.json",
  "public/data/facilities.geojson",
  "public/dashboard.js",
  "public/i18n.js",
  "public/translations.js",
  "public/theme.js",
  "public/style.css",
  "public/dhaka-design.css",
  "public/favicon.svg",
  "public/dhaka-areas.json",
  "public/dhaka-landmarks.geojson",
  "public/dhaka-rivers.geojson",
  "public/dhaka-mrt.geojson",
  "public/data/parliament-buildings.geojson",
  "public/dhaka-economy.geojson",
  "public/vendor/maplibre-6.4.1/maplibre-gl.mjs",
  "public/vendor/maplibre-6.4.1/maplibre-gl.css",
  "scripts/fixtures/gibs-catalogue.json",
  "scripts/verify-gibs-live.mjs",
  "scripts/refresh-gibs-catalogue.mjs"
];

for (const f of REQUIRED_FILES) {
  const p = join(root, f);
  if (!existsSync(p)) {
    console.error(`FAIL: Required file missing: ${f}`);
    process.exit(1);
  }
}

// Validate JSON files
const JSON_FILES = [
  "public/dhaka-areas.json",
  "public/dhaka-landmarks.geojson",
  "public/dhaka-rivers.geojson",
  "public/dhaka-mrt.geojson",
  "public/data/parliament-buildings.geojson",
  "public/dhaka-economy.geojson"
];

for (const jf of JSON_FILES) {
  try {
    const raw = readFileSync(join(root, jf), "utf8");
    const parsed = JSON.parse(raw);
    if (jf.endsWith(".geojson")) {
      if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
        console.error(`FAIL: ${jf} is not a valid GeoJSON FeatureCollection`);
        process.exit(1);
      }
      console.log(`  ✓ ${jf}: valid GeoJSON with ${parsed.features.length} features`);
    } else {
      console.log(`  ✓ ${jf}: valid JSON`);
    }
  } catch (e) {
    console.error(`FAIL: Parsing error in ${jf}:`, e);
    process.exit(1);
  }
}

console.log("✓ verify-local.mjs passed: all files and datasets present and valid.");
