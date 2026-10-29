import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {deflateSync} from 'node:zlib';
import { readFileSync,readdirSync } from 'node:fs';
import {collectSnapshot,readSnapshot,snapshotDelivery,sourceHealth,observationHistory,SNAPSHOT_SCHEMA} from '../src/snapshots.ts';
import {samplingWindow,groundResolutionM,measureLayer,MEASURED_LAYERS,tileForPoint} from '../src/satellite.ts';
import {selectSolar} from '../src/solar-resource.ts';
import worker from '../src/index.ts';
import {fetchSource} from '../src/source-fetch.ts';
import {readingsFromMeasurements} from '../src/collage.ts';

class DB {
  sql=new DatabaseSync(':memory:'); failBatch=false;
  constructor(){for(const file of readdirSync('migrations').sort())this.sql.exec(readFileSync('migrations/'+file,'utf8'));}
  prepare(query){ const db=this; let args=[]; return {bind(...v){args=v;return this;},async run(){return {meta:{changes:Number(db.sql.prepare(query).run(...args).changes)}};},async first(){return db.sql.prepare(query).get(...args)||null;},async all(){return {results:db.sql.prepare(query).all(...args)};}}; }
  async batch(statements){if(this.failBatch){this.failBatch=false;throw Error('D1 unavailable');} this.sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());this.sql.exec('COMMIT');return r;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
class Bucket {
  objects=new Map();fail=false;
  async put(key,body,options){if(this.fail)throw Error('R2 unavailable');this.objects.set(key,{body:typeof body==='string'?body:new Uint8Array(body),options});}
  async get(key){const o=this.objects.get(key);return o?{async json(){return JSON.parse(o.body);}}:null;}
}
const db=new DB(), bucket=new Bucket();
const env={OBSERVATION_DB:db,OBSERVATION_ARCHIVE:bucket,ASSETS:{fetch:url=>Response.json(JSON.parse(readFileSync(String(url).includes('dhaka-areas')?'public/dhaka-areas.json':'public/dhaka-economy.geojson','utf8')))}};
const make=()=>({status:'ok',timestamp:new Date().toISOString(),provenance:'mixed',city:'Dhaka',domains:Array.from({length:7},(_,i)=>({id:String(i)})),corridors:[{id:'stored-corridor',status:'ok',night_radiance_nw:0}],measured:98,total:98,reasonCode:null,districts:Array.from({length:14},(_,i)=>({id:'place-'+i,lat:23.8,lng:90.4,name:'place',name_bn:'স্থান',category:'',headline:'',headline_bn:'',readings:[],measurements:Array.from({length:7},(_,j)=>({layerId:'signal-'+j,status:'ok',value:j===0?0:1,unit:'mm',observationDate:'2026-10-29',period:null,vintage:null,coverage:1,reasonCode:null}))}))});
const due=()=>db.sql.exec("UPDATE collector_state SET lease_until=0,last_success_at=NULL");
const initial=await collectSnapshot(env,async()=>make()); assert.equal(initial,'published');
const first=await readSnapshot(env);assert.equal(first.delivery.status,'fresh');assert.equal(first.districts[0].measurements[0].value,0);
const initialId=first.delivery.snapshotId;
let outbound=0;const real=globalThis.fetch;
let acquisitionCalls=0;
globalThis.fetch=async url=>{outbound++;if(/gibs|power\.larc/.test(String(url)))acquisitionCalls++;throw Error('offline');};
try{
 const r=await worker.fetch(new Request('https://test.invalid/api/atlas/collage'),env);
 assert.equal(r.status,200);assert.equal((await r.json()).delivery.snapshotId,initialId);assert.equal(outbound,0,'cold collage GET fetched upstream');
 const economy=await worker.fetch(new Request('https://test.invalid/api/dhaka/economy'),env);
 assert.equal((await economy.json()).corridors[0].id,'stored-corridor');
 assert.equal(acquisitionCalls,0,'cold economy GET started satellite acquisition');
 // Economy may fetch World Bank/FX, but never calls buildCollage or GIBS/POWER.
}finally{globalThis.fetch=real;}
for(const broken of [()=>{throw Error('offline');},()=>({...make(),measured:1}),()=>({...make(),districts:make().districts.slice(1)}),()=>{const d=make();d.districts[0].measurements[0].value=null;return d;}]){
 due();assert.equal(await collectSnapshot(env,async()=>broken()),'failed');assert.equal((await readSnapshot(env)).delivery.snapshotId,initialId);
}
due();bucket.fail=true;assert.equal(await collectSnapshot(env,async()=>make()),'failed');bucket.fail=false;assert.equal((await readSnapshot(env)).delivery.snapshotId,initialId);
due();db.failBatch=true;assert.equal(await collectSnapshot(env,async()=>make()),'failed');assert.equal((await readSnapshot(env)).delivery.snapshotId,initialId);
// A partial but substantial snapshot is published; missing values remain null.
due();const partial=make();for(let i=0;i<14;i++){const m=partial.districts[i].measurements[0];m.status='unavailable';m.value=null;m.reasonCode='cloud';}partial.measured=84;partial.status='partial';
assert.equal(await collectSnapshot(env,async()=>partial),'published');assert.equal((await readSnapshot(env)).districts[0].measurements[0].value,null);
// Lease guards prevent an expired older collector replacing a newer result.
due();let release;const slow=collectSnapshot(env,()=>new Promise(resolve=>{release=()=>resolve(make());}));
while(!release) await new Promise(r=>setTimeout(r,1));
assert.equal(await collectSnapshot(env,async()=>make()),'not-due-or-running');
due();assert.equal(await collectSnapshot(env,async()=>make()),'published');const newest=(await readSnapshot(env)).delivery.snapshotId;release();assert.equal(await slow,'superseded');assert.equal((await readSnapshot(env)).delivery.snapshotId,newest);
const ageCase={id:'x',schemaVersion:SNAPSHOT_SCHEMA,collectedAt:'2026-10-20T00:00:00Z',data:make()};
assert.equal(snapshotDelivery(ageCase,Date.parse('2026-10-20T05:00:00Z')).status,'stale');
assert.equal(snapshotDelivery(ageCase,Date.parse('2026-10-28T00:00:00Z')),null);
assert.equal(snapshotDelivery(ageCase,Date.parse('2026-10-19T00:00:00Z')),null);
assert.equal(snapshotDelivery({...ageCase,schemaVersion:999},Date.parse('2026-10-20T01:00:00Z')),null);
// Identical response bodies from different URLs must retain both provenance records.
due();const rawFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('identical',{headers:{'content-type':'text/plain'}});
try { assert.equal(await collectSnapshot(env,async()=>{await fetchSource('https://source.invalid/a');await fetchSource('https://source.invalid/b');return make();}),'published'); }
finally {globalThis.fetch=rawFetch;}
const raw=[...bucket.objects.entries()].filter(([key])=>key.startsWith('raw/'));
assert.equal(raw.length,2);assert.deepEqual(raw.map(([,v])=>v.options.customMetadata.url).sort(),['https://source.invalid/a','https://source.invalid/b']);
assert.equal((await sourceHealth(env)).reasonCode,null);
const unavailableEnv={OBSERVATION_DB:{prepare(){throw Error('db offline');}}};
assert.equal((await sourceHealth(unavailableEnv)).reasonCode,'snapshot-database-unreachable');
assert.equal((await observationHistory(unavailableEnv,null,null)).reasonCode,'snapshot-database-unreachable');
const scheduledTime=Date.now();
await worker.scheduled({cron:'*/15 * * * *',scheduledTime},env,{});
assert.equal((await sourceHealth(env)).collector.last_scheduled_at,new Date(scheduledTime).toISOString(),'automatic scheduler heartbeat lost');
assert.equal((await sourceHealth(env)).collector.published_id,(await readSnapshot(env)).delivery.snapshotId);
assert.equal((await sourceHealth(env)).runs[0].trigger_source,'scheduled');
const manualTime=Date.now();assert.equal(await collectSnapshot(env,async()=>make(),manualTime,true),'published');
assert.equal((await sourceHealth(env)).runs[0].trigger_source,'manual');
assert.equal((await sourceHealth(env)).collector.last_scheduled_at,new Date(scheduledTime).toISOString(),'manual run must not impersonate scheduler heartbeat');
const currentCopy=(await (await worker.fetch(new Request('https://test.invalid/api/atlas/collage'),env)).json()).domains;
assert.equal(currentCopy.find(d=>d.id==='energy').question,'What is the regional long-term solar resource?');
assert.equal(currentCopy.find(d=>d.id==='economy').question,'How bright is this sampled area at night?');
const history=await observationHistory(env,'place-0','signal-0');assert.ok(history.records.length>=2);assert.ok(history.records.some(r=>r.value===0));
assert.ok((await sourceHealth(env)).runs.some(r=>r.status==='failed'));
const sample=samplingWindow(23.81,90.412,12,7);assert.equal(sample.radiusPx,7);assert.ok(sample.bbox[0]<90.412&&sample.bbox[2]>90.412&&sample.bbox[1]<23.81&&sample.bbox[3]>23.81);
assert.ok(Math.abs(groundResolutionM(7,60)/groundResolutionM(7,0)-0.5)<1e-9);
const good={header:{range:'January 2001 - December 2025',sources:['SYN1DEG']},parameters:{ALLSKY_SFC_SW_DWN:{units:'kW-hr/m^2/day'}},geometry:{coordinates:[90.412,23.81]},properties:{parameter:{ALLSKY_SFC_SW_DWN:{ANN:4.5}}}};
assert.equal(selectSolar(good).period,good.header.range);assert.throws(()=>selectSolar({...good,parameters:{}}),/invalid-units/);assert.throws(()=>selectSolar({...good,header:{sources:['SYN1DEG']}}),/missing-period/);
const example=(value,date,censored=false)=>({layerId:'VIIRS_SNPP_DayNightBand_At_Sensor_Radiance',label:'Light',label_bn:'আলো',value,unit:'nW',status:'ok',observationDate:date,coverage:1,censored});
const bounded=readingsFromMeasurements(new Map([['a',[example(10,'2026-10-29',true)]],['b',[example(12,'2026-10-29')]]]),['a','b']).get('a').find(r=>r.domain==='economy');
assert.equal(bounded.basis.rank,null);assert.ok(bounded.reading.includes('≥')&&bounded.reading.includes('lower bound'));
const dates=readingsFromMeasurements(new Map([['a',[example(10,'2026-10-28')]],['b',[example(12,'2026-10-29')]]]),['a','b']);
assert.equal(dates.get('a').find(r=>r.domain==='economy').basis.of,1,'mixed acquisitions were ranked together');
const historical=await worker.fetch(new Request('https://test.invalid'+history.records[0].snapshotUrl),env);assert.equal((await historical.json()).status,'historical');
// Decode actual indexed PNGs: nodata cannot dilute a categorical percentage.
const chunk=(type,bytes)=>{const name=Buffer.from(type);let c=0xffffffff;for(const byte of Buffer.concat([name,bytes])){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}const size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(bytes.length);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([size,name,bytes,crc]);};
const layer=MEASURED_LAYERS.find(l=>l.static),point={id:'fixture',lat:23.8,lng:90.4};
const xy=tileForPoint(point.lat,point.lng,layer.tileLevel),scan=Buffer.alloc(256*257);
for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)scan[(xy.pixelY+dy)*257+1+xy.pixelX+dx]=(dx===0&&dy===0)?2:1;
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(256,0);ihdr.writeUInt32BE(256,4);ihdr[8]=8;ihdr[9]=3;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('PLTE',Buffer.from([0,0,0,255,255,255,255,0,0])),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
const originalNow=Date.now,originalFetch=globalThis.fetch;let fixtureNow=Date.now(),calls=0,offline=true;
Date.now=()=>fixtureNow;globalThis.fetch=async()=>{calls++;if(offline)throw Error('offline');await new Promise(r=>setTimeout(r,5));return new Response(png);};
try{
 assert.equal((await measureLayer(layer,[point],2)).measurements[0].status,'unavailable');
 await measureLayer(layer,[point],2);assert.equal(calls,1,'negative cache did not bound retry');
 fixtureNow+=61000;offline=false;
 const [a,b]=await Promise.all([measureLayer(layer,[point],2),measureLayer(layer,[point],2)]);
 assert.equal(calls,2,'concurrent recovery fetched the same tile twice');
 assert.equal(a.measurements[0].value,11.11);assert.equal(a.measurements[0].coverage,0.36);assert.equal(b.measurements[0].value,11.11);
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
const failedScheduleEnv={...env,OBSERVATION_DB:new DB(),OBSERVATION_ARCHIVE:new Bucket()};
const beforeFailureFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('fixture-upstream-offline');};
try {
 await assert.rejects(()=>worker.scheduled({cron:'*/15 * * * *',scheduledTime},failedScheduleEnv,{}),/scheduled-collection-failed/);
 const failedHealth=await sourceHealth(failedScheduleEnv);
 assert.equal(failedHealth.runs[0].trigger_source,'scheduled');assert.equal(failedHealth.runs[0].status,'failed');assert.equal(failedHealth.collector.published_id,null);
} finally {globalThis.fetch=beforeFailureFetch;}
console.log('✓ Snapshot persistence: cold reads, zero, failed/reduced/partial runs, R2/D1 faults, lease race, history, stale/future/schema rejection and spatial/solar metadata');
