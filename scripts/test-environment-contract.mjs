#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-environment-contract.mjs...");

const srcIndex = readFileSync(join(root, "src", "index.ts"), "utf8");

const REQUIRED_LAYER_PATTERNS = [
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  "VIIRS_SNPP_Aerosol_Optical_Depth_Deep_Blue_Daily",
  "VIIRS_SNPP_DayNightBand_ENCC",
  "MODIS_Combined_Flood_Water_250m",
  "api.rainviewer.com",
  "api.open-meteo.com",
  "air-quality-api.open-meteo.com"
];

for (const p of REQUIRED_LAYER_PATTERNS) {
  if (!srcIndex.includes(p)) {
    console.error(`FAIL: src/index.ts missing required environmental layer endpoint: ${p}`);
    process.exit(1);
  }
}

// Check coordinates bounds
if (!srcIndex.includes("23.8103") || !srcIndex.includes("90.4125")) {
  console.error("FAIL: src/index.ts missing authoritative Dhaka center coordinates (23.8103, 90.4125)");
  process.exit(1);
}

console.log("✓ test-environment-contract.mjs passed: NASA GIBS and open environmental endpoints verified.");
