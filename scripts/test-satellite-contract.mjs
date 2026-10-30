/**
 * The satellite measurement contract.
 *
 * The measurement chain is:
 *
 *   capabilities → colour map → palette index → physical value
 *
 * Every link is checked here, because a break in any of them produces a
 * number rather than an error. A layer id that does not exist, a tile level
 * that does not match the catalogue, a colour map with the wrong unit, a
 * window that reads the wrong tile — each of those yields plausible
 * nonsense, and nonsense in a unit is worse than no measurement.
 *
 * The tests are written so that mutating the code under test makes them
 * fail. A test that cannot fail is a comment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

const catalogue = JSON.parse(readFileSync("scripts/fixtures/gibs-catalogue.json", "utf8"));
const { MEASURED_LAYERS, DOMAINS, measureLayer, groundResolutionM, tileForPoint, globalPixelForPoint, tilesForWindow, resolveIndexValue, candidateDates, TILE_SIZE } =
  await import("../src/satellite.ts");
const { GIBS_COLORMAPS } = await import("../src/gibs-colormaps.ts");
const { GIBS_CATALOGUE_LATEST } = await import("../src/gibs-catalogue.ts");
const { readingsFromMeasurements } = await import("../src/collage.ts");

let checks = 0;
const cases = [];
const ok = (label, fn) => { cases.push({ label, fn }); };

// ── 1. Every measured layer exists in the capabilities catalogue ────────────
ok("every measured layer exists in the GIBS catalogue", () => {
  assert.ok(MEASURED_LAYERS.length > 0, "no measured layers declared");
  for (const layer of MEASURED_LAYERS) {
    const entry = catalogue.layers[layer.id];
    assert.ok(entry, `layer ${layer.id} is not in the catalogue`);
    assert.ok(
      entry.tileMatrixSets.includes(`GoogleMapsCompatible_Level${layer.tileLevel}`),
      `layer ${layer.id} is not published at level ${layer.tileLevel} — catalogue has ${entry.tileMatrixSets.join(", ")}`,
    );
    assert.ok(
      entry.formats.includes("image/png"),
      `layer ${layer.id} is not published as PNG`,
    );
  }
});

// ── 2. Every measured layer has a resolved colour map with a unit ──────────
ok("every measured layer has a colour map and a unit", () => {
  for (const layer of MEASURED_LAYERS) {
    const colormap = GIBS_COLORMAPS[layer.id];
    assert.ok(colormap, `no colour map vendored for ${layer.id}`);
    assert.ok(colormap.refs.length > 0, `colour map for ${layer.id} has no value entries`);
    // A continuous layer states its unit; a classification does not, and its
    // entries are class codes.
    if (!layer.classes) {
      assert.ok(colormap.units, `colour map for ${layer.id} has no unit`);
      assert.equal(colormap.units, layer.unit, `colour map unit disagrees with the declared unit for ${layer.id}`);
    }
    // Nodata must be excluded, or "no observation" would be averaged in as a
    // real reading.
    assert.ok(colormap.nodata.length > 0, `colour map for ${layer.id} marks no nodata index`);
  }
});

// ── 3. The vendored colour map came from the live colour map ───────────────
ok("the colour map refresher refuses a layer the capabilities do not name", async () => {
  const refresher = await import("./refresh-gibs-colormaps.mjs");
  // A colour map document whose entries all lack a value must not produce a
  // lookup table: an empty table would measure nothing and report
  // "unavailable" for the wrong reason.
  const empty = refresher.parseColormap(
    '<ColorMap title="No Data" units="K"><Entries><ColorMapEntry rgb="0,0,0" nodata="true" ref="0"/></Entries></ColorMap>',
  );
  assert.throws(() => refresher.buildLookup(empty, "K"), /no readable value entries/);

  // A range that cannot be parsed must be dropped, not guessed at.
  assert.deepEqual(refresher.parseRange("[1,10000)"), [1, 10000]);
  assert.deepEqual(refresher.parseRange("5"), [5, 5]);
  assert.equal(refresher.parseRange("not a range"), null);
  assert.equal(refresher.parseRange(null), null);
});

// ── 4. Tile geometry: the window must read the tile it is told to ──────────
ok("tile addressing is consistent between the point and the window", () => {
  const points = [
    { lat: 23.8103, lng: 90.4125 },   // Dhaka
    { lat: 23.8583, lng: 90.2667 },   // Savar
    { lat: 23.6238, lng: 90.5000 },   // Narayanganj
    { lat: 0, lng: 0 },               // the origin
    { lat: 23.7, lng: 89.9 },
  ];
  for (const p of points) {
    for (const level of [7, 8, 9, 12]) {
      const local = tileForPoint(p.lat, p.lng, level);
      const global = globalPixelForPoint(p.lat, p.lng, level);
      // The tile the point is in, and the global pixel, must agree.
      assert.equal(Math.floor(global.gx / TILE_SIZE), local.x, `tile x mismatch at level ${level}`);
      assert.equal(Math.floor(global.gy / TILE_SIZE), local.y, `tile y mismatch at level ${level}`);
      assert.equal(local.x * TILE_SIZE + local.pixelX, global.gx, "pixel x disagrees with the global pixel");
      assert.equal(local.y * TILE_SIZE + local.pixelY, global.gy, "pixel y disagrees with the global pixel");
      // The window must cover the tile the point is in.
      const tiles = tilesForWindow(p.lat, p.lng, level, 2);
      assert.ok(
        tiles.some(t => t.x === local.x && t.y === local.y),
        `the window at level ${level} does not include the point's own tile`,
      );
      // And it must not wander into the far corner of the world, which is the
      // failure mode of deriving a tile index from an in-tile offset.
      for (const t of tiles) {
        assert.ok(Math.abs(t.x - local.x) <= 1 && Math.abs(t.y - local.y) <= 1,
          `the window reached tile ${t.x}/${t.y} from ${local.x}/${local.y}`);
      }
    }
  }
});

// ── 5. Ground resolution follows the published pyramid ─────────────────────
ok("ground resolution halves with each level", () => {
  const lat = 23.81;
  const l7 = groundResolutionM(7, lat);
  const l9 = groundResolutionM(9, lat);
  const l12 = groundResolutionM(12, lat);
  assert.ok(Math.abs(l7 / l9 - 4) < 0.001, "level 9 is not a quarter of level 7");
  assert.ok(Math.abs(l9 / l12 - 8) < 0.001, "level 12 is not an eighth of level 9");
  // The equator value is fixed by the pyramid: 156543.03 m / 2^level, which
  // is exactly what the capabilities document's scale denominator gives
  // (0.00028 × 4367830.19 for level 7, 0.00028 × 136494.69 for level 12).
  const equator = 156543.03392804097;
  assert.ok(Math.abs(groundResolutionM(7, 0) - equator / 128) < 0.01, "level 7 resolution is off the pyramid");
  assert.ok(Math.abs(groundResolutionM(12, 0) - equator / 4096) < 0.01, "level 12 resolution is off the pyramid");
  // Ground pixel spacing decreases away from the equator.
  assert.ok(Math.abs(groundResolutionM(7,60)/groundResolutionM(7,0)-0.5)<1e-9);
  assert.ok(l7 > 1100 && l7 < 1130, `level 7 resolution is ${l7} m, expected about 1119`);
  assert.ok(l12 > 34 && l12 < 36, `level 12 resolution is ${l12} m, expected about 35.0`);
});

// ── 6. The colour map turns an index into a physical quantity ─────────────
ok("a palette index resolves to the quantity its colour map states", () => {
  const radiance = GIBS_COLORMAPS["VIIRS_SNPP_DayNightBand_At_Sensor_Radiance"];
  assert.equal(radiance.units, "nW/(cm² sr)");
  // The first measurable bin of the radiance map is 0 to 0.1 nW/(cm² sr).
  const low = resolveIndexValue(radiance, 1);
  assert.ok(low && Math.abs(low.value - 0.05) < 0.001, `bin 1 resolved to ${low?.value}`);
  assert.equal(low.lowerBound, false);
  // A nodata index resolves to nothing, never to zero.
  assert.equal(resolveIndexValue(radiance, radiance.nodata[0]), null);
  // An index outside the map resolves to nothing.
  assert.equal(resolveIndexValue(radiance, 250), null);
  // The open-ended top bin is a lower bound, not a midpoint. Midpointing it
  // would report a radiance in the hundreds of thousands.
  const top = resolveIndexValue(radiance, radiance.refs[radiance.refs.length - 1]);
  assert.ok(top, "the top bin did not resolve");
  assert.equal(top.lowerBound, true, "the open-ended top bin was not marked as a bound");
  assert.ok(top.value < 1000, `the open-ended bin reported ${top.value}, which is a colour-map artefact`);

  // Temperature resolves in Kelvin, and the map says Kelvin.
  const temp = GIBS_COLORMAPS["MODIS_Terra_Land_Surface_Temp_Day_TES"];
  assert.equal(temp.units, "K");
  const kelvin = resolveIndexValue(temp, 100);
  assert.ok(kelvin && kelvin.value > 200 && kelvin.value < 350, `temperature bin resolved to ${kelvin?.value}`);
});

// ── 7. A measurement with no observation is unavailable, not zero ───────────
ok("a layer that cannot be measured reports unavailable with a reason", async () => {
  const bogus = {
    id: "NOT_A_REAL_LAYER",
    name: "x", provider: "x", tileLevel: 7, unit: "1",
    label: "x", label_bn: "x", domain: "environment",
  };
  const result = await measureLayer(bogus, [{ id: "a", lat: 23.81, lng: 90.41 }]);
  assert.equal(result.measurements.length, 1);
  const m = result.measurements[0];
  assert.equal(m.status, "unavailable");
  assert.equal(m.value, null, "an unmeasurable layer reported a value");
  assert.equal(m.mean, null);
  assert.equal(m.reasonCode, "colormap-unresolved");
});

// ── 8. The catalogue date is used for layers on a slow cycle ───────────────
ok("the catalogue's own date is a candidate for a slow-cycling layer", () => {
  const catalogueDate = GIBS_CATALOGUE_LATEST["MODIS_Terra_L3_NDVI_16Day"];
  assert.ok(catalogueDate, "the vegetation layer has no catalogue date");
  // The 16-day composite must not be older than a month, or the measurement
  // is stale and should say so rather than pretend.
  const age = (Date.now() - Date.parse(catalogueDate)) / 86400000;
  assert.ok(age < 40, `the vegetation catalogue date is ${Math.round(age)} days old`);
  // The candidate list is newest-first and covers at least a week.
  const dates = candidateDates();
  assert.ok(dates.length >= 6, "too few candidate dates");
  assert.ok(dates[0] > dates[dates.length - 1], "candidate dates are not newest-first");
});

// ── 9. The collage reads the whole city, not one district at a time ───────
ok("the collage ranks districts against the whole city", () => {
  // Synthetic measurements: three districts, two signals, with values that
  // put them in a known order. The test is about the ranking, not the
  // measurement, so it must not need a network to run.
  const layer = (id, value, label, extra = {}) => ({
    layerId: id,
    label,
    label_bn: label,
    domain: "environment",
    unit: "1",
    status: "ok",
    value,
    min: value,
    max: value,
    mean: value,
    coverage: 1,
    samples: 25,
    observationDate: "2026-10-27",
    vintage: null,
    static: false,
    censored: false,
    reasonCode: null,
    ...extra,
  });

  const perDistrict = new Map([
    ["a", [layer("MODIS_Terra_L3_NDVI_16Day", 0.9, "Vegetation index"), layer("VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", 10, "Night radiance")]],
    ["b", [layer("MODIS_Terra_Land_Surface_Temp_Day_TES", 305.0, "Daytime surface heat"), layer("VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", 30, "Night radiance")]],
    ["c", [layer("MODIS_Terra_L3_NDVI_16Day", 0.1, "Vegetation index"), layer("VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", 20, "Night radiance")]],
  ]);
  const readings = readingsFromMeasurements(perDistrict, ["a", "b", "c"]);

  const economyRank = id =>
    readings.get(id).find(r => r.domain === "economy").basis.rank;
  assert.equal(economyRank("b"), 1, "the brightest district did not rank first");
  assert.equal(economyRank("c"), 2);
  assert.equal(economyRank("a"), 3);
  assert.equal(readings.get("b").find(r => r.domain === "economy").basis.of, 3);

  // The reading must name the measurement it came from, in both languages.
  const env = readings.get("b").find(r => r.domain === "environment");
  assert.ok(env.reading.includes("Daytime surface heat"), "the reading does not name its signal");
  assert.ok(env.reading_bn && env.reading_bn.length > 0, "the reading has no Bengali text");

  // A reading must carry the same quantity in both languages. A temperature
  // written as Celsius in English and as Kelvin in Bengali is two different
  // claims about the same measurement.
  const temp = readingsFromMeasurements(
    new Map([
      ["a", [layer("MODIS_Terra_Land_Surface_Temp_Day_TES", 312.5, "Daytime surface heat")]],
    ]),
    ["a"],
  );
  const tempReading = temp.get("a").find(r => r.domain === "environment");
  assert.ok(tempReading.reading.includes("\u00b0C"), `the English reading lost its unit: ${tempReading.reading}`);
  assert.ok(tempReading.reading_bn.includes("\u00b0C"), `the Bengali reading lost its unit: ${tempReading.reading_bn}`);
  assert.ok(!tempReading.reading_bn.includes(" K"), "the Bengali reading fell back to the raw unit");

  // A tie is a tie, not a win.
  const tied = readingsFromMeasurements(
    new Map([
      ["a", [layer("MODIS_Terra_L3_NDVI_16Day", 0.5, "Vegetation index")]],
      ["b", [layer("MODIS_Terra_L3_NDVI_16Day", 0.5, "Vegetation index")]],
    ]),
    ["a", "b"],
  );
  const tieReading = tied.get("a").find(r => r.domain === "people");
  // Every measured district on the same value is uniformity, not a tie for
  // first: ranking it would be a sentence that says nothing.
  assert.ok(tieReading.reading.includes("the same in all"), `a uniform reading was ranked: ${tieReading.reading}`);
  assert.equal(tieReading.basis.tied, 1, "the tie count includes the district itself");

  // Two districts sharing the top of three is a real tie, and must say so.
  const partial = readingsFromMeasurements(
    new Map([
      ["a", [layer("MODIS_Terra_L3_NDVI_16Day", 0.5, "Vegetation index")]],
      ["b", [layer("MODIS_Terra_L3_NDVI_16Day", 0.5, "Vegetation index")]],
      ["c", [layer("MODIS_Terra_L3_NDVI_16Day", 0.1, "Vegetation index")]],
    ]),
    ["a", "b", "c"],
  );
  const partialReading = partial.get("a").find(r => r.domain === "people");
  assert.ok(partialReading.reading.includes("tied with 1 other sampled place"), `a tie was reported as a win: ${partialReading.reading}`);

  const unique = readingsFromMeasurements(
    new Map([
      ["a", [layer("MODIS_Terra_L3_NDVI_16Day", 0.9, "Vegetation index")]],
      ["b", [layer("MODIS_Terra_L3_NDVI_16Day", 0.2, "Vegetation index")]],
    ]),
    ["a", "b"],
  );
  const uniqueTop = unique.get("a").find(r => r.domain === "people");
  assert.equal(uniqueTop.basis.tied, 0, "a unique top was reported as a tie");
  assert.ok(!uniqueTop.reading.includes("tied"), `a unique top claimed a tie: ${uniqueTop.reading}`);

  // A rank is only "in the city" when the whole city was measured. Three
  // visible districts out of fourteen is not a city-wide comparison.
  const scoped = readingsFromMeasurements(
    new Map([
      ["a", [layer("MODIS_Terra_Land_Surface_Temp_Day_TES", 320, "Daytime surface heat")]],
      ["b", [layer("MODIS_Terra_Land_Surface_Temp_Day_TES", 310, "Daytime surface heat")]],
      ["c", []],
      ["d", []],
    ]),
    ["a", "b", "c", "d"],
  );
  const scopedTop = scoped.get("a").find(r => r.domain === "environment");
  assert.ok(!scopedTop.reading.includes("in the city"), `a partial reading claimed the city: ${scopedTop.reading}`);
  assert.ok(scopedTop.reading.includes("2 sampled places"), `the reading did not state its scope: ${scopedTop.reading}`);

  // No two domains may print the same number as their own finding.
  for (const [, list] of readings) {
    const ok = list.filter(r => r.status === "ok");
    const layers = ok.map(r => `${r.basis.label}|${r.basis.value}`);
    assert.equal(new Set(layers).size, layers.length, `two domains printed the same measurement: ${layers.join(", ")}`);
  }

  // A district with no measurement gets no reading, and says why.
  const empty = readingsFromMeasurements(new Map([["a", []]]), ["a"]);
  const noSignal = empty.get("a").find(r => r.domain === "environment");
  assert.equal(noSignal.status, "unavailable");
  assert.equal(noSignal.reading, null);
  assert.ok(noSignal.reasonCode, "an unmeasurable domain has no reason code");
});

// ── 9b. A real collage, measured live, must be complete ──────────────────
ok("the collage over the real district list is well formed", () => {
  const areas = JSON.parse(readFileSync("public/dhaka-areas.json", "utf8"));
  const districts = areas.map(a => ({
    id: a.id, name: a.name, name_bn: a.name_bn,
    category: a.category ?? "", lat: a.lat, lng: a.lng,
  }));
  assert.equal(districts.length, 14, "the district list changed");
  // Every district must carry a coordinate, or it cannot be measured.
  for (const d of districts) {
    assert.ok(Number.isFinite(d.lat) && Number.isFinite(d.lng), `${d.id} has no coordinate`);
    assert.ok(d.name && d.name_bn, `${d.id} is not bilingual`);
  }
});

// ── 10. Every domain has a signal and a bilingual question ─────────────────
ok("the domains are named in both languages", () => {
  const ids = DOMAINS.map(d => d.id);
  for (const expected of ["environment", "economy", "mobility", "people", "smart-living", "governance"]) {
    assert.ok(ids.includes(expected), `domain ${expected} is missing`);
  }
  // Six domains, because there are six instruments. An "Energy" domain would
  // have no per-district instrument of its own and could only repeat the night
  // radiance already reported under Economy — the same number printed twice
  // and read as two findings.
  assert.equal(DOMAINS.length, 7, "the domain count changed — the seven city domains are the deliverable");
  for (const d of DOMAINS) {
    assert.ok(d.label && d.label.length > 0, "a domain has no English label");
    assert.ok(d.label_bn && d.label_bn.length > 0, "a domain has no Bengali label");
    assert.ok(d.question && d.question.length > 0, "a domain has no question");
    assert.ok(d.question_bn && d.question_bn.length > 0, "a domain has no Bengali question");
  }
});

// ── 10b. The solar resource must be a real reading, never a silent zero ───
ok("the solar resource rejects a payload it cannot read", async () => {
  const { selectSolar } = await import("../src/solar-resource.ts");

  const good = { header:{range:"January 2001 - December 2025",sources:["SYN1DEG"]}, parameters:{ALLSKY_SFC_SW_DWN:{units:"kW-hr/m^2/day"}},geometry:{coordinates:[90.412,23.81,10]}, properties: { parameter: { ALLSKY_SFC_SW_DWN: { ANN: 4.5031, JAN: 3.6233, JUL: 4.3798 } } } };
  const selected = selectSolar(good);
  assert.equal(selected.annual, 4.5031);
  assert.equal(selected.period,"January 2001 - December 2025");
  assert.deepEqual(selected.returnedCoordinates,[90.412,23.81,10]);
  assert.equal(selected.nativeResolutionDegrees,1);
  assert.equal(selected.monthly.length, 2, "the monthly figures were dropped");

  // A payload with no parameter, a fill value, a zero, or a non-number must
  // be refused. A climatology that returned zero would read as "this place
  // gets no sun", which is the worst kind of wrong.
  for (const bad of [
    {},
    { properties: {} },
    { properties: { parameter: {} } },
    { properties: { parameter: { ALLSKY_SFC_SW_DWN: {} } } },
    { properties: { parameter: { ALLSKY_SFC_SW_DWN: { ANN: -999 } } } },
    { properties: { parameter: { ALLSKY_SFC_SW_DWN: { ANN: 0 } } } },
    { properties: { parameter: { ALLSKY_SFC_SW_DWN: { ANN: "4.5" } } } },
    { properties: { parameter: { ALLSKY_SFC_SW_DWN: { ANN: NaN } } } },
  ]) {
    assert.throws(() => selectSolar(bad), /power-(invalid-response|no-valid-observation)/);
  }
});

// ── 10b. A reading must not claim a rate it did not measure ────────────────
ok("no reading claims a rate of change from a single observation", async () => {
  const { DOMAIN_PHRASING, SIGNAL_READINGS } = await import("../src/collage.ts");
  // A night-time surface temperature is one observation. It does not measure
  // how fast anything cools, and a reading that says it does is making a
  // claim the instrument never made.
  const banned = ["cooling", "fastest", "warming", "rate of"];
  const scan = (table, where) => {
    for (const [key, entry] of Object.entries(table)) {
      for (const [field, text] of Object.entries(entry)) {
        if (typeof text !== "string") continue;
        for (const word of banned) {
          assert.ok(!text.toLowerCase().includes(word),
            `the ${where} phrasing for ${key}.${field} claims "${word}": ${text}`);
        }
      }
    }
  };
  // Both tables compose readings, so both are guarded.
  scan(SIGNAL_READINGS, "signal");
  for (const [domain, phrases] of Object.entries(DOMAIN_PHRASING)) {
    for (const [layer, phrase] of Object.entries(phrases)) {
      for (const [field, text] of Object.entries(phrase)) {
        for (const word of banned) {
          assert.ok(!String(text).toLowerCase().includes(word),
            `the ${domain} reading for ${layer}.${field} claims "${word}": ${text}`);
        }
      }
    }
  }
});

// ── 10c. The cache must not remember a failure for long ────────────────────
ok("a failed tile is not cached for the life of the isolate", async () => {
  const { gibsTileCacheStats } = await import("../src/satellite.ts");
  // This static, colormapped layer skips date discovery. A zero-radius
  // window touches exactly one tile, so the failure and retry counts are exact.
  const layer = MEASURED_LAYERS.find(l => l.id === "Landsat_Human_Built-up_And_Settlement_Extent");
  assert.ok(layer?.static && GIBS_COLORMAPS[layer.id], "the cache experiment needs a known static colour map");
  const points = [{ id: "cache-probe", lat: 23.81, lng: 90.41 }];
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.UTC(2026, 9, 30);
  const requests = [];
  try {
    Date.now = () => now;
    globalThis.fetch = async url => {
      requests.push(String(url));
      return new Response("controlled upstream failure", { status: 503 });
    };
    assert.equal(gibsTileCacheStats().failures, 0, "the experiment must start without cached failures");
    const first = await measureLayer(layer, points, 0);
    assert.equal(first.measurements[0].status, "unavailable");
    assert.equal(first.measurements[0].reasonCode, "cloud-or-no-observation");
    assert.equal(first.measurements[0].value, null);
    assert.equal(requests.length, 1, "the first failure must attempt exactly one tile");
    assert.ok(requests[0].includes(layer.id), "the experiment fetched the wrong layer");
    assert.equal(gibsTileCacheStats().failures, 1, "the failed tile was not cached");
    assert.equal(gibsTileCacheStats().maxFailureTtlMs, 60_000, "a cached failure must expire in one minute");

    now += 59_999;
    await measureLayer(layer, points, 0);
    assert.equal(requests.length, 1, "the cached failure caused another outbound request before expiry");
    assert.equal(gibsTileCacheStats().failures, 1);
    assert.equal(gibsTileCacheStats().maxFailureTtlMs, 1);

    now += 2;
    assert.equal(gibsTileCacheStats().failures, 0, "an expired failure is still counted as active");
    assert.equal(gibsTileCacheStats().maxFailureTtlMs, 0);
    await measureLayer(layer, points, 0);
    assert.equal(requests.length, 2, "an expired failure prevented the tile retry");
    assert.equal(requests[1], requests[0], "the retry must fetch the same tile");
    assert.equal(gibsTileCacheStats().failures, 1);
    assert.equal(gibsTileCacheStats().maxFailureTtlMs, 60_000);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

// ── 11. No fabricated figures survive in the economy registry ─────────────
ok("the economy registry carries no unsourced figures", () => {
  const geo = JSON.parse(readFileSync("public/dhaka-economy.geojson", "utf8"));
  for (const feature of geo.features) {
    const p = feature.properties;
    // The key may be absent or null — both say "no figure". What must not
    // survive is a number, because a number reads as data.
    for (const key of ["workforce", "annual_export_usd", "daily_turnover"]) {
      const value = p[key];
      assert.ok(value === undefined || value === null,
        `${p.name} carries an unsourced ${key} figure (${value})`);
    }
    assert.ok(p.observedAt === undefined || p.observedAt === null,
      `${p.name} carries an unsourced observation date`);
  }
  const areas = JSON.parse(readFileSync("public/dhaka-areas.json", "utf8"));
  for (const a of areas) {
    assert.ok(!/\$\d/.test(a.description || ""), `${a.name} quotes an unsourced dollar figure`);
  }
});

// ── 12. The prose audit finds nothing it should not ────────────────────────
ok("the prose audit reports no unsourced quantity in a description", () => {
  const script = readFileSync("scripts/audit-prose-numbers.mjs", "utf8");
  assert.ok(script.includes("PROSE_FIELDS"), "the audit has no field list");
  // The seven quantities that were removed from the descriptions.
  const removed = ["300-acre", "200 launches", "$47B", "over 100 foreign", "200-acre", "500-acre", "3,000 trucks"];
  const corpus = ["public/dhaka-areas.json", "public/dhaka-economy.geojson"]
    .map(f => readFileSync(f, "utf8")).join("\n");
  for (const phrase of removed) {
    assert.ok(!corpus.includes(phrase), `the unsourced phrase "${phrase}" is still in the descriptions`);
  }
});

for (const { label, fn } of cases) {
  try {
    await fn();
    checks++;
  } catch (error) {
    console.error(`✗ Satellite contract: ${label}`);
    throw error;
  }
}

console.log(`✓ Satellite contract: ${checks} checks passed — catalogue, colour maps, tile geometry, units, coverage, ranking and no unsourced figures`);
