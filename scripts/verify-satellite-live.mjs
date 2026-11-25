#!/usr/bin/env node
/**
 * Live satellite verification.
 *
 * The contract test proves the measurement chain is sound against the
 * catalogue and the colour maps. This proves the chain still works against
 * the live upstream: it measures the real districts over real GIBS tiles and
 * requires that the values come back with a date, a unit and a resolution.
 *
 * It is a release gate rather than a unit test because it depends on NASA's
 * servers being up and on the sky over Dhaka being clear enough for at least
 * some of the instruments to see something.
 *
 * Usage: node --import ./scripts/lib/ts-resolver.mjs scripts/verify-satellite-live.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const { validateCollagePublication } = await import("../src/publication-contract.ts");
const { MEASURED_LAYERS } = await import("../src/satellite.ts");

function gateResult(result) {
  if (process.env.DHAKA_GATE_RESULT_PATH) writeFileSync(process.env.DHAKA_GATE_RESULT_PATH, JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2));
}
async function verify() {
const areas = JSON.parse(readFileSync("public/dhaka-areas.json", "utf8"));
const districts = areas.map(a => ({
  id: a.id, name: a.name, name_bn: a.name_bn,
  category: a.category ?? "", lat: a.lat, lng: a.lng,
}));

console.log(`Reading stored measurements for ${districts.length} places over ${MEASURED_LAYERS.length} satellite signals…`);
const started = Date.now();
const response = await fetch(new URL('/api/atlas/collage',process.env.ATLAS_URL || 'https://dhaka.nonarkara.org'),{signal:AbortSignal.timeout(30000)});
assert.ok(response.ok, 'published snapshot endpoint unavailable');
const collage = await response.json();
validateCollagePublication(collage);
assert.equal(collage.delivery?.source,'persistent-snapshot');
assert.ok(collage.delivery.ageSeconds>=0);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`status ${collage.status} · ${collage.measured}/${collage.total} measurements · ${seconds}s`);
for (const d of collage.districts) {
  for (const m of d.measurements) {
    const shown = m.status === "ok"
      ? `${m.value} ${m.unit} · ${m.observationDate || `static ${m.vintage}`} · ${m.resolutionM} m`
      : `unavailable · ${m.reasonCode}`;
    console.log(`  ${d.id.padEnd(16)} ${m.label.padEnd(24)} ${shown}`);
  }
}

// The gate: the collage must measure something, and what it measures must be
// traceable. A collage that reports "unavailable" for every district is not
// a failure of the code but it is a failure of the release, because the
// feature would ship showing nothing.
assert.ok(collage.measured > 0, "no signal could be measured over Dhaka");
assert.ok(collage.status !== "unavailable", "the collage is entirely unavailable");

const measured = collage.districts.flatMap(d => d.measurements).filter(m => m.status === "ok");
for (const m of measured) {
  assert.ok(m.value !== null && Number.isFinite(m.value), `a measurement of ${m.layerId} has no value`);
  assert.ok(m.observationDate || m.vintage || m.period, `a measurement of ${m.layerId} has neither a date nor a vintage`);
  // Resolution may be null for non-raster, point-based measurements (e.g. a
  // climatology such as NASA POWER solar). When present it must be positive.
  assert.ok(m.resolutionM === null || m.resolutionM > 0, `a measurement of ${m.layerId} has no resolution`);
  assert.ok(m.unit, `a measurement of ${m.layerId} has no unit`);
}

// Each signal must either have produced an observation somewhere in the city,
// or be unavailable everywhere for a reason that is the sky's and not the
// code's.
//
// The distinction matters. A night-time surface temperature is measured on a
// nightly pass, and when that pass is late, clouded or simply not yet
// ingested the newest usable observation can be several days old. The atlas
// then refuses to report it — which is the refusal contract working — and
// the layer reads "unavailable · stale-observation". That is weather, and it
// must not block a release.
//
// What must block a release is a layer that is unavailable because the
// instrument is broken: a colour map that will not resolve, a tile that will
// not decode, a colour map whose unit does not match the layer's. Those are
// named below, and a layer in that state fails the gate.
const UPSTREAM_REASONS = new Set([
  "cloud-or-no-observation",
  "no-observation-in-window",
  "stale-observation",
  "upstream-unreachable",
  "power-upstream-unreachable",
  "power-upstream-http-error",
  "power-rate-limited",
]);

const all = collage.districts.flatMap(d => d.measurements);
const byLayer = new Map();
for (const m of all) {
  if (!byLayer.has(m.layerId)) byLayer.set(m.layerId, []);
  byLayer.get(m.layerId).push(m);
}

// A configured instrument that produced no rows at all is not quiet; it is
// missing. The loop below only sees layers that appear, so check first.
for (const layer of MEASURED_LAYERS) {
  assert.ok(byLayer.has(layer.id), `${layer.id} is configured but absent from the collage`);
}

const quietLayers = [];
for (const [layerId, list] of byLayer) {
  const ok = list.filter(m => m.status === "ok");
  if (ok.length) continue;
  // Unavailable everywhere: every place must say why, and the reason must be
  // an upstream condition rather than a fault in the instrument.
  for (const m of list) {
    assert.ok(m.reasonCode, `${layerId} is unavailable with no reason code`);
    assert.ok(m.value === null, `${layerId} is unavailable but carries a value`);
    assert.ok(UPSTREAM_REASONS.has(m.reasonCode),
      `${layerId} is unavailable for "${m.reasonCode}", which is a fault in the instrument, not the sky`);
  }
  quietLayers.push({ layerId, reason: list[0].reasonCode, date: list[0].observationDate });
}

// At most one instrument may be quiet at once. Two would suggest the
// pipeline, not the weather.
const healthFailures = [];
if (quietLayers.length > 1) healthFailures.push(`too many instruments are quiet at once: ${quietLayers.map(q=>q.layerId).join(", ")}`);

// The collage as a whole must be healthy.
const coverage = collage.measured / collage.total;
if (coverage < 0.6) healthFailures.push(`only ${Math.round(coverage*100)}% of the measurements are available`);
for (const q of quietLayers) {
  console.log(`  · ${q.layerId} is quiet across the city: ${q.reason}${q.date ? ` (newest usable observation ${q.date})` : ""}`);
}

// The solar resource is measured point-by-point rather than from a raster,
// so it is not in MEASURED_LAYERS. It must still have produced readings.
const solarAny = measured.some(m => m.layerId === "NASA_POWER_ALLSKY_SFC_SW_DWN");
assert.ok(solarAny, "no district could be measured for the solar resource");

// The readings must be real sentences that name their measurement.
let withReading = 0;
for (const d of collage.districts) {
  for (const r of d.readings) {
    if (r.status !== "ok") continue;
    withReading++;
    assert.ok(r.reading && r.reading.length > 10, "a reading is empty");
    assert.ok(r.reading_bn && r.reading_bn.length > 10, "a reading has no Bengali text");
    assert.ok(r.basis, "a reading has no basis");
    if (r.basis.censored) {
      assert.equal(r.basis.rank,null,"a lower bound received an exact rank");
      assert.ok(r.reading.includes("≥"),"a lower-bound qualification was lost");
    } else assert.ok(r.basis.rank>=1,"an exact reading has no rank");
  }
}
assert.ok(withReading > 0, "no domain reading could be composed");

console.log(`Snapshot integrity validated: ${collage.measured}/${collage.total} measurements, ${withReading} domain readings; source health is evaluated separately`);

if (healthFailures.length) {
  gateResult({status:'degraded',reasonCode:'satellite-health-threshold-failed',coverage,quietLayers,failures:healthFailures});
  console.error(healthFailures.join('\n')); process.exitCode=1;
} else gateResult({status:collage.measured<collage.total?'degraded':'ok',reasonCode:collage.measured<collage.total?'some-signals-unavailable':null,coverage,quietLayers});
}
try { await verify(); } catch (error) {
  gateResult({status:'failed',reasonCode:'satellite-integrity-or-transport-failed',coverage:null,quietLayers:[],error:String(error)});
  console.error(error); process.exitCode=1;
}
