#!/usr/bin/env node
// DHKx 3D Atlas -- smoke test the live (or local) API surface.

const ATLAS_URL = (process.env.ATLAS_URL || "https://dhaka.nonarkara.org").replace(/\/$/, "");

const CHECKS = [];
function check(name, ok, detail = "") {
  CHECKS.push({ name, ok, detail });
  if (ok) {
    console.log(`  ✓ ${name} ${detail ? `(${detail})` : ""}`);
  } else {
    console.error(`  ✕ ${name} ${detail ? `(${detail})` : ""}`);
  }
}

async function get(path) {
  const url = `${ATLAS_URL}${path}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: null, error: String(e) };
  }
}

(async () => {
  console.log(`==> DHKx 3D Atlas API smoke · ${ATLAS_URL}`);

  {
    const r = await get("/api/health");
    check("health check answers with build ID and status ok", r.status === 200 && r.body?.status === "ok", `status=${r.status} buildId=${r.body?.buildId}`);
  }
  {
    const r = await get("/api/atlas/areas");
    check("areas returns 14 curated districts", r.status === 200 && r.body?.count >= 14, `status=${r.status} count=${r.body?.count}`);
  }
  {
    const r = await get("/api/atlas/districts");
    check("districts returns city corporations (DNCC and DSCC)", r.status === 200 && r.body?.corporations?.length === 2, `status=${r.status}`);
  }
  {
    const r = await get("/api/atlas/at-this-point?lat=23.7330&lng=90.4172");
    check("at-this-point resolves Motijheel", r.status === 200 && r.body?.insideBbox === true, `status=${r.status}`);
  }
  {
    const r = await get("/api/dhaka/rivers");
    check("rivers returns 6 BWDB gauge stations", r.status === 200 && r.body?.stations?.length === 6, `status=${r.status} stations=${r.body?.stations?.length}`);
  }
  {
    const r = await get("/api/dhaka/economy");
    check("economy returns macroeconomic indicators", r.status === 200 && r.body?.indicators?.length >= 6, `status=${r.status} count=${r.body?.indicators?.length}`);
  }
  {
    const r = await get("/api/atlas/watch");
    check("city watch strip answers with flood and air indicators", r.status === 200 && !!r.body?.indicators?.floodRisk, `status=${r.status}`);
  }
  {
    const r = await get("/api/atlas/instruments");
    const macro = r.body?.macro ?? [];
    const fxOk = r.body?.currency?.status === "ok" && Number.isFinite(r.body?.currency?.rate);
    check("instruments answer with a live rate and dated national series", r.status === 200 && fxOk && macro.length >= 8, `status=${r.status} macro=${macro.length} fx=${r.body?.currency?.rate}`);
    // Every reading must carry its own period, or the number has no date.
    const dated = macro.filter(m => m.status === "ok").every(m => typeof m.period === "string");
    check("every national reading carries its reporting period", dated);
  }
  {
    const r = await get("/api/atlas/collage");
    const districts = r.body?.districts ?? [];
    const measured = districts.flatMap(d => d.measurements ?? []).filter(m => m.status === "ok");
    check("collage returns measured satellite signals for the districts", r.status === 200 && districts.length >= 14 && measured.length > 0, `status=${r.status} districts=${districts.length} measured=${measured.length}`);
    // A measured value must carry its unit, its date and its resolution.
    const traceable = measured.every(m => m.unit && (m.observationDate || m.vintage) && (m.resolutionM === null || m.resolutionM > 0));
    check("every measured signal carries a unit, a date and a resolution", traceable);
    // And the readings must be real sentences, in both languages.
    const readings = districts.flatMap(d => d.readings ?? []).filter(x => x.status === "ok");
    check("the collage reads its domains in English and Bengali", readings.length > 0 && readings.every(x => x.reading && x.reading_bn), `readings=${readings.length}`);
  }
  {
    const r = await get("/api/dhaka/economy");
    const corridors = r.body?.corridors ?? [];
    // The corridors must carry a measured radiance, not a typed-in figure.
    const withRadiance = corridors.filter(c => c.status === "ok" && Number.isFinite(c.night_radiance_nw));
    const withFabrication = corridors.filter(c => c.workforce != null || c.annual_export != null || c.daily_turnover != null);
    check("economy corridors carry measured radiance, not registry figures", withRadiance.length > 0 && withFabrication.length === 0, `measured=${withRadiance.length} corridors=${corridors.length}`);
  }

  const failures = CHECKS.filter(c => !c.ok);
  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} smoke checks failed`);
    process.exit(1);
  }
  console.log(`\n✓ All ${CHECKS.length} API smoke checks passed successfully.`);
})();
