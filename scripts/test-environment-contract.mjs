#!/usr/bin/env node
/**
 * Environmental layer contract.
 *
 * The old version of this test grepped src/index.ts for endpoint strings. That
 * proves a string is present, not that a tile ever comes back — and two GIBS
 * layers shipped for months while every tile they referenced returned 404 or
 * 400, because one layer id never existed and the other stopped publishing in
 * 2023.
 *
 * This test validates every GIBS layer the app uses against the NASA GIBS WMTS
 * capabilities catalogue (scripts/fixtures/gibs-catalogue.json):
 *   - the layer id must exist in GIBS
 *   - the tile matrix set must be one that layer publishes
 *   - the file format must match that layer
 *   - the layer must still be publishing observations inside the window the
 *     app probes for them
 *   - the client and the Worker must reference the same layer set
 *
 * Refresh the fixture with: node scripts/refresh-gibs-catalogue.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("==> Running test-environment-contract.mjs...");

const failures = [];
const fail = (msg) => failures.push(msg);

const catalogue = JSON.parse(
  readFileSync(join(root, "scripts/fixtures/gibs-catalogue.json"), "utf8"),
);

const FORMAT_BY_EXT = { png: "image/png", jpg: "image/jpeg" };

// ── Client registry (public/app.js) ────────────────────────────────────────
const appJs = readFileSync(join(root, "public", "app.js"), "utf8");
const clientRegion = appJs.slice(
  appJs.indexOf("const GIBS_LAYERS"),
  appJs.indexOf("const gibsObservationCache"),
);
const clientLayers = [];
for (const m of clientRegion.matchAll(
  /layer:\s*"([A-Za-z0-9_-]+)"[\s\S]*?level:\s*(\d+)[\s\S]*?ext:\s*"(png|jpg)"[\s\S]*?probe:\s*\{\s*z:\s*(\d+),\s*y:\s*(\d+),\s*x:\s*(\d+)\s*\}/g,
)) {
  clientLayers.push({
    id: m[1],
    level: Number(m[2]),
    ext: m[3],
    probe: { z: Number(m[4]), y: Number(m[5]), x: Number(m[6]) },
  });
}

// ── Worker registry (src/index.ts) ─────────────────────────────────────────
const srcIndex = readFileSync(join(root, "src", "index.ts"), "utf8");
const serverRegion = srcIndex.slice(
  srcIndex.indexOf("const GIBS_LAYERS"),
  srcIndex.indexOf("function gibsTemplate"),
);
const serverLayers = [];
for (const m of serverRegion.matchAll(
  /id:\s*"([A-Za-z0-9_-]+)"[\s\S]*?tileLevel:\s*(\d+)[\s\S]*?format:\s*"(png|jpg)"[\s\S]*?probe:\s*\{\s*z:\s*(\d+),\s*y:\s*(\d+),\s*x:\s*(\d+)\s*\}/g,
)) {
  serverLayers.push({
    id: m[1],
    level: Number(m[2]),
    ext: m[3],
    probe: { z: Number(m[4]), y: Number(m[5]), x: Number(m[6]) },
  });
}

// A registry entry that the parser above cannot read is an entry that was never
// validated. Count the declared entries independently and fail if any of them
// fell through — a silently skipped layer reads as a passing test.
const declaredClient = (clientRegion.match(/layer:\s*"/g) || []).length;
const declaredServer = (serverRegion.match(/id:\s*"/g) || []).length;
if (clientLayers.length !== declaredClient) {
  fail(
    `public/app.js: parsed ${clientLayers.length} of ${declaredClient} GIBS_LAYERS entries — ` +
      `an entry was not validated by this test.`,
  );
}
if (serverLayers.length !== declaredServer) {
  fail(
    `src/index.ts: parsed ${serverLayers.length} of ${declaredServer} GIBS_LAYERS entries — ` +
      `an entry was not validated by this test.`,
  );
}

if (clientLayers.length === 0) fail("public/app.js: GIBS_LAYERS registry not found or empty");
if (serverLayers.length === 0) fail("src/index.ts: GIBS_LAYERS registry not found or empty");

// ── Catalogue validation ───────────────────────────────────────────────────
const captured = new Date(`${catalogue.captured}T00:00:00Z`).getTime();
const windowDays = catalogue.observationWindowDays || 4;
const windowMs = windowDays * 86400000;

function validateLayers(label, layers) {
  for (const spec of layers) {
    const layer = catalogue.layers[spec.id];
    if (!layer) {
      fail(
        `${label}: GIBS layer "${spec.id}" does not exist in the GIBS capabilities catalogue ` +
          `(captured ${catalogue.captured}). Every tile for this id fails to load.`,
      );
      continue;
    }
    const tms = `GoogleMapsCompatible_Level${spec.level}`;
    if (!layer.tileMatrixSets.includes(tms)) {
      fail(
        `${label}: GIBS layer "${spec.id}" does not publish ${tms} ` +
          `(it publishes: ${layer.tileMatrixSets.join(", ") || "none"}).`,
      );
    }
    const wanted = FORMAT_BY_EXT[spec.ext];
    if (!layer.formats.includes(wanted)) {
      fail(
        `${label}: GIBS layer "${spec.id}" does not publish ${wanted} ` +
          `(it publishes: ${layer.formats.join(", ") || "none"}).`,
      );
    }
    if (layer.latest) {
      const age = captured - new Date(`${layer.latest}T00:00:00Z`).getTime();
      if (age > windowMs) {
        fail(
          `${label}: GIBS layer "${spec.id}" stopped publishing observations on ${layer.latest} ` +
            `— ${Math.round(age / 86400000)} days before the catalogue capture, beyond the ` +
            `${windowDays}-day window the app probes.`,
        );
      }
    } else {
      fail(`${label}: GIBS layer "${spec.id}" publishes no dated observations in the catalogue.`);
    }
    // A probe tile must exist on the matrix it claims to address.
    if (spec.probe.z > spec.level) {
      fail(
        `${label}: GIBS layer "${spec.id}" probe uses z=${spec.probe.z} beyond ${tms} ` +
          `(matrix supports z <= ${spec.level}).`,
      );
    }
    const span = 2 ** spec.probe.z;
    if (spec.probe.x >= span || spec.probe.y >= span) {
      fail(
        `${label}: GIBS layer "${spec.id}" probe tile (${spec.probe.x},${spec.probe.y}) is ` +
          `outside the ${span}x${span} matrix at z=${spec.probe.z}.`,
      );
    }
  }
}

validateLayers("public/app.js", clientLayers);
validateLayers("src/index.ts", serverLayers);

// ── Client and Worker must agree on the layer set ──────────────────────────
const clientIds = clientLayers.map((l) => l.id).sort();
const serverIds = serverLayers.map((l) => l.id).sort();
if (clientIds.join(",") !== serverIds.join(",")) {
  fail(
    `GIBS layer sets disagree — client [${clientIds.join(", ")}] vs Worker [${serverIds.join(", ")}].`,
  );
}

// ── The Worker's catalogue summary must not drift from the fixture ─────────
// src/gibs-catalogue.ts is generated from the capabilities document; if it
// and the vendored fixture disagree, one of them was edited by hand.
const catalogueModule = readFileSync(join(root, "src", "gibs-catalogue.ts"), "utf8");
const summaryEntries = {};
for (const m of catalogueModule.matchAll(/"([A-Za-z0-9_-]+)":\s*"(\d{4}-\d{2}-\d{2})"/g)) {
  summaryEntries[m[1]] = m[2];
}
if (!Object.keys(summaryEntries).length) {
  fail("src/gibs-catalogue.ts: no layer dates found — regenerate with npm run catalogue:gibs");
}
for (const [id, date] of Object.entries(summaryEntries)) {
  const layer = catalogue.layers[id];
  if (!layer) {
    fail(`src/gibs-catalogue.ts: layer "${id}" is not in the GIBS capabilities catalogue`);
    continue;
  }
  if (layer.latest !== date) {
    fail(
      `src/gibs-catalogue.ts: layer "${id}" records ${date} but the catalogue says ${layer.latest} — ` +
        `regenerate with npm run catalogue:gibs`,
    );
  }
}

// ── Retired layer ids must not reappear ────────────────────────────────────
// These are layer ids that were once written into this codebase. One never
// existed in GIBS; the other was retired by NASA in 2023. Both return 404/400
// on every tile and every date, so the overlay renders blank.
const RETIRED = {
  MODIS_Combined_Flood_Water_250m: "never existed in the GIBS catalogue",
  VIIRS_SNPP_Aerosol_Optical_Depth_Deep_Blue_Daily: "never existed in the GIBS catalogue",
  VIIRS_SNPP_DayNightBand_ENCC: "retired by NASA on 2023-07-07",
};
for (const [id, why] of Object.entries(RETIRED)) {
  for (const [label, src] of [
    ["public/app.js", appJs],
    ["src/index.ts", srcIndex],
  ]) {
    if (src.includes(id)) {
      fail(`${label}: references GIBS layer "${id}" which ${why}.`);
    }
  }
}

// ── Non-GIBS environmental endpoints ───────────────────────────────────────
// These are reached from whichever side owns them: the Worker serves the
// Open-Meteo models, the browser reaches RainViewer directly.
const REQUIRED_ENDPOINT_PATTERNS = [
  "api.rainviewer.com",
  "api.open-meteo.com",
  "air-quality-api.open-meteo.com",
];
const codebase = `${appJs}\n${srcIndex}`;
for (const p of REQUIRED_ENDPOINT_PATTERNS) {
  if (!codebase.includes(p)) {
    fail(`missing required environmental layer endpoint: ${p}`);
  }
}

// Authoritative Dhaka centre coordinates.
if (!srcIndex.includes("23.8103") || !srcIndex.includes("90.4125")) {
  fail("src/index.ts missing authoritative Dhaka center coordinates (23.8103, 90.4125)");
}

// ── Report ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error("FAIL: environmental layer contract violated:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `✓ test-environment-contract.mjs passed: ${clientLayers.length} GIBS layers verified against the ` +
    `GIBS capabilities catalogue (${catalogue.layerCount} layers, captured ${catalogue.captured}); ` +
    `${REQUIRED_ENDPOINT_PATTERNS.length} environmental endpoints present.`,
);
