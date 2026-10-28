#!/usr/bin/env node
/**
 * Live NASA GIBS tile verification.
 *
 * The offline contract test proves the layer ids are real and the tile matrix
 * sets are right. This proves the bytes still arrive: it fetches the actual
 * tile over Dhaka for every configured layer and asserts a non-empty image
 * comes back. A layer that has been retired, renamed, or throttled upstream
 * fails here instead of rendering a blank raster on the live map.
 *
 * Usage:
 *   node scripts/verify-gibs-live.mjs                  # upstream tiles only
 *   node scripts/verify-gibs-live.mjs --api <base-url> # also check the deployed API
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const apiIndex = process.argv.indexOf("--api");
const apiBase = apiIndex !== -1 ? process.argv[apiIndex + 1] : null;

console.log("==> Running verify-gibs-live.mjs...");

const appJs = readFileSync(join(root, "public", "app.js"), "utf8");
const region = appJs.slice(
  appJs.indexOf("const GIBS_LAYERS"),
  appJs.indexOf("const gibsObservationCache"),
);

const specs = [];
for (const m of region.matchAll(
  /layer:\s*"([A-Za-z0-9_-]+)"[\s\S]*?level:\s*(\d+)[\s\S]*?ext:\s*"(png|jpg)"[\s\S]*?probe:\s*\{\s*z:\s*(\d+),\s*y:\s*(\d+),\s*x:\s*(\d+)\s*\}/g,
)) {
  specs.push({
    id: m[1],
    level: Number(m[2]),
    ext: m[3],
    probe: { z: Number(m[4]), y: Number(m[5]), x: Number(m[6]) },
  });
}

if (!specs.length) {
  console.error("FAIL: no GIBS layers found in public/app.js");
  process.exit(1);
}

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

function tileUrl(spec, date) {
  const t = date ? `${date}/` : "";
  return `${GIBS_BASE}/${spec.id}/default/${t}GoogleMapsCompatible_Level${spec.level}/${spec.probe.z}/${spec.probe.y}/${spec.probe.x}.${spec.ext}`;
}

async function fetchTile(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) return { ok: false, status: res.status, bytes: 0, type: null };
    const buf = await res.arrayBuffer();
    return {
      ok: buf.byteLength > 0,
      status: res.status,
      bytes: buf.byteLength,
      type: res.headers.get("content-type"),
    };
  } catch (err) {
    return { ok: false, status: 0, bytes: 0, type: null, error: String(err) };
  }
}

const failures = [];

for (const spec of specs) {
  // The undated path is what the browser requests; it must serve the latest
  // available observation.
  const latest = await fetchTile(tileUrl(spec, null));
  if (!latest.ok) {
    failures.push(
      `${spec.id}: latest tile returned ${latest.status}${latest.error ? ` (${latest.error})` : ""} — ${latest.bytes} bytes`,
    );
    console.log(`  ✗ ${spec.id}: HTTP ${latest.status}, ${latest.bytes} bytes`);
    continue;
  }
  if (!String(latest.type || "").startsWith("image/")) {
    failures.push(`${spec.id}: tile content-type was "${latest.type}", expected an image`);
  }

  // Find the newest dated observation for the label.
  let dated = null;
  for (let back = 0; back < 4 && !dated; back++) {
    const date = new Date(Date.now() - back * 86400000).toISOString().split("T")[0];
    const r = await fetchTile(tileUrl(spec, date));
    if (r.ok) dated = date;
  }
  if (!dated) {
    failures.push(`${spec.id}: no dated observation in the last 4 days`);
  }
  console.log(
    `  ✓ ${spec.id}: ${latest.bytes} bytes, ${latest.type}, observation ${dated ?? "date unresolved"}`,
  );
}

if (apiBase) {
  const url = `${apiBase.replace(/\/$/, "")}/api/atlas/environment`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const body = await res.json();
    if (body.status !== "ok") {
      failures.push(`deployed /api/atlas/environment status "${body.status}" (${body.reasonCode})`);
    }
    for (const layer of body.layers ?? []) {
      if (layer.status !== "ok") {
        failures.push(`deployed API layer ${layer.id} status "${layer.status}" (${layer.reasonCode})`);
      } else {
        console.log(`  ✓ deployed API ${layer.id}: ok, latest ${layer.latest_date ?? "unresolved"}`);
      }
    }
  } catch (err) {
    failures.push(`deployed /api/atlas/environment unreachable: ${err}`);
  }
}

if (failures.length) {
  console.error("FAIL: live GIBS verification failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `✓ verify-gibs-live.mjs passed: ${specs.length} GIBS layers serve live imagery over Dhaka` +
    (apiBase ? ` and the deployed API reports every layer ok.` : "."),
);
