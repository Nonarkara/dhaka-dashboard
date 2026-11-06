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

// ── The documented surface must be the real surface ───────────────────────
// Three endpoints were served but never written down, so nobody knew they
// existed. The table in the README is now bound to the routes in the worker
// in both directions.
const readme = readFileSync('README.md', 'utf8');
const routes = [...worker.matchAll(/url\.pathname === "(\/api\/[^"]+)"/g)].map(m => m[1]);
assert.ok(routes.length >= 20, `the worker should serve a real API, found ${routes.length} routes`);
for (const route of routes) {
  assert.ok(readme.includes(route), `README must document ${route}`);
}
const documented = [...readme.matchAll(/`(\/api\/[^`?]+)/g)].map(m => m[1]);
for (const route of documented) {
  assert.ok(routes.includes(route), `README documents ${route}, which the worker does not serve`);
}

console.log('✓ API truthfulness: failures are not cached or published, a measured corridor is not stamped missing, out-of-range coordinates are refused, a crash answers in JSON');
// Execute the Worker: string-presence checks cannot establish these contracts.
const { default: ts } = await import('typescript');
const { createRequire } = await import('node:module');
const nativeRequire = createRequire(import.meta.url);
function loadWorker() {
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const js = ts.transpileModule(readFileSync(`src/${name}.ts`, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    const module = {exports: {}};
    modules.set(name, module.exports);
    new Function('require', 'module', 'exports', js)(path => path.startsWith('.') ? load(path.replace('./', '').replace('.js', '')) : nativeRequire(path), module, module.exports);
    return module.exports;
  }
  return load('index').default;
}
const runtime = loadWorker();
const feature = {type: 'Feature', properties: {name: 'Reference'}, geometry: {type: 'Point', coordinates: [90.4, 23.7]}};
const validLayer = {type: 'FeatureCollection', features: [feature]};
const requestExport = async layers => {
  const response = await runtime.fetch(new Request('https://test.invalid/api/atlas/export'), {ASSETS: {fetch: async url => {
    const layer = layers[String(url).split('/').pop()];
    if (layer === 'throw') throw new Error('asset offline');
    if (layer === 'json-error') return new Response('{');
    return layer === undefined ? new Response('', {status: 404}) : Response.json(layer);
  }}});
  return {response, body: await response.json()};
};
const allLayers = {'dhaka-landmarks.geojson': validLayer, 'dhaka-rivers.geojson': validLayer, 'dhaka-mrt.geojson': validLayer};
let result = await requestExport(allLayers);
assert.equal(result.body.status, 'ok');
assert.equal(result.body.features.length, 3);
assert.deepEqual(result.body.metadata.missingLayers, []);
assert.deepEqual(result.body.features.map(f => f.properties.layer), ['dhaka-landmarks', 'dhaka-rivers', 'dhaka-mrt']);
const actual = await requestExport(Object.fromEntries(Object.keys(allLayers).map(name => [name, JSON.parse(readFileSync(`public/${name}`, 'utf8'))])));
assert.equal(actual.body.status, 'ok', 'all existing atlas layers remain exportable');
assert.equal(actual.body.features.length, Object.keys(allLayers).reduce((sum, name) => sum + JSON.parse(readFileSync(`public/${name}`, 'utf8')).features.length, 0));
const invalidLayers = [undefined, {}, null, {features: [feature]}, {type: 'FeatureCollection', features: []},
  {type: 'FeatureCollection', features: {}}, {type: 'FeatureCollection', features: [null]},
  ...[{}, {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [999, 23]}},
    {...feature, geometry: {type: 'LineString', coordinates: [[90, 23]]}},
    {...feature, geometry: {type: 'Polygon', coordinates: [[[90, 23], [91, 23], [91, 24], [90, 24]]]}}]
    .map(f => ({type: 'FeatureCollection', features: [f]})), 'throw', 'json-error'];
for (const invalid of invalidLayers) {
  const partial = await requestExport({...allLayers, 'dhaka-rivers.geojson': invalid});
  assert.equal(partial.response.status, 200);
  assert.equal(partial.body.status, 'partial');
  assert.equal(partial.body.reasonCode, 'export-layers-missing-or-invalid');
  assert.deepEqual(partial.body.metadata.missingLayers, ['dhaka-rivers']);
  assert.equal(partial.body.features.length, 2, 'invalid layer contributes no fabricated features');
  const unavailable = await requestExport(Object.fromEntries(Object.keys(allLayers).map(k => [k, invalid])));
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.body.status, 'unavailable');
  assert.ok(Number.isFinite(Date.parse(unavailable.body.timestamp)));
  assert.equal(unavailable.response.headers.get('cache-control'), 'no-store');
}
const thrown = await runtime.fetch(new Request('https://test.invalid/'), {ASSETS: {fetch() {throw new Error('asset failure');}}});
assert.equal(thrown.status, 500);
const thrownBody = await thrown.json();
assert.equal(thrownBody.reasonCode, 'handler-failed');
assert.ok(Number.isFinite(Date.parse(thrownBody.timestamp)));
assert.equal(thrown.headers.get('cache-control'), 'no-store');
const coordinates = await runtime.fetch(new Request('https://test.invalid/api/atlas/at-this-point?lat=999&lng=90'), {});
assert.equal(coordinates.status, 400);
assert.equal((await coordinates.json()).reasonCode, 'coordinates-out-of-range');
console.log('✓ Runtime API: valid export preserves all layers; malformed/empty/missing layers are partial or unavailable; throws and invalid coordinates are JSON refusals.');

// The Worker must decode JPEG pixels too: GIBS returns blank JPEGs with HTTP200.
const jpeg = await import('jpeg-js');
const encodeJpeg = rgba => jpeg.encode({width: 2, height: 2, data: Buffer.from(rgba)}, 100).data;
const blankJpeg = encodeJpeg(Array.from({length: 4}, () => [255, 255, 255, 255]).flat());
const variedJpeg = encodeJpeg([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
const environmentRequest = worker => worker.fetch(new Request('https://test.invalid/api/atlas/environment'), {});
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
try {
  for (const [bytes, type, available] of [
    [blankJpeg, 'image/jpeg', false], [Buffer.from('fake JPEG'), 'image/jpeg', false],
    [variedJpeg, 'text/html', false], [variedJpeg, 'image/png', false],
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/jpeg', false],
    [variedJpeg, 'image/jpeg; charset=binary', true],
  ]) {
    globalThis.fetch = async url => String(url).endsWith('.jpg')
      ? new Response(bytes, {headers: {'content-type': type, 'content-length': String(bytes.length)}})
      : new Response('', {status: 404});
    const response = await environmentRequest(loadWorker());
    const body = await response.json();
    const truecolor = body.layers.find(layer => layer.id === 'VIIRS_NOAA20_CorrectedReflectance_TrueColor');
    assert.equal(truecolor.status, available ? 'ok' : 'unavailable', `${type} must be decoded, not believed by byte length`);
    assert.ok(Number.isFinite(Date.parse(truecolor.availability_checked_at)));
    assert.equal(response.headers.get('cache-control'), 'no-store', 'availability is never served by a stale shared/browser cache');
    assert.equal(body.availability_ttl_seconds, 60);
    if (available) {
      assert.equal(truecolor.latest_date, new Date().toISOString().slice(0, 10));
      assert.ok(truecolor.template.includes(`/${truecolor.latest_date}/`));
    } else {
      assert.equal(truecolor.latest_date, null);
      assert.equal(truecolor.template, null);
      assert.ok(truecolor.reasonCode);
    }
  }
  // A uniformly blank newest day must resolve to the prior decoded day,
  // never inherit the newest HTTP200's date.
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async url => String(url).endsWith('.jpg')
    ? new Response(String(url).includes(`/${yesterday}/`) ? variedJpeg : blankJpeg, {headers: {'content-type': 'image/jpeg'}})
    : new Response('', {status: 404});
  const dated = (await (await environmentRequest(loadWorker())).json()).layers.find(layer => layer.format === 'jpg');
  assert.equal(dated.latest_date, yesterday, 'the advertised date belongs to pixels that actually passed decoding');
  assert.ok(dated.template.includes(`/${yesterday}/`));

  let tileCalls = 0, upstreamAvailable = true;
  globalThis.fetch = async url => {
    tileCalls++;
    return upstreamAvailable && String(url).endsWith('.jpg') ? new Response(variedJpeg, {headers: {'content-type': 'image/jpeg'}}) : new Response('', {status: 404});
  };
  const cachedWorker = loadWorker();
  const first = await (await environmentRequest(cachedWorker)).json();
  const countAfterCollection = tileCalls;
  upstreamAvailable = false;
  const cached = await (await environmentRequest(cachedWorker)).json();
  assert.equal(tileCalls, countAfterCollection, 'requests inside the short availability window share completed probes');
  assert.equal(cached.layers[0].availability_checked_at, first.layers[0].availability_checked_at, 'cache does not invent a newer probe time');
  Date.now = () => originalNow() + 60001;
  const expiredResponse = await environmentRequest(cachedWorker);
  const expired = await expiredResponse.json();
  assert.ok(tileCalls > countAfterCollection, 'availability must be reprobed after60seconds');
  assert.equal(expiredResponse.status, 503);
  assert.equal(expired.status, 'unavailable');
  assert.ok(expired.layers.every(layer => layer.status === 'unavailable' && layer.latest_date === null && layer.template === null), 'an expired successful image is not returned stale during source failure');
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
console.log('✓ Worker GIBS: decoded JPEG variation, blank/corrupt/type mismatch refusal, exact decoded date and60-second no-stale availability.');
