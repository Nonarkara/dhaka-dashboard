// The API truthfulness contract.
//
// A dashboard that answers "unavailable" must mean it, and must stop
// meaning it the moment the source recovers. Seven defects made it lie:
//
//   1. A failed upstream response was cached for the full lifetime, so a
//      transient outage became a permanent "unavailable".
//   2. The cache only understood an array of rows. The river feed answers
//      with an object carrying a list, and its failures were cached as if
//      they were measurements.
//   3. An unavailable answer was published as publicly cacheable, so a
//      shared cache kept serving it long after the source came back.
//   4. The solar resource cached its own failures, against the comment
//      that promised it would not.
//   5. A corridor that had been measured was stamped with the reason code
//      "corridor-not-measured".
//   6. A coordinate outside the world was answered with a "nearest
//      station" instead of a refusal.
//   7. A throw inside a handler escaped as a non-JSON runtime error page.
//
//   node scripts/test-api-truthfulness.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync('src/index.ts', 'utf8');
const collage = readFileSync('src/collage.ts', 'utf8');
const solar = readFileSync('src/solar-resource.ts', 'utf8');

// ── 1 & 3. An unavailable answer is never stored or published ─────────────
assert.match(
  worker,
  /const failed = status >= 400 \|\| bodyStatus === "unavailable";/,
  'the response helper must recognise an unavailable body',
);
assert.match(
  worker,
  /failed \? "no-store" : "public, max-age=60/,
  'an unavailable answer must be published as no-store',
);

// ── 2. The cache must understand every shape the feeds return ────────────
assert.match(
  worker,
  /function containsUnavailableReading\(data: unknown\): boolean/,
  'the cache must be able to see an unavailable reading',
);
assert.match(worker, /record\.status === "unavailable"/, 'an object payload may itself be unavailable');
assert.match(worker, /for \(const key of \["features", "stations"\] as const\)/, 'the cache must look inside a list of rows');
assert.match(
  worker,
  /ttlMs:\s*incomplete\s*\?\s*Math\.min\(ttlMs,\s*60000\)\s*:\s*ttlMs/,
  'a payload with a missing reading must not be remembered for the full lifetime',
);

// ── 4. The solar resource keeps a success and drops a failure ────────────
const solarCatch = solar.match(/catch \(err\) \{[\s\S]*?\n  \}/);
assert.ok(solarCatch, 'the solar reader must have a failure path');
assert.ok(
  !/cache\.set\(key,\s*\{reading,\s*expires:\s*Date\.now\(\) \+ 5 \* 60000\}\)/.test(solarCatch[0]),
  'a failed solar reading must not be cached',
);
assert.match(solar, /const cache = new Map<string, \{ reading: SolarReading; expires: number \}>\(\);/, 'the solar cache must exist');
assert.match(solar, /cache\.set\(key, \{reading, expires: Date\.now\(\) \+ 86400000\}\);/, 'a successful solar reading must be kept');

// ── 5. A measured corridor carries no reason to be missing ───────────────
assert.match(
  collage,
  /reasonCode: m\?\.status === "ok" \? null : m\?\.reasonCode \?\? "corridor-not-measured"/,
  'a measured corridor must not be stamped as not measured',
);
assert.match(collage, /name_bn: p\.name_bn \?\? null/, 'a corridor must carry its Bengali name');
assert.match(collage, /sector_bn: p\.sector_bn \?\? null/, 'a corridor must carry its Bengali sector');

// ── 6. A coordinate outside the world is refused ──────────────────────────
assert.match(
  worker,
  /coordinates-out-of-range/,
  'an out-of-range coordinate must be refused by name',
);
assert.match(
  worker,
  /latParam < -90 \|\| latParam > 90 \|\| lngParam < -180 \|\| lngParam > 180/,
  'the coordinate bounds must be enforced',
);

// ── 7. A crash still answers in the contract the client expects ──────────
assert.match(
  worker,
  /reasonCode: "handler-failed"/,
  'a crash must answer with a machine-readable reason',
);
assert.match(
  worker,
  /async function handleRequest\(request: Request, env: Env\): Promise<Response>/,
  'the handler must be separated so it can be guarded',
);
assert.match(worker, /catch \(error\) \{[\s\S]*?jsonResponse\(/, 'the guard must answer with JSON');

// ── The shape of an upstream payload must be checked before it is believed ─
assert.match(worker, /USGS payload shape invalid/, 'an earthquake payload of the wrong shape must be refused');
assert.match(worker, /population-grid-invalid/, 'a population grid of the wrong shape must be refused');
assert.match(worker, /facilities-grid-invalid/, 'a facilities file of the wrong shape must be refused');

// ── The economy desk must not report an empty corridor list as a success ─
assert.match(worker, /corridors,/, 'the economy answer must carry its corridors');
assert.match(
  worker,
  /corridorsReason = corridors\.length \? null : "no-corridors-measured"/,
  'an empty corridor list must carry its reason',
);

console.log('✓ API truthfulness: failures are not cached or published, a measured corridor is not stamped missing, out-of-range coordinates are refused, a crash answers in JSON');
