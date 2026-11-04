import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {deflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {carriesData,fetchTile,tileUrl,verifyDeployedEnvironment} from './lib/verify-gibs.mjs';
const spec={id:'MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth',level:7,ext:'png',probe:{z:7,y:55,x:96}};
const date='2026-11-03',now=Date.parse('2026-11-04T12:00Z');
function rawPng(colorType,row,palette=null,transparency=null) {
 const chunk=(type,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);return b;};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=colorType;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),...(palette?[chunk('PLTE',Buffer.from(palette))]:[]),...(transparency?[chunk('tRNS',Buffer.from(transparency))]:[]),chunk('IDAT',deflateSync(Buffer.from(row))),chunk('IEND',Buffer.alloc(0))]);
}
const png=varied=>rawPng(2,varied?[0,0,0,0,255,255,255,0,0,0,0,255,0,0]:Array(14).fill(0));
const tile=(buf,type='image/png')=>({ok:true,status:200,bytes:buf.length,type,buf});
const full=tile(png(true)),blank=tile(png(false));
assert.equal(await carriesData(full),true);assert.equal(await carriesData(blank),false);
const encode=rgba=>jpeg.encode({width:2,height:2,data:Buffer.from(rgba)},100).data;
const white=Array.from({length:4},()=>[255,255,255,255]).flat();
const varied=[0,0,0,255,255,255,255,255,255,0,0,255,0,0,255,255];
assert.equal(await carriesData(tile(encode(white),'image/jpeg')),false,'uniform JPEG cannot clear imagery');
assert.equal(await carriesData(tile(encode(varied),'image/jpeg')),true,'JPEG is decoded independently');
assert.equal(await carriesData(tile(Buffer.from('fake JPEG'),'image/jpeg')),false,'malformed JPEG rejected');
assert.equal(await carriesData({...full,type:'text/html'}),false);
const layer=()=>({id:spec.id,kind:'gibs-raster',tile_level:7,format:'png',status:'ok',latest_date:date,reasonCode:null,template:tileUrl(spec,date,true)});
const radar={id:'rainviewer-radar',kind:'json-endpoint',endpoint:'https://api.rainviewer.com/public/weather-maps.json',status:'ok',latest_date:date,reasonCode:null,template:null};
const body=entries=>{const layers=[...entries,radar];return {status:layers.every(l=>l.status==='ok')?'ok':layers.every(l=>l.status==='unavailable')?'unavailable':'partial',reasonCode:layers.every(l=>l.status==='ok')?null:'some-sources-unavailable',timestamp:new Date(now).toISOString(),layers};};
const unavailable=()=>({...layer(),status:'unavailable',latest_date:null,template:null,reasonCode:'gibs-no-observation'});
let requested=[];
const readTile=async url=>{requested.push(url);return url===tileUrl(spec,date)?full:{ok:false,status:404,bytes:0,type:null};};
const verify=(b,options={})=>verifyDeployedEnvironment(b,[spec],{readTile,now,...options});
let result=await verify(body([layer()]));assert.deepEqual(result.failures,[]);assert.equal(result.verified.length,1);
assert.deepEqual(requested,[tileUrl(spec,date)],'only advertised dated tile probed; an undated404 does not veto valid dated content');
result=await verify(body([unavailable()]));assert.deepEqual(result.failures,[]);assert.equal(result.degraded.length,1);assert.equal(result.verified.length,0,'unavailable is never a healthy-image claim');
for(const corrupt of [
 l=>({...l,latest_date:null}),l=>({...l,latest_date:'2000-01-01',template:tileUrl(spec,'2000-01-01',true)}),l=>({...l,latest_date:'2026-11-05'}),l=>({...l,latest_date:'2026-02-30'}),
 l=>({...l,template:tileUrl(spec,'2026-11-02',true)}),l=>({...l,template:l.template.replace('gibs.earthdata.nasa.gov','example.com')}),
 l=>({...l,tile_level:9}),l=>({...l,format:'jpg'}),l=>({...l,kind:'json-endpoint'}),l=>({...l,reasonCode:'source-is-down'}),
])assert.ok((await verify(body([corrupt(layer())]))).failures.length,'falseok or registry mismatch must fail');
for(const badTile of [blank,{ok:false,status:404,bytes:0,type:null},tile(Buffer.from('invalid'),'image/png'),{...full,type:'image/jpeg'}])assert.ok((await verify(body([layer()]),{readTile:async()=>badTile})).failures.length,'advertised falseok/blank404/malformed/wrongformat rejected');
for(const l of [{...unavailable(),reasonCode:null},{...unavailable(),template:tileUrl(spec,date,true)},{...unavailable(),latest_date:date}])assert.ok((await verify(body([l]))).failures.length,'unavailable requires reason and null observation');
assert.ok((await verify(body([]))).failures.length,'missing expected source fails');
assert.ok((await verify(body([layer(),layer()]))).failures.length,'duplicate source fails');
assert.ok((await verify(body([layer(),{...layer(),id:'invented-source'}]))).failures.length,'unregistered source fails');
const second={...spec,id:'VIIRS_SNPP_DayNightBand'};
const mixed=body([layer(),{...unavailable(),id:second.id}]);
result=await verifyDeployedEnvironment(mixed,[spec,second],{readTile,now});assert.deepEqual(result.failures,[]);assert.equal(result.verified.length,1);assert.equal(result.degraded.length,1);
assert.ok((await verifyDeployedEnvironment({...mixed,status:'ok'},[spec,second],{readTile,now})).failures.length,'partial outage cannot claim overallok');
assert.ok((await verifyDeployedEnvironment({...mixed,reasonCode:null},[spec,second],{readTile,now})).failures.length,'degradation needs machine-readable reason');
const failed=await fetchTile('https://invalid.local',async()=>new Response('missing',{status:404}));assert.equal(failed.status,404);assert.equal(failed.ok,false);
const script=readFileSync(new URL('./verify-gibs-live.mjs',import.meta.url),'utf8');
assert.match(script,/if \(!apiBase\) for/,'standalone strict upstream smoke remains separate');
assert.match(script,/no healthy imagery claim/,'degraded output cannot announce healthy imagery');
console.log('✓ GIBS verifier: exact advertised date, decoded PNG/JPEG, blanks/404/type mismatch, source registry, degraded null/reason and mixed-source status');

const complete=body([layer()]);
assert.ok((await verify({...complete,layers:complete.layers.filter(l=>l.id!=='rainviewer-radar')})).failures.length,'radar registry presence required');
for(const timestamp of ['2000-01-01T00:00:00Z',new Date(now+120000).toISOString()])assert.ok((await verify({...complete,timestamp})).failures.length,'stale/future status response rejected');
const radarDown={...radar,status:'unavailable',latest_date:null,reasonCode:'radar-no-frame'};
result=await verify({...complete,status:'partial',reasonCode:'some-sources-unavailable',layers:[layer(),radarDown]});assert.deepEqual(result.failures,[]);assert.equal(result.degraded.length,1,'radar outage is counted, not silently skipped');

const rgbaHidden=rawPng(6,[0,0,0,0,0,255,255,255,0,0,255,255,255,0,0,0,0,0]);
const rgbaVisible=rawPng(6,[0,0,0,0,255,255,255,255,255,0,255,255,255,255,0,0,0,255]);
assert.equal(await carriesData(tile(rgbaHidden)),false,'wholly transparent RGBA variance is not an observation');
assert.equal(await carriesData(tile(rgbaVisible)),true,'opaque RGBA black zero versus white retained');
const palette=[0,0,0,255,255,255,128,128,128];
assert.equal(await carriesData(tile(rawPng(3,[0,0,1,0,1,0],palette,[0,0,255]))),false,'palette transparency hides varied RGB');
assert.equal(await carriesData(tile(rawPng(3,[0,0,1,0,1,0],palette,[255,255,0]))),true,'visible palette variance remains data');
assert.equal(await carriesData(tile(rawPng(3,[0,0,1,0,2,1],palette,[0,255,0]))),false,'only transparent entries vary; visible white remains uniform');
console.log('✓ Shared GIBS decoder: transparent RGBA and palette variance excluded, opaque zero/variation preserved');

const badSignature=Buffer.from(png(true));badSignature.write('NOTAPNG!');
assert.equal(await carriesData(tile(badSignature)),false,'non-PNG signature cannot pass the browser image contract');
assert.equal(await carriesData(tile(rawPng(2,[0,0,0,0,255,255,255]))),false,'truncated decoded scanlines rejected');
assert.equal(await carriesData(tile(rawPng(2,[5,0,0,0,255,255,255,0,0,0,0,255,0,0]))),false,'invalid scanline filter rejected');
const badChunk=Buffer.from(png(true));badChunk.writeUInt32BE(0x7fffffff,8);
assert.equal(await carriesData(tile(badChunk)),false,'out-of-bounds chunk rejected');
console.log('✓ PNG transport validation: real signature, complete chunks/scanlines and supported filters');

assert.ok((await verify({...body([layer()]),reasonCode:'all-sources-down'})).failures.length,'healthy envelope cannot carry outage reason');
