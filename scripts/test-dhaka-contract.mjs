#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-dhaka-contract.mjs...");

// 1. Check dhaka-data.ts
const dhakaData = readFileSync(join(root, "src", "dhaka-data.ts"), "utf8");

const REQUIRED_RIVERS = [
  "Buriganga",
  "Turag",
  "Balu",
  "Shitalakshya",
  "Tongi Khal",
  "Dhaleshwari"
];

for (const r of REQUIRED_RIVERS) {
  if (!dhakaData.includes(r)) {
    console.error(`FAIL: src/dhaka-data.ts missing required peripheral river: ${r}`);
    process.exit(1);
  }
}

const REQUIRED_MACRO = [
  "RMG Knitwear Exports",
  "RMG Woven Garments Exports",
  "Inward Foreign Remittance",
  "Dhaka Stock Exchange DSEX Index",
  "Headline Inflation (CPI)",
  "Foreign Exchange Reserves (BPM6)"
];

for (const m of REQUIRED_MACRO) {
  if (!dhakaData.includes(m)) {
    console.error(`FAIL: src/dhaka-data.ts missing required macroeconomic indicator: ${m}`);
    process.exit(1);
  }
}

// 2. Check GeoJSON MRT stations count
const mrtGeoJson = JSON.parse(readFileSync(join(root, "public", "dhaka-mrt.geojson"), "utf8"));
const stations = mrtGeoJson.features.filter(f => f.properties.type === "metro_station");
console.log(`  MRT Line 6 stations verified: ${stations.length}`);
if (stations.length < 16) {
  console.error(`FAIL: Incomplete MRT stations list (${stations.length} < 16)`);
  process.exit(1);
}

console.log("✓ test-dhaka-contract.mjs passed: Rivers, Macro indicators, and Metro networks verified.");
