import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as Three from '../public/vendor/three-0.168.0/three.module.js';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const detail=JSON.parse(read('public/data/parliament-buildings.geojson'));
const parliament=detail.features.find(f=>f.id==='relation/18085267');
assert.ok(parliament);
assert.equal(parliament.geometry.type,'MultiPolygon');
assert.ok(parliament.geometry.coordinates.reduce((n,p)=>n+p.length-1,0)>=10,'courtyards retained');
assert.ok(!detail.features.some(f=>f.id==='way/24448328'),'no duplicate member outline');
assert.equal(parliament.properties.height_method,'levels-times-3m');
assert.equal(parliament.properties.height_m,24);
assert.ok(detail.features.length>3000 && detail.features.length<15000);
assert.equal(new Set(detail.features.map(f=>f.id)).size,detail.features.length);
for(const f of detail.features) {
  assert.ok(f.properties.height_m>f.properties.min_height_m);
  assert.ok(f.properties.source_url && f.properties.osm_modified_at);
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const polygon of polygons) for(const ring of polygon) {
    assert.ok(ring.length>=4);
    assert.deepEqual(ring[0],ring.at(-1));
    assert.ok(ring.every(p=>p.length===2 && p.every(Number.isFinite)));
  }
}
function app({offline=false,search=''}={}) {
  const elements=new Map(['atlas-view','atlas-lens-title','atlas-lens-description','atlas-layer-status','atlas-observation-hud'].map(id=>[id,{value:'3d',textContent:'',hidden:true,classList:{remove(){}},addEventListener(){}}]));
  let map;
  class MapStub {
    constructor(options){this.layers=new Map(options.style.layers.map(l=>[l.id,l]));this.sources=new Map();this.options=options;this.events=new Map();this.inside=true;this.zoom=16.7;this.ready=false;map=this;}
    on(type,...args){this.events.set(type,args.at(-1));}
    off(type){this.events.delete(type);}
    addControl(){}
    getLayer(id){return this.layers.get(id);}
    getLayoutProperty(id,key){return this.getLayer(id)?.layout?.[key];}
    setLayoutProperty(id,key,value){const l=this.getLayer(id);l.layout??={};l.layout[key]=value;}
    setFilter(id,value){this.getLayer(id).filter=value;}
    setPaintProperty(id,key,value){const l=this.getLayer(id);l.paint??={};l.paint[key]=value;}
    getPaintProperty(id,key){return this.getLayer(id)?.paint?.[key];}
    addLayer(l,before){this.layers.set(l.id,l);if(l.type==='raster')this.lastRasterBefore=before;}
    addSource(id,data){this.sources.set(id,data);}
    getSource(id){return this.sources.get(id);}
    removeLayer(id){this.layers.delete(id);}
    removeSource(id){this.sources.delete(id);}
    isSourceLoaded(){return this.ready;}
    getZoom(){return this.zoom;}
    getContainer(){return {clientWidth:this.width||390};}
    getBounds(){const [w,s,e,n]=detail.bbox;return {getWest:()=>this.inside?w+.002:w-.1,getSouth:()=>s+.002,getEast:()=>e-.002,getNorth:()=>n-.002};}
    flyTo(options){this.camera=options;}
  }
  const window={maplibregl:{Map:MapStub,NavigationControl:class{}},location:{search},addEventListener(){}};
  // GIBS serves a blank placeholder tile for a date whose observation has not
  // been ingested: HTTP 200, non-empty, opaque, one uniform colour. The stub
  // below reproduces that so the client is forced to decode the tile rather
  // than trust the status code or the byte count.
  const today=()=>new Date().toISOString().split('T')[0];
  const UNIFORM=new Uint8ClampedArray(4*4*4).fill(255);
  const VARIED=new Uint8ClampedArray(4*4*4);
  for(let i=0;i<VARIED.length;i+=4){VARIED[i]=i%255;VARIED[i+1]=120;VARIED[i+2]=200;VARIED[i+3]=255;}
  const isBlank=(url)=>url.includes('gibs.earthdata')&&url.includes(`/${today()}/`);
  class FakeCanvas{constructor(w,h){this.width=w;this.height=h;}getContext(){return{
    drawImage(bitmap){this._bitmap=bitmap;},
    getImageData(){return {data:this._bitmap&&this._bitmap.blank?UNIFORM:VARIED};},
  };}}
  const context={
    window,
    document:{documentElement:{lang:'en'},querySelector:s=>elements.get(s.slice(1))||null,querySelectorAll:()=>[]},
    URLSearchParams,AbortSignal,console:{warn(){}},setTimeout(){},setInterval(){},
    OffscreenCanvas:FakeCanvas,
    createImageBitmap:async blob=>({width:4,height:4,blank:!!blob.blank,close(){}}),
    fetch:async url=>{
      if(offline)throw new Error('offline');
      const blank=isBlank(url);
      return {ok:true,status:200,headers:{get:()=>blank?'1611':'59778'},
        blob:async()=>({size:blank?1611:59778,blank}),
        json:async()=>url.includes('parliament-buildings')?detail:url.includes('dhaka-areas')?JSON.parse(read('public/dhaka-areas.json')):{status:'unavailable'}};
    },
  };
  let source=read('public/app.js');
  source=source.slice(0,source.indexOf('  // Safe boot:'))+'window.test={initMap,applyLens,syncBuildingVisibility,loadDataLayers,loadParliamentBuildings,flyToArea,buildingPaint,showInspectionHUD,ParliamentModelLayer,attachModelForTest:model=>{parliamentModel=model;}};})();';
  vm.runInNewContext(source,context);
  window.test.initMap();
  return {api:window.test,map,elements,maplibre:window.maplibregl};
}
let {api,map,elements,maplibre}=app();
for(const lens of ['city','heritage','rivers','transit','economy','air','haze','rain','radar','cloud','night','water']) {
  api.applyLens(lens);
  assert.equal(map.getLayoutProperty('city-buildings','visibility'),'visible',lens);
}
// The satellite raster is added once its observation has been resolved and
// decoded, so it lands after the synchronous lens switch.
await new Promise(r=>setTimeout(r,0));
assert.equal(map.lastRasterBefore,'city-buildings','raster under blocks');
// The satellite lenses must reach the map as a real GIBS raster source. A
// source pointing at a layer id GIBS does not publish still counts as "a raster
// was added", so assert the layer id and tile matrix set that the map received.
for(const [lens,layer,level] of [
  ['cloud','VIIRS_NOAA20_CorrectedReflectance_TrueColor','GoogleMapsCompatible_Level9'],
  ['aerosol','MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth','GoogleMapsCompatible_Level7'],
  ['night','VIIRS_SNPP_DayNightBand','GoogleMapsCompatible_Level7'],
  ['water','VIIRS_Combined_Flood_1-Day','GoogleMapsCompatible_Level9'],
]) {
  api.applyLens(lens);
  await new Promise(r=>setTimeout(r,0));
  const source=map.getSource(`nasa-${lens}`);
  assert.ok(source,`${lens} raster source added`);
  assert.equal(source.type,'raster',`${lens} source is a raster`);
  assert.ok(source.tiles[0].includes(`/best/${layer}/default/`),`${lens} tile uses ${layer}`);
  assert.ok(source.tiles[0].includes(level),`${lens} tile uses ${level}`);
  assert.ok(source.tiles[0].startsWith('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'),`${lens} tile host`);
  // GIBS can serve a blank placeholder for a date whose observation has not
  // been ingested yet. The lens must not settle on that date.
  const dated=source.tiles[0].match(/default\/(\d{4}-\d{2}-\d{2})\//);
  assert.ok(dated,`${lens} tile is pinned to an observation date`);
  assert.notEqual(dated[1],new Date().toISOString().split('T')[0],`${lens} rejected the blank placeholder date`);
  assert.ok(dated[1]===new Date(Date.now()-86400000).toISOString().split('T')[0],`${lens} fell back to the newest date carrying data`);
}
// Night-time radiance only reads as night over a dark ground, so the daylight
// basemap is dimmed for that lens and restored for every other one.
api.applyLens('night');await new Promise(r=>setTimeout(r,0));
assert.equal(map.getPaintProperty('basemap-esri','raster-opacity'),0.18,'night dims the daylight basemap');
api.applyLens('city');await new Promise(r=>setTimeout(r,0));
assert.equal(map.getPaintProperty('basemap-esri','raster-opacity'),1,'other lenses restore the basemap');
await api.loadParliamentBuildings();
assert.equal(map.getLayoutProperty('parliament-buildings','visibility'),'none','no early switch');
map.ready=true;
map.events.get('sourcedata')({sourceId:'parliament-detail',isSourceLoaded:true});
assert.equal(map.getLayoutProperty('city-buildings','visibility'),'none');
assert.equal(map.getLayoutProperty('parliament-buildings','visibility'),'visible');
api.applyLens('cloud');await new Promise(r=>setTimeout(r,0));assert.equal(map.lastRasterBefore,'parliament-buildings','raster under local blocks');
api.applyLens('heritage');
assert.equal(map.getLayoutProperty('parliament-buildings','visibility'),'visible','heritage keeps blocks');
map.inside=false;api.syncBuildingVisibility();
assert.equal(map.getLayoutProperty('city-buildings','visibility'),'visible','pan restores city');
assert.equal(map.getLayoutProperty('parliament-buildings','visibility'),'none');
map.inside=true;map.zoom=15;api.syncBuildingVisibility();
assert.equal(map.getLayoutProperty('city-buildings','visibility'),'visible','low zoom stays city');
map.zoom=16.7;elements.get('atlas-view').value='2d';api.syncBuildingVisibility();
for(const id of ['city-buildings','parliament-buildings'])assert.equal(map.getLayoutProperty(id,'visibility'),'none','2d hides both');
const area=JSON.parse(read('public/dhaka-areas.json')).find(a=>a.id==='parliament');
api.flyToArea(area);assert.equal(map.camera.pitch,0);assert.equal(map.camera.bearing,0);
elements.get('atlas-view').value='3d';api.flyToArea(area);
assert.equal(map.camera.pitch,area.pitch);assert.equal(map.camera.bearing,area.bearing);assert.ok(map.camera.zoom>=16);
map.width=1440;api.flyToArea(area);assert.ok(map.camera.zoom>17.5,"wide camera fits detail coverage");
({api,map}=app({offline:true}));await api.loadParliamentBuildings();
assert.equal(map.getLayoutProperty('city-buildings','visibility'),'visible','offline retains city');
function evaluate(e,props) {
  if(!Array.isArray(e))return e;
  const [op,...args]=e;
  if(op==='get')return props[args[0]];
  if(op==='to-number'){for(const arg of args){const v=evaluate(arg,props);if(v!==null && v!==undefined && Number.isFinite(Number(v)))return Number(v);}return 0;}
  if(op==='max')return Math.max(...args.map(x=>evaluate(x,props)));
  if(op==='>')return evaluate(args[0],props)>evaluate(args[1],props);
  if(op==='+')return evaluate(args[0],props)+evaluate(args[1],props);
  if(op==='case')return evaluate(args[0],props)?evaluate(args[1],props):evaluate(args[2],props);
  throw new Error(op);
}
const paint=api.buildingPaint('render_height','render_min_height');
for(const height of [undefined,null,0,-1])assert.equal(evaluate(paint['fill-extrusion-height'],{render_height:height}),6);
assert.equal(evaluate(paint['fill-extrusion-height'],{render_height:35.7}),35.7);
assert.equal(evaluate(paint['fill-extrusion-height'],{render_min_height:10}),16);
console.log(`✓ Building behavior: ${detail.features.length} real footprints, Parliament courtyards, all lenses, exclusive detail switch, pan/offline/2D fallback and authored camera`);

({api,map}=app());
const authored=JSON.parse(read('public/dhaka-areas.json')).find(a=>a.id==='parliament');
api.flyToArea(authored,0);const authoredCamera=map.camera;
api.applyLens('city');assert.equal(map.camera,authoredCamera,'same-lens refresh must not overwrite authored Parliament view');
api.applyLens('heritage');const heritageCamera=map.camera;
api.applyLens('heritage');assert.equal(map.camera,heritageCamera,'language refresh must preserve camera');
console.log('✓ Camera lifecycle: authored Parliament and manual same-lens views survive evidence/language refresh');
({api,map}=app({search:'?area=parliament'}));api.applyLens('people');const earlyPeopleCamera=map.camera;await api.loadDataLayers();assert.equal(map.camera,earlyPeopleCamera,'late URL-area load must not overwrite an early people selection');
api.applyLens('rivers'); api.applyLens('people');
assert.equal(map.camera.center[0],90.4,'people lens must return from northeast rivers to Dhaka');
const peopleCamera=map.camera;api.applyLens('people');
assert.equal(map.camera,peopleCamera,'same-lens people refresh must preserve the camera');

({api,map,elements}=app());api.showInspectionHUD('landmark',{name:'<img src=x onerror=alert(1)>',description:'<script>bad()</script>'});
assert.ok(!elements.get('atlas-observation-hud').innerHTML.includes('<img'));
assert.ok(elements.get('atlas-observation-hud').innerHTML.includes('&lt;img'));
console.log('✓ Inspection security: untrusted map labels render as text');
api.showInspectionHUD('gauge',{});
assert.ok(!elements.get('atlas-observation-hud').innerHTML.includes('SW42'),'missing station code must not invent a match');
assert.ok(!elements.get('atlas-observation-hud').innerHTML.includes('m MSL'),'unverified datum must not look surveyed');
assert.ok(elements.get('atlas-observation-hud').innerHTML.includes('vertical datum are unverified'));

// Actual Three.js matrices accept the MapLibre6 render input without .elements.set.
let renders=0;
const renderer=class {resetState(){} render(){renders++;}};
const model=new Three.Group();
const renderCase=app();
const layer=new renderCase.api.ParliamentModelLayer(90.378,23.762,{...Three,WebGLRenderer:renderer},model);
const identity=new Three.Matrix4().elements;
const layerMap={getCanvas:()=>({getBoundingClientRect:()=>({width:390,height:844})}),triggerRepaint(){}};
// The context's maplibregl object is shared with the actual closure.
// Mercator conversion is injected as the map library API, not copied camera internals.
// Expose the map library only inside this test harness.
renderCase.maplibre.MercatorCoordinate={fromLngLat:()=>({x:0.75,y:0.5,z:0,meterInMercatorCoordinateUnits:()=>1e-8})};
layer.onAdd(layerMap,{});layer.visible=true;layer.render({}, {defaultProjectionData:{mainMatrix:identity}});
assert.equal(renders,1);assert.ok(layer.camera.projectionMatrix.elements.every(Number.isFinite));assert.equal(layer.renderingMode,'3d');
layer.visible=false;layer.render({}, {defaultProjectionData:{mainMatrix:identity}});assert.equal(renders,1,'2D or out-of-coverage model rendered');
console.log('✓ Parliament custom render: MapLibre6 matrix, actual Three.js array storage, shared canvas and visibility');

renderCase.map.ready=true;
await renderCase.api.loadParliamentBuildings();
renderCase.api.attachModelForTest(layer);renderCase.api.syncBuildingVisibility();
assert.equal(renderCase.map.getLayoutProperty('parliament-buildings','visibility'),'visible','model hid all nearby mapped buildings');
renderCase.elements.get('atlas-view').value='2d';renderCase.api.syncBuildingVisibility();assert.equal(layer.visible,false);
