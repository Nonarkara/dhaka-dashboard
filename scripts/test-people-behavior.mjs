import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import worker from '../src/index.ts';

const read = file => readFileSync(new URL('../'+file, import.meta.url));
const manifest = JSON.parse(read('public/data/people-manifest.json'));
const grid = JSON.parse(read('public/data/people-grid.json'));
const facilities = JSON.parse(read('public/data/facilities.geojson'));
const css = read('public/dhaka-design.css').toString();
assert.match(css,/\.people-scale span \{[^}]*background:#b9c9bd/);
for(const [index,color] of [[2,'#c5a56e'],[3,'#b77855'],[4,'#a34830']]) assert.ok(css.includes(`.people-scale span:nth-of-type(${index}) { background:${color}`),'legend colours must target spans independently of the unit label');
for (const [name, asset] of Object.entries(manifest.assets)) {
  const bytes = read('public/data/'+name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  assert.equal(bytes.length, asset.bytes); assert.ok(bytes.length <= 500000);
}
assert.equal(manifest.population.year, 2025); assert.equal(manifest.grid.crs, 'EPSG:32646');
assert.ok(manifest.facilities.extract?.sha256 && manifest.facilities.observedAt);
const ids = new Set(grid.cells.map(c => c[0])); assert.equal(ids.size, grid.cells.length);
const counts = new Map(grid.cells.map(c => [c[0], [0,0,0]]));
const objectIds = new Set();
for (const f of facilities.features) {
  const p = f.properties;
  assert.match(p.osmId, /^(node|way|relation)\/\d+$/); assert.ok(!objectIds.has(p.osmId)); objectIds.add(p.osmId);
  assert.ok(ids.has(p.cell)); counts.get(p.cell)[{school:0,hospital:1,clinic:2}[p.kind]]++;
  assert.ok(f.geometry.coordinates[0] > 90 && f.geometry.coordinates[0] < 91);
  assert.ok(f.geometry.coordinates[1] > 23 && f.geometry.coordinates[1] < 24);
  assert.ok(Object.keys(p).every(k => ['osmId','kind','cell','name','name_bn'].includes(k)));
}
assert.equal(facilities.features.length, manifest.facilities.objects);
for (const row of grid.cells) {
  assert.deepEqual(row.slice(5), counts.get(row[0]));
  assert.ok(row[3] <= row[4]);
  assert.equal(row[2] === null, row[3] === 0);
  if (row[2] !== null) assert.ok(Number.isFinite(row[2]) && row[2] >= 0);
}

const ring = [[90.4,23.8],[90.41,23.8],[90.41,23.81],[90.4,23.81]];
const fixtureGrid = {cells: [['unknown',ring,null,0,100,1,0,0],['zero',ring,0,100,100,0,0,0],['tiny',ring,0.0004,100,100,0,0,0]]};
const fixtureFacilities = {type:'FeatureCollection', features:[{type:'Feature',properties:{osmId:'way/12',cell:'unknown',kind:'school',name:'<img src=x>',name_bn:'বিদ্যালয়'},geometry:{type:'Point',coordinates:[90.4,23.8]}}]};
function harness({attach=true}={}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {hidden:true, value:'', dataset:{}, classList:{add(){},remove(){}}, get innerHTML(){return this.html || '';},set innerHTML(html){this.html=html; for(const match of html.matchAll(/id="([^"]+)"/g))element(match[1]);}});
    return elements.get(id);
  }
  element('people-key'); element('atlas-observation-hud');
  const document = {documentElement:{lang:'en'}, getElementById:id=>elements.get(id) || null};
  const layers=new Map(), sources=new Map(), listeners=new Map(); let failLayer=false, offline=false, corrupt=false, calls=0, release;
  const gate = new Promise(resolve=>release=resolve); let block=false;
  const map = {getLayer:id=>layers.get(id),getSource:id=>sources.get(id),getStyle:()=>({layers:[{id:'city-buildings',type:'fill-extrusion'}]}),addSource(id,s){sources.set(id,s);},removeSource(id){sources.delete(id);},
    addLayer(layer,before){if(failLayer){failLayer=false;throw Error('transient');}layers.set(layer.id,{...layer,before});},removeLayer(id){layers.delete(id);},setLayoutProperty(id,key,value){assert.ok(layers.has(id));layers.get(id)[key]=value;},setFilter(id,value){layers.get(id).filter=value;},on(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},off(type,fn){listeners.get(type)?.delete(fn);},queryRenderedFeatures:()=>map.hits || [],getContainer:()=>({clientWidth:390}),flyTo:options=>map.camera=options};
  const fixtureManifest = structuredClone(manifest);
  const bodies = {'people-grid.json':JSON.stringify(fixtureGrid),'facilities.geojson':JSON.stringify(fixtureFacilities)};
  for(const [name,body] of Object.entries(bodies)) fixtureManifest.assets[name].sha256=createHash('sha256').update(body).digest('hex');
  const context={window:{},document,Intl,TextDecoder,crypto:webcrypto,console:{warn(){}},fetch:async url=>{
    calls++;if(block)await gate;if(offline)throw Error('offline');
    if(url==='/api/atlas/people')return Response.json(fixtureManifest);
    const name=String(url).split('/').pop().split('?')[0];return new Response(corrupt ? '{}' : bodies[name]);
  }};
  vm.runInNewContext(read('public/people.js').toString(),context);
  const api=context.window.AtlasPeople;if(attach)api.attach(map);
  return {api,map,elements,document,layers,sources,listeners,get calls(){return calls;},set offline(v){offline=v;},set corrupt(v){corrupt=v;},set fail(v){failLayer=v;},set block(v){block=v;},release};
}
let early=harness({attach:false});await early.api.activate('people');assert.equal(early.calls,0);await early.api.attach(early.map);assert.equal(early.layers.size,3,'early selection must load when the map attaches');
let h=harness();await h.api.activate('city');assert.equal(h.calls,0,'inactive lens must not fetch');
h.block=true;const loading=h.api.activate('people');await h.api.activate('city');h.release();await loading;
assert.equal(h.layers.size,0,'late fetch must not install an inactive lens');
await h.api.activate('people');assert.equal(h.layers.size,3);assert.equal(h.layers.get('people-cells').before,'city-buildings');
assert.deepEqual(Array.from(h.layers.get('people-cells').paint['fill-color'][3]).slice(2),['#b9c9bd',5000,'#c5a56e',20000,'#b77855',50000,'#a34830']);
h.elements.get('people-filter').onchange({target:{value:'clinic'}});
h.document.documentElement.lang='bn';await h.api.activate('people');assert.equal(h.elements.get('people-filter').value,'clinic');
assert.equal(h.listeners.get('click').size,1,'language refresh duplicates map listener');
await h.api.activate('city');assert.ok([...h.layers.values()].every(l=>l.visibility==='none'));
h.document.documentElement.lang='en';await h.api.activate('people');
for(const [id,expected] of [['unknown','Unknown'],['zero','<strong>0</strong>'],['tiny','<10']]) {
  h.elements.get('people-cell').onchange({target:{value:id}});
  assert.ok(h.elements.get('atlas-observation-hud').innerHTML.includes(expected),id);
}
h.elements.get('people-cell').onchange({target:{value:'unknown'}});
h.elements.get('people-object').onchange({target:{value:'way/12'}});
assert.ok(h.elements.get('atlas-observation-hud').innerHTML.includes('&lt;img'));
assert.ok(h.elements.get('atlas-observation-hud').innerHTML.includes('bounding-box centre'));
h.elements.get('people-focus').onclick();assert.equal(h.map.camera.center[0],90.4);
const manualCamera=h.map.camera;await h.api.activate('people');assert.equal(h.map.camera,manualCamera,'language/refresh must not repeat focus');
h.map.hits=[{layer:{id:'people-cells'},properties:{id:'zero'}},{layer:{id:'people-facilities'},properties:fixtureFacilities.features[0].properties}];
[...h.listeners.get('click')][0]({point:{x:0,y:0}});assert.ok(h.elements.get('atlas-observation-hud').innerHTML.includes('way/12'));
h=harness();h.fail=true;await h.api.activate('people');assert.equal(h.sources.size,0,'failed installation must roll back');
await h.api.activate('people');assert.equal(h.layers.size,3);assert.equal(h.listeners.get('click').size,1);
h=harness();h.offline=true;await h.api.activate('people');assert.match(h.elements.get('people-status').textContent,/unavailable/);
assert.equal(h.elements.get('people-key').dataset.reasonCode,'reference-layer-unavailable');assert.ok(h.elements.get('people-key').dataset.checkedAt);
h.offline=false;await h.api.activate('people');assert.equal(h.layers.size,3,'offline retry failed');
assert.equal(h.elements.get('people-key').dataset.reasonCode,undefined);
h=harness();h.corrupt=true;await h.api.activate('people');assert.equal(h.layers.size,0,'mixed version bytes must be rejected');

const request=new Request('https://test.invalid/api/atlas/people');
const response=await worker.fetch(request,{ASSETS:{fetch:async()=>Response.json(manifest)}});
assert.equal(response.status,200);assert.equal((await response.json()).status,'reference');
assert.equal(response.headers.get('cache-control'),'no-store');
for(const body of [null,{},[]]) {
  const unavailable=await worker.fetch(request,{ASSETS:{fetch:async()=>body===null ? new Response('offline',{status:503}) : Response.json(body)}});
  assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).reasonCode,'reference-manifest-unavailable');
}
console.log(`✓ People reference: ${grid.cells.length} cells, ${facilities.features.length} objects; hashes, counts, unknown/zero, async cancellation, retry, filter/language, keyboard inspection, source escaping and API failure`);
