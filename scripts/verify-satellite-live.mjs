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
import { readFileSync } from "node:fs";

const { buildCollage } = await import("../src/collage.ts");
const { MEASURED_LAYERS } = await import("../src/satellite.ts");

const areas = JSON.parse(readFileSync("public/dhaka-areas.json", "utf8"));
const districts = areas.map(a => ({
  id: a.id, name: a.name, name_bn: a.name_bn,
  category: a.category ?? "", lat: a.lat, lng: a.lng,
}));

console.log(`Measuring ${districts.length} districts over ${MEASURED_LAYERS.length} satellite signals…`);
const started = Date.now();
const collage = await buildCollage(districts, 2);
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
  assert.ok(m.observationDate || m.vintage, `a measurement of ${m.layerId} has neither a date nor a vintage`);
  // Resolution may be null for non-raster, point-based measurements (e.g. a
  // climatology such as NASA POWER solar). When present it must be positive.
  assert.ok(m.resolutionM === null || m.resolutionM > 0, `a measurement of ${m.layerId} has no resolution`);
  assert.ok(m.unit, `a measurement of ${m.layerId} has no unit`);
}

// Each signal must have produced at least one observation somewhere in the
// city, or the layer is not delivering what the atlas claims it delivers.
for (const layer of MEASURED_LAYERS) {
  const any = measured.some(m => m.layerId === layer.id);
  assert.ok(any, `no district could be measured for ${layer.id}`);
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
    assert.ok(r.basis && r.basis.rank, "a reading has no rank");
  }
}
assert.ok(withReading > 0, "no domain reading could be composed");

console.log(`✓ Live satellite verification: ${collage.measured}/${collage.total} measurements, ${withReading} domain readings`);
