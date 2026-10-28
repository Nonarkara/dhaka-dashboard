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
import { tileHasData } from "./lib/png-decode.mjs";

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
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      ok: buf.byteLength > 0,
      status: res.status,
      bytes: buf.byteLength,
      type: res.headers.get("content-type"),
      buf,
    };
  } catch (err) {
    return { ok: false, status: 0, bytes: 0, type: null, error: String(err) };
  }
}

// GIBS serves a fully blank placeholder tile for a date whose observation has
// not been ingested yet — HTTP 200, non-empty, opaque, one uniform colour.
// A status or byte check accepts it; only decoding it tells the truth.
async function carriesData(tile) {
  if (!tile.ok) return false;
  if (tile.type && !tile.type.startsWith("image/")) return false;
  if (tile.type && tile.type.includes("jpeg")) return true; // decoded in the browser, not here
  try {
    const verdict = await tileHasData(tile.buf);
    return verdict.hasData;
  } catch {
    return false;
  }
}

const failures = [];

for (const spec of specs) {
  // The undated path is what the browser requests when no date is pinned.
  const latest = await fetchTile(tileUrl(spec, null));
  if (!latest.ok) {
    failures.push(
      `${spec.id}: latest tile returned ${latest.status}${latest.error ? ` (${latest.error})` : ""} — ${latest.bytes} bytes`,
    );
    console.log(`  ✗ ${spec.id}: HTTP ${latest.status}, ${latest.bytes} bytes`);
    continue;
  }
  if (!latest.type || !latest.type.startsWith("image/")) {
    failures.push(`${spec.id}: tile content-type was "${latest.type}", expected an image`);
  }
  const latestHasData = await carriesData(latest);
  if (!latestHasData) {
    // The undated path is only the client's fallback; it renders the dated
    // template when a dated observation exists. A blank here is worth saying
    // out loud but is not a failure on its own.
    console.log(
      `    note: ${spec.id} undated "latest" path is a blank placeholder (GIBS has not ` +
        `ingested the newest observation)`,
    );
  }

  // Find the newest dated observation that actually carries data.
  let dated = null;
  const blanks = [];
  for (let back = 0; back < 4; back++) {
    const date = new Date(Date.now() - back * 86400000).toISOString().split("T")[0];
    const r = await fetchTile(tileUrl(spec, date));
    if (!r.ok) continue;
    if (await carriesData(r)) {
      dated = date;
      break;
    }
    blanks.push(date);
  }
  if (!dated) {
    failures.push(
      `${spec.id}: no dated observation with data in the last 4 days` +
        (blanks.length ? ` (blank placeholders for ${blanks.join(", ")})` : ""),
    );
  }
  console.log(
    `  ✓ ${spec.id}: ${latest.bytes} bytes, ${latest.type}, observation ${dated ?? "none with data"}` +
      (blanks.length ? ` (placeholder dates rejected: ${blanks.join(", ")})` : ""),
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
