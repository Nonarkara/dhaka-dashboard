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

  const failures = CHECKS.filter(c => !c.ok);
  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} smoke checks failed`);
    process.exit(1);
  }
  console.log(`\n✓ All ${CHECKS.length} API smoke checks passed successfully.`);
})();
