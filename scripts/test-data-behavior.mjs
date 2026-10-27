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
  worker=loadWorker(async()=>Response.json({}));
  assert.equal((await read(worker,'/api/atlas/weather')).body.status,'unavailable');
  console.log('✓ Data behavior: upstream failure, malformed payload, null readings and six AQI boundaries');
} finally { globalThis.fetch=realFetch; }
