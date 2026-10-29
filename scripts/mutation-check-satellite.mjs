#!/usr/bin/env node
/**
 * Mutation check for the satellite contract.
 *
 * A green test proves nothing unless it can go red. This harness breaks the
 * code each assertion guards, one mutation at a time, and requires the test
 * to fail every time. It restores the original file after each mutation, so
 * the working tree is untouched when it finishes.
 *
 * Usage: node --import ./scripts/lib/ts-resolver.mjs scripts/mutation-check-satellite.mjs
 */

import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TEST = "scripts/test-satellite-contract.mjs";

/** Each mutation is a file, a search, a replacement, and what it breaks. */
const MUTATIONS = [
  {
    name: "a measured layer id that is not in the catalogue",
    file: "src/satellite.ts",
    find: 'id: "MODIS_Terra_L3_NDVI_16Day",',
    replace: 'id: "MODIS_Terra_L3_NDVI_16Day_TYPO",',
  },
  {
    name: "a measured layer published at the wrong tile level",
    file: "src/satellite.ts",
    find: '    tileLevel: 9,\n    unit: "1",\n    label: "Vegetation index",',
    replace: '    tileLevel: 6,\n    unit: "1",\n    label: "Vegetation index",',
  },
  {
    name: "a colour map removed for a measured layer",
    file: "src/gibs-colormaps.ts",
    find: '  "MODIS_Terra_L3_NDVI_16Day": {',
    replace: '  "MODIS_Terra_L3_NDVI_16Day_RENAMED": {',
  },
  {
    name: "a colour map with the wrong unit",
    file: "src/gibs-colormaps.ts",
    find: '  "MODIS_Terra_Land_Surface_Temp_Day_TES": {\n    units: "K",',
    replace: '  "MODIS_Terra_Land_Surface_Temp_Day_TES": {\n    units: "W",',
  },
  {
    name: "the open-ended colour-map bin treated as a midpoint",
    file: "src/satellite.ts",
    find: "  if (hi >= 99999) return { value: lo, lowerBound: true };",
    replace: "  if (hi >= 1e12) return { value: lo, lowerBound: true };",
  },
  {
    name: "the window addressing the wrong tile",
    file: "src/satellite.ts",
    find: "  const x0 = Math.floor((gx - radiusPx) / TILE_SIZE);",
    replace: "  const x0 = Math.floor((gx - radiusPx) / (TILE_SIZE * 1000));",
  },
  {
    name: "a domain with no Bengali text",
    file: "src/satellite.ts",
    find: '    label: "Energy",\n    label_bn: "জ্বালানি",',
    replace: '    label: "Energy",\n    label_bn: "",',
  },
  {
    name: "a ranking computed inside one district instead of across the city",
    file: "src/collage.ts",
    find: "  const ranks = rankAcrossCity(perDistrict);",
    replace: "  const ranks = new Map<string, { rank: number; of: number; tied: number }>();\n  for (const [district, measurements] of perDistrict) {\n    for (const m of measurements) {\n      if (m.status === 'ok' && m.value !== null) {\n        ranks.set(`${district}|${rankKey(m)}`, { rank: 1, of: 1, tied: 0 });\n      }\n    }\n  }",
  },
  {
    name: "a reading that falls back to the raw unit in one language",
    file: "src/collage.ts",
    find: "  const shownBn = showValue(best.value, best.unit, spec?.displayBn ?? spec?.display);",
    replace: "  const shownBn = showValue(best.value, best.unit, spec?.displayBn);",
  },
  {
    name: "a reading that claims a rate of change it did not measure",
    file: "src/collage.ts",
    find: 'lowNote: "the lowest sampled night-time surface temperature",',
    replace: 'lowNote: "the fastest night-time cooling in the city",',
  },
  {
    name: "a failed tile cached for the life of the isolate",
    file: "src/satellite.ts",
    find: "  tileCache.set(key, {value:result, expires:Date.now() + (result ? 30*60000 : 60000)});",
    replace: "  tileCache.set(key, {value:result, expires:Date.now() + (result ? 30*60000 : 3600*60000)});",
  },
  {
    name: "an unsourced workforce figure back in the economy registry",
    file: "public/dhaka-economy.geojson",
    // Replace the null in place. Inserting a second key with the same name
    // would not mutate anything: in JSON the last occurrence wins, so the
    // null would still be the value the test sees.
    find: '"sector": "RMG & Electronics Export",\n        "workforce": null,',
    replace: '"sector": "RMG & Electronics Export",\n        "workforce": 95000,',
  },
  {
    name: "an unsourced dollar figure back in a district description",
    file: "public/dhaka-areas.json",
    find: '"description": "The manufacturing heart of Bangladesh\'s Ready-Made Garment (RMG) export economy',
    replace: '"description": "The manufacturing heart of Bangladesh\'s $47B Ready-Made Garment (RMG) export economy',
  },
];

function runTest() {
  try {
    execFileSync("node", ["--import", "./scripts/lib/ts-resolver.mjs", TEST], {
      stdio: "pipe",
      encoding: "utf8",
    });
    return { failed: false, output: "" };
  } catch (err) {
    return { failed: true, output: `${err.stdout || ""}${err.stderr || ""}` };
  }
}

let failures = 0;

// The harness must leave the tree as it found it even if it dies partway
// through, so the restore runs in a finally block.
const restoreQueue = [];
process.on("exit", () => {
  for (const [backup, file] of restoreQueue) {
    try { copyFileSync(backup, file); rmSync(backup, { force: true }); } catch { /* best effort */ }
  }
});

try {
for (const mutation of MUTATIONS) {
  const { file, find, replace } = mutation;
  if (!existsSync(file)) {
    console.error(`✗ ${mutation.name}: ${file} is missing`);
    failures++;
    continue;
  }

  const backup = `/tmp/mutation-${process.pid}-${file.replace(/[^a-z0-9]/gi, "_")}`;
  const original = readFileSync(file, "utf8");
  // Keep the pristine copy outside the repository, and restore from it after
  // the mutation. copyFileSync copies in the direction it is given, so the
  // restore is backup → file.
  copyFileSync(file, backup);
  restoreQueue.push([backup, file]);

  if (!original.includes(find)) {
    console.error(`✗ ${mutation.name}: the anchor text was not found in ${file}`);
    failures++;
    copyFileSync(backup, file);
    restoreQueue.pop();
    rmSync(backup, { force: true });
    continue;
  }

  writeFileSync(file, original.replace(find, replace));
  const result = runTest();
  copyFileSync(backup, file);
  restoreQueue.pop();
  rmSync(backup, { force: true });

  if (!result.failed) {
    console.error(`✗ ${mutation.name}: the test still passed — the guard does not bite`);
    failures++;
  } else {
    const line =
      result.output.split("\n").find(l => l.includes("AssertionError")) ||
      result.output.split("\n")[0];
    console.log(`✓ ${mutation.name}\n    → ${line.trim().slice(0, 130)}`);
  }
}
} finally {
  for (const [backup, file] of restoreQueue) {
    try { copyFileSync(backup, file); rmSync(backup, { force: true }); } catch { /* best effort */ }
  }
}

if (failures) {
  console.error(`✗ ${failures} mutation(s) survived the contract test`);
  process.exit(1);
}
console.log(`✓ All ${MUTATIONS.length} mutations were caught by the contract test`);
