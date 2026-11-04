import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
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
    new Function('require','module','exports',js)(path=>path.startsWith('.')?load(path.replace('./','').replace('.js','')):nativeRequire(path),module,module.exports);
    return module.exports;
  }
  return load('index').default;
}
const env = {ASSETS:{fetch:()=>new Response('{}')}};
const read = async(worker,path)=>{
  const r = await worker.fetch(new Request(`https://test.invalid${path}`),env);
  return {http:r.status,body:await r.json()};
};
const currentPayload = () => ({
  utc_offset_seconds:21600,
  current:{time:new Date(Date.now()+21600000).toISOString().slice(0,16),us_aqi:50,pm2_5:12.5,temperature_2m:30,apparent_temperature:32,relative_humidity_2m:65,surface_pressure:1005,wind_speed_10m:8,wind_direction_10m:90},
  current_units:{us_aqi:'USAQI',pm2_5:'μg/m³',temperature_2m:'°C',apparent_temperature:'°C',relative_humidity_2m:'%',surface_pressure:'hPa',wind_speed_10m:'km/h',wind_direction_10m:'°'},
});
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
    worker = loadWorker(async()=>Response.json({...currentPayload(),current:{...currentPayload().current,us_aqi:aqi}}));
    const body = (await read(worker,'/api/atlas/watch')).body;
    assert.equal(body.indicators.airQuality.category,category);
    assert.equal(body.indicators.airQuality.us_aqi,aqi);
    assert.equal(body.indicators.weather.wind_speed_10m,8);
    assert.equal(body.indicators.floodRisk.status,'unavailable');
  }
  worker=loadWorker(async url=>String(url).includes('rainviewer')?Response.json({radar:{past:[{time:Math.floor(Date.now()/1000)}]}}):new Response('',{status:404}));
  const partialEnvironment=(await read(worker,'/api/atlas/environment')).body;
  assert.equal(partialEnvironment.status,'partial','one available feed cannot turn all environment sources healthy');
  assert.equal(partialEnvironment.reasonCode,'some-environment-layers-unavailable');
  assert.ok(partialEnvironment.timestamp);
  assert.ok(partialEnvironment.layers.filter(l=>l.kind==='gibs-raster').every(l=>l.status==='unavailable'&&l.template===null&&l.latest_date===null&&l.reasonCode));
  let simultaneousCalls=0;
  worker=loadWorker(async()=>{simultaneousCalls++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json(currentPayload());});
  await Promise.all([read(worker,'/api/atlas/weather'),read(worker,'/api/atlas/weather')]);
  assert.equal(simultaneousCalls,1,'cold concurrent visitors share current-model acquisition');
  // Current source values, time and units must be validated, not simply a string timestamp.
  for (const [key,bad] of [['us_aqi',-5],['us_aqi',null],['pm2_5',-1],['wind_speed_10m',-10],['wind_direction_10m',999],['temperature_2m',null],['relative_humidity_2m',101]]) {
    const payload=currentPayload(); payload.current[key]=bad;
    worker=loadWorker(async()=>Response.json(payload));
    const path=['us_aqi','pm2_5'].includes(key)?'/api/atlas/air-quality':'/api/atlas/weather';
    const result=await read(worker,path);
    assert.equal(result.http,503,key); assert.equal(result.body.reasonCode,'model-invalid-current-value',key); assert.ok(result.body.timestamp);
    const watch=(await read(worker,'/api/atlas/watch')).body;
    assert.equal(watch.indicators[['us_aqi','pm2_5'].includes(key)?'airQuality':'weather'].status,'unavailable');
  }
  for (const kind of ['expired','future','invalid-date','offset','units']) {
    const payload=currentPayload();
    if(kind==='expired')payload.current.time='2000-01-01T00:00';
    if(kind==='future')payload.current.time=new Date(Date.now()+21600000+7200000).toISOString().slice(0,16);
    if(kind==='invalid-date')payload.current.time='2026-02-30T12:00';
    if(kind==='offset')payload.utc_offset_seconds=0;
    if(kind==='units')payload.current_units.wind_speed_10m='m/s';
    worker=loadWorker(async()=>Response.json(payload));
    const result=await read(worker,'/api/atlas/weather');
    assert.equal(result.http,503,kind); assert.match(result.body.reasonCode,/^model-/,kind);
  }
  const zeros=currentPayload();zeros.current.us_aqi=0;zeros.current.pm2_5=0;zeros.current.wind_speed_10m=0;
  worker=loadWorker(async()=>Response.json(zeros));
  assert.equal((await read(worker,'/api/atlas/watch')).body.indicators.airQuality.us_aqi,0,'validated measured zero remains distinct from unavailable');
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
  for(const values of [Array(24).fill(0),Array(24).fill(2),Array(1).fill(2),Array(24).fill(-1)]) {
    worker=loadWorker(async()=>Response.json(rainfallPayload(values)));
    const result=(await read(worker,'/api/atlas/rainfall')).body;
    assert.equal(result.status,values.length===24&&values[0]>=0?'ok':'unavailable');
    if(result.status==='ok')assert.ok(result.catchments.every(p=>p.rain_24h_sum_mm===values[0]*24&&p.validFrom&&p.validTo&&p.spatialScope==='query_point'));
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
