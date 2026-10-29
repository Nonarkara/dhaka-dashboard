import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const realFetch = globalThis.fetch;
function loadWorker(fetcher) {
  globalThis.fetch = fetcher;
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module = {exports:{}};
    modules.set(name,module.exports);
    new Function('require','module','exports',js)(path=>load(path.replace('./','').replace('.js','')),module,module.exports);
    return module.exports;
  }
  return load('index').default;
}
const env = {ASSETS:{fetch:()=>new Response('{}')}};
const read = async(worker,path)=>{
  const r = await worker.fetch(new Request(`https://test.invalid${path}`),env);
  return {http:r.status,body:await r.json()};
};
try {
  let worker = loadWorker(async()=>{throw new Error('offline')});
  for (const path of ['/api/atlas/weather','/api/atlas/air-quality','/api/atlas/wind','/api/atlas/fires']) {
    const {body} = await read(worker,path);
    assert.equal(body.status,'unavailable',path);
    assert.ok(body.reasonCode && body.timestamp,path);
    assert.ok(!body.data, path);
  }
  for (const path of ['/api/atlas/rainfall','/api/atlas/earthquake']) {
    const {body} = await read(worker,path);
    assert.equal(body.status,'unavailable',path);
    assert.ok(body.reasonCode && body.timestamp,path);
  }
  const rivers = (await read(worker,'/api/dhaka/rivers')).body;
  assert.ok(rivers.stations.every(s=>s.current_level_m===null && s.status==='unavailable'));
  const economy = (await read(worker,'/api/dhaka/economy')).body;
  assert.ok(economy.indicators.every(i=>i.value===null && i.provenance==='unavailable'));
  const watch = (await read(worker,'/api/atlas/watch')).body;
  assert.ok(Object.values(watch.indicators).every(i=>i.status==='unavailable' && i.reasonCode));
  for (const [aqi, category] of [[50,'Good'],[100,'Moderate'],[150,'Unhealthy for Sensitive Groups'],[158,'Unhealthy'],[201,'Very Unhealthy'],[301,'Hazardous']]) {
    worker = loadWorker(async()=>Response.json({current:{time:'2026-10-28T10:00',us_aqi:aqi,wind_speed_10m:8,wind_direction_10m:90}}));
    const body = (await read(worker,'/api/atlas/watch')).body;
    assert.equal(body.indicators.airQuality.category,category);
    assert.equal(body.indicators.airQuality.us_aqi,aqi);
    assert.equal(body.indicators.weather.wind_speed_10m,8);
    assert.equal(body.indicators.floodRisk.status,'unavailable');
  }
  // Rainfall is evidence, never an inferred safe/alert river state.
  const hour = Math.floor(Date.now() / 3600000) * 3600000;
  const times = Array.from({length:24}, (_, i) => new Date(hour + i * 3600000 + 6 * 3600000).toISOString().slice(0,16));
  const rainfallPayload = values => ({hourly_units:{precipitation:'mm'}, hourly:{time:times, precipitation:values}});
  for (const values of [Array(24).fill(0), Array(24).fill(100)]) {
    worker=loadWorker(async()=>Response.json(rainfallPayload(values)));
    const result=await read(worker,'/api/dhaka/rivers');
    assert.equal(result.http,200);
    assert.equal(result.body.status,'partial');
    assert.deepEqual(result.body.summary,{assessed:0,unavailable:6,rainfallAvailable:5,rainfallUnavailable:1});
    assert.ok(result.body.stations.every(s=>s.floodRisk.status==='unavailable' && s.floodRisk.tier===null && s.floodRisk.reasonCode));
    const mapped=result.body.stations.filter(s=>s.rainfall.status==='ok');
    assert.ok(mapped.every(s=>s.rainfall.value===values.reduce((a,b)=>a+b,0)));
    assert.ok(mapped.every(s=>s.rainfall.validFrom && s.rainfall.validTo && s.rainfall.retrievedAt && s.rainfall.query && s.rainfall.stationMatchStatus==='unvalidated'));
    assert.ok(mapped.every(s=>s.rainfall.validFrom===new Date(hour-3600000).toISOString() && s.rainfall.validTo===new Date(hour+23*3600000).toISOString()));
    const unmapped=result.body.stations.find(s=>s.id==='lakhya-narayanganj');
    assert.equal(unmapped.rainfall.value,null);
    assert.equal(unmapped.rainfall.retrievedAt,null);
    assert.equal(unmapped.rainfall.reasonCode,'rainfall-query-not-mapped');
    const watch=(await read(worker,'/api/atlas/watch')).body;
    assert.equal(watch.indicators.floodRisk.status,'unavailable');
    assert.ok(!JSON.stringify(watch.indicators.floodRisk).includes('normal'));
  }
  for (const values of [Array(24).fill(null),[...Array(23).fill(0),null],Array(23).fill(1),[...Array(23).fill(1),-1]]) {
    worker=loadWorker(async()=>Response.json(rainfallPayload(values)));
    const body=(await read(worker,'/api/dhaka/rivers')).body;
    assert.equal(body.status,'unavailable');
    assert.ok(body.stations.every(s=>s.rainfall.status==='unavailable' && s.rainfall.value===null && s.floodRisk.tier===null));
  }
  for (const corrupt of ['unit','gap']) {
    const payload=rainfallPayload(Array(24).fill(0));
    if(corrupt==='unit') payload.hourly_units.precipitation='inch';
    else payload.hourly.time=[...times.slice(0,23),times[22]];
    worker=loadWorker(async()=>Response.json(payload));
    assert.equal((await read(worker,'/api/dhaka/rivers')).body.status,'unavailable');
  }
  const expired=rainfallPayload(Array(24).fill(1));
  expired.hourly.time=times.map(t=>t.replace(/^\d{4}-\d{2}-\d{2}/,'2000-01-01'));
  worker=loadWorker(async()=>Response.json(expired));
  assert.equal((await read(worker,'/api/dhaka/rivers')).body.status,'unavailable');
  worker=loadWorker(async()=>{throw new Error('offline')});
  const offline=(await read(worker,'/api/dhaka/rivers')).body;
  assert.equal(offline.summary.unavailable,6);
  assert.ok(offline.stations.every(s=>s.floodRisk.tier===null && s.rainfall.value===null));
  const dashboard=readFileSync(new URL('../public/dashboard.js',import.meta.url),'utf8');
  assert.ok(!/[\u0a80-\u0aff\uac00-\ud7af]/u.test(dashboard),'Bengali copy contains Gujarati or Korean');
  assert.ok(!dashboard.includes('river-tier-badge'),'unsupported tier badges must not return');
  assert.ok(dashboard.includes('function aqiGuidance('),'air guidance must remain defined');
  assert.ok(!dashboard.includes('aqiGuidance(data.data.current?.us_aqi, isBn)'),'air guidance must not use an undefined variable');
  worker=loadWorker(async()=>Response.json({}));
  assert.equal((await read(worker,'/api/atlas/weather')).body.status,'unavailable');
  console.log('✓ Data behavior: upstream failure, malformed payload, null readings and six AQI boundaries');
} finally { globalThis.fetch=realFetch; }
