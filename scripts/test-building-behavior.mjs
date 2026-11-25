import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const detail=JSON.parse(read('public/data/parliament-buildings.geojson'));
const parliament=detail.features.find(f=>f.id==='relation/18085267');
assert.ok(parliament);
assert.equal(parliament.geometry.type,'MultiPolygon');
assert.ok(parliament.geometry.coordinates.reduce((n,p)=>n+p.length-1,0)>=10,'courtyards retained');
assert.ok(!detail.features.some(f=>f.id==='way/24448328'),'no duplicate member outline');
assert.equal(parliament.properties.height_method,'unknown');
assert.equal(parliament.properties.height_m,null);
assert.equal(parliament.properties.levels,8,'source floor count retained without metre conversion');
assert.ok(detail.features.length>3000 && detail.features.length<15000);
assert.equal(new Set(detail.features.map(f=>f.id)).size,detail.features.length);
for(const f of detail.features) {
  assert.ok(f.properties.height_m===null || f.properties.height_method==='osm-height-tag' && f.properties.height_m>f.properties.min_height_m);
  if(f.properties.height_m===null)assert.equal(f.properties.height_tier,'unavailable');
  assert.ok(f.properties.source_url && f.properties.osm_modified_at);
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const polygon of polygons) for(const ring of polygon) {
    assert.ok(ring.length>=4);
    assert.deepEqual(ring[0],ring.at(-1));
    assert.ok(ring.every(p=>p.length===2 && p.every(Number.isFinite)));
  }
}
function app({offline=false,search='',rainfall=null,inside=true,fetchOverride=null}={}) {
  const elements=new Map(['atlas-view','atlas-basemap','atlas-centre-inspection','atlas-centre-inspection-status','atlas-lens-title','atlas-lens-description','atlas-layer-status','atlas-observation-hud','radar-play','radar-output'].map(id=>[id,{value:'3d',textContent:'',hidden:true,classList:{remove(){}},addEventListener(type,handler){this[type]=handler;}}]));
  elements.get('atlas-layer-status').querySelector=s=>elements.get(s==='#radar-play'?'radar-play':'radar-output');
  const ticks=new Map(), timeouts=new Map(), events={},requests=[];let tickId=0;
  let map;
  class MapStub {
    constructor(options){this.layers=new Map(options.style.layers.map(l=>[l.id,l]));this.sources=new Map();this.options=options;this.events=new Map();this.eventRegistrations=[];this.inside=inside;this.zoom=16.7;this.ready=false;map=this;}
    on(type,...args){this.eventRegistrations.push([type,args[0]]);this.events.set(type,args.at(-1));}
    once(type,...args){this.events.set(type,args.at(-1));}
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
    querySourceFeatures(id){return this.ready && !this.metadataOnly ? this.sources.get(id)?.data.features || [] : [];}
    getZoom(){return this.zoom;}
    getContainer(){return {clientWidth:this.width||390};}
    getBounds(){const [w,s,e,n]=detail.bbox;return {getWest:()=>this.inside?w+.002:90.40,getSouth:()=>this.inside?s+.002:23.767,getEast:()=>this.inside?e-.002:90.414,getNorth:()=>this.inside?n-.002:23.775};}
    flyTo(options){this.camera=options;}
  }
  const window={maplibregl:{Map:MapStub,NavigationControl:class{}},location:{search},addEventListener:(event,fn)=>events[event]=fn};
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
    document:{documentElement:{lang:'en',dataset:{theme:'dark'}},hidden:false,querySelector:s=>elements.get(s.slice(1))||null,querySelectorAll:()=>[],addEventListener:(event,fn)=>events[event]=fn},
    URLSearchParams,AbortSignal,AbortController,console:{warn(){}},setTimeout(fn,ms){timeouts.set(++tickId,{fn,ms});return tickId;},clearTimeout(id){timeouts.delete(id);},setInterval(fn){ticks.set(++tickId,fn);return tickId;},clearInterval(id){ticks.delete(id);},
    OffscreenCanvas:FakeCanvas,
    createImageBitmap:async blob=>({width:4,height:4,blank:!!blob.blank,close(){}}),
    fetch:async (url,options)=>{
      requests.push(url);
      if(fetchOverride){const overridden=fetchOverride(url,options);if(overridden!==undefined)return await overridden;}
      if(offline)throw new Error('offline');
      const blank=isBlank(url);
      return {ok:true,status:200,headers:{get:()=>blank?'1611':'59778'},
        blob:async()=>({size:blank?1611:59778,blank}),
        json:async()=>url.includes('/api/atlas/rainfall')&&rainfall?rainfall:url.includes('rainviewer')?{host:'https://tilecache.rainviewer.com',radar:{past:[{path:'/radar/1',time:1700000000},{path:'/radar/2',time:1700000300}]}}:url.includes('city-height-buildings')?JSON.parse(read('public/data/city-height-buildings.geojson')):url.includes('parliament-buildings')?detail:url.includes('dhaka-areas')?JSON.parse(read('public/dhaka-areas.json')):{status:'unavailable'}};
    },
  };
  let source=read('public/app.js');
  source=source.slice(0,source.indexOf('  // Safe boot:'))+'window.test={initMap,applyLens,syncBuildingVisibility,loadDataLayers,loadParliamentBuildings,loadCityHeights,flyToArea,buildingPaint,showInspectionHUD,loadLensEvidence,pauseRadar,wireUIEvents,performSearch,scheduleWatch,pauseBackground,scheduleSolar};})();';
  vm.runInNewContext(source,context);
  window.test.initMap();
  return {api:window.test,map,elements,maplibre:window.maplibregl,ticks,timeouts,events,window,requests,document:context.document};
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
  ['night','VIIRS_NOAA20_DayNightBand','GoogleMapsCompatible_Level7'],
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
map.metadataOnly=true;
map.events.get('sourcedata')({sourceId:'parliament-detail',isSourceLoaded:true});
assert.notEqual(map.getLayoutProperty('city-footprints','visibility'),'none','metadata without local features must retain streamed footprints');
map.metadataOnly=false;
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
  if(op==='<')return evaluate(args[0],props)<evaluate(args[1],props);
  if(op==='>=')return evaluate(args[0],props)>=evaluate(args[1],props);
  if(op==='<=')return evaluate(args[0],props)<=evaluate(args[1],props);
  if(op==='+')return evaluate(args[0],props)+evaluate(args[1],props);
  if(op==='case')return evaluate(args[0],props)?evaluate(args[1],props):evaluate(args[2],props);
  throw new Error(op);
}
const paint=api.buildingPaint('render_height','render_min_height');
for(const height of [undefined,null,0,-1])assert.equal(evaluate(paint['fill-extrusion-height'],{render_height:height}),0);
assert.equal(evaluate(paint['fill-extrusion-height'],{render_height:35.7}),35.7);
assert.equal(evaluate(paint['fill-extrusion-height'],{render_min_height:10}),0);
// A bad height tag is a bad tag, not a tall building. The atlas clamps it
// rather than extruding a hundred-kilometre tower over the city.
assert.equal(evaluate(paint['fill-extrusion-height'],{render_height:99999}),500,'an absurd height is clamped');
assert.equal(evaluate(paint['fill-extrusion-height'],{render_height:-12}),0,'a negative height stays flat');

// The layers the map actually draws must go THROUGH that clamp, not around
// it. A raw height expression on the layer would let a corrupt tag extrude a
// hundred-kilometre tower while the clamp sat unused in a helper, which is
// exactly what the street-level massing did until this test existed.
for(const layerId of ['city-buildings','walk-massing']){
  const layerPaint=map.getLayer(layerId)?.paint;
  assert.ok(layerPaint,`${layerId} has no paint`);
  assert.equal(evaluate(layerPaint['fill-extrusion-height'],{render_height:35.7}),0,`${layerId} must not turn a provider default into an explicit source height`);
  assert.equal(evaluate(layerPaint['fill-extrusion-height'],{render_height:99999}),0,`${layerId} must ignore untraceable provider heights`);
  assert.equal(evaluate(layerPaint['fill-extrusion-height'],{render_height:-12}),0,`${layerId} extrudes a negative height`);
  assert.equal(evaluate(layerPaint['fill-extrusion-height'],{render_height:0}),0,`${layerId} invents a height for a flat footprint`);
  assert.equal(evaluate(layerPaint['fill-extrusion-base'],{render_min_height:0}),0,`${layerId} invents a base`);
  assert.equal(layerPaint['fill-extrusion-opacity'],1,`${layerId} draws translucent walls over a filled footprint`);
}
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

// Preserve the authored sketch without placing invented dimensions on the map.
const client=read('public/app.js');
assert.ok(!client.includes('new ParliamentModelLayer'));
assert.ok(!client.includes('buildParliamentModel'));
assert.ok(read('public/parliament-reference.js').includes('function buildParliamentModel'));
assert.ok(read('public/parliament-reference.html').includes('no surveyed source'));
assert.ok(!read('public/parliament-reference.js').includes('requestAnimationFrame'),'static design study has no autoplay loop');
api.showInspectionHUD('landmark',{});assert.ok(!elements.get('atlas-observation-hud').innerHTML.includes('15 m'));
console.log('✓ Geographic truth: unknown source heights flat, explicit tags retained, sketch separated from map, no invented landmark height');

const radarCase=app();radarCase.api.wireUIEvents();
radarCase.api.applyLens('radar');await new Promise(r=>setTimeout(r,0));
assert.equal(radarCase.ticks.size,0,'radar starts paused');
radarCase.elements.get('radar-play').onclick();assert.equal(radarCase.ticks.size,1,'explicit play starts radar');
radarCase.map.events.get('dragstart')({originalEvent:{}});assert.equal(radarCase.ticks.size,0,'manual input stops radar');
radarCase.elements.get('radar-play').onclick();radarCase.document.hidden=true;radarCase.events.visibilitychange();assert.equal(radarCase.ticks.size,0,'hidden page stops radar');
radarCase.document.hidden=false;assert.equal(radarCase.ticks.size,0,'visible page stays paused');
radarCase.elements.get('radar-play').onclick();radarCase.api.applyLens('city');assert.equal(radarCase.ticks.size,0,'task change stops radar');
radarCase.api.applyLens('radar');await new Promise(r=>setTimeout(r,0));radarCase.window.matchMedia=()=>({matches:true});radarCase.elements.get('radar-play').onclick();assert.equal(radarCase.ticks.size,0,'reduced motion suppresses radar');
console.log('✓ Radar motion: paused start, explicit play, map input, hidden page, task change and reduced motion');

const rainCase=app({rainfall:{status:'ok',catchments:[{id:'x',name:'Query',lat:23.7,lng:90.4,status:'ok',rain_24h_sum_mm:0,validFrom:'2026-11-04T00:00Z',validTo:'2026-11-05T00:00Z',retrievedAt:'2026-11-04T01:00Z',source:'Open-Meteo'},{id:'missing',status:'ok',rain_24h_sum_mm:null}]}});
rainCase.api.applyLens('rain');await new Promise(r=>setTimeout(r,0));
const rainFeatures=rainCase.map.getSource('catchment-rain').data.features;
assert.equal(rainFeatures.length,1,'missing rainfall is never drawn as zero');
assert.equal(rainFeatures[0].properties.rain_24h_sum_mm,0,'real zero retained');
assert.equal(rainFeatures[0].properties.validFrom,'2026-11-04T00:00Z');
assert.equal(rainFeatures[0].properties.source,'Open-Meteo');
console.log('✓ Rain map: missing values omitted, true zero retained, interval and source preserved for inspection');

api.showInspectionHUD('landmark',{name:'Reference tower',height_m:35.7},null);
assert.match(elements.get('atlas-observation-hud').innerHTML,/Unverified registry height/,'legacy landmark registry values must not read as surveyed heights');

// The skyline must come from source geometry/heights, including actual towers.
const skyline=JSON.parse(read('public/data/city-height-buildings.geojson'));
assert.equal(new Set(skyline.features.map(f=>f.id)).size,skyline.features.length);
assert.ok(skyline.features.length>200);
for(const f of skyline.features){
  assert.ok(f.properties.height_m>0 && f.properties.height_m<=500);
  assert.ok(f.properties.source_url.endsWith(f.id));
  assert.ok(f.properties.osm_modified_at && f.properties.height_source_url);
  assert.ok(['osm-height-tag','published-project-height'].includes(f.properties.height_method));
  for(const polygon of f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates])for(const ring of polygon){
    assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.length>=4);
    assert.ok(ring.every(p=>p.length===2 && p.every(Number.isFinite)));
  }
}
const pinnacle=skyline.features.find(f=>f.id==='relation/12770867');
assert.equal(pinnacle.properties.height_m,152.3);
assert.equal(pinnacle.properties.osm_height_m,120,'source conflict must remain inspectable');
assert.equal(pinnacle.properties.floors,40);
assert.match(pinnacle.properties.height_source_url,/ascentis\.build/);
assert.equal(skyline.features.find(f=>f.id==='way/686702285').properties.height_m,118);
({api,map,elements}=app());await api.loadCityHeights();
const sourcePaint=map.getLayer('city-height-buildings').paint;
assert.equal(evaluate(sourcePaint['fill-extrusion-height'],pinnacle.properties),152.3);
assert.equal(evaluate(sourcePaint['fill-extrusion-height'],{height_m:null,'building:levels':50}),0,'50 floors alone cannot invent metre height');
assert.ok(map.options.zoom>=map.getLayer('city-footprints').minzoom,'opening view must actually reach building zoom floor');
api.applyLens('city',{moveCamera:true});assert.ok(map.camera.zoom>=14);
api.applyLens('walk');elements.get('atlas-view').value='2d';api.syncBuildingVisibility();
assert.equal(map.getLayoutProperty('city-height-buildings','visibility'),'none');
assert.equal(map.getLayoutProperty('walk-massing','visibility'),'none','2D must suppress every extrusion');
({api,map}=app({offline:true}));await api.loadCityHeights();assert.ok(!map.getLayer('city-height-buildings'),'failed height feed cannot invent a skyline');
console.log('✓ Skyline: source-backed tower geometry, height conflicts, visible opening zoom, 2D and offline refusal.');

// Startup is independent of basemap load and unrelated registry latency.
const pause=new Promise(()=>{});
const startup=app({inside:false,search:'?area=tejgaon',fetchOverride:url=>url.includes('dhaka-rivers')||url.includes('dhaka-economy')?pause:undefined});
startup.map.events.get('style.load')();
await new Promise(r=>setTimeout(r,0));
assert.ok(startup.map.getLayer('city-height-buildings'),'source-backed skyline starts at style readiness, without basemap load');
assert.ok(startup.requests.includes('/dhaka-areas.json'),'district request is not serially blocked');
assert.equal(startup.map.camera.zoom,16.5,'authored district positioning completes despite hung rivers/economy');
assert.ok(!startup.requests.includes('/data/parliament-buildings.geojson'),'Tejgaon does not pay for Parliament detail');
startup.map.inside=true; startup.api.syncBuildingVisibility(); startup.api.syncBuildingVisibility();
await new Promise(r=>setTimeout(r,0));
assert.equal(startup.requests.filter(u=>u.includes('parliament-buildings')).length,1,'entering detail extent shares one source request');
startup.api.syncBuildingVisibility();assert.equal(startup.requests.filter(u=>u.includes('parliament-buildings')).length,1,'completed detail is retained');
console.log('✓ Startup: style-ready skyline, parallel district loading under stalled feeds and lazy single-flight Parliament detail.');

// Late initial-area and search responses cannot take the camera back from input.
let finishAreas;
const areaResponse=new Promise(r=>finishAreas=r);
const manual=app({inside:false,search:'?area=parliament',fetchOverride:url=>url.includes('dhaka-areas')?areaResponse:undefined});
manual.map.events.get('style.load')();
manual.map.events.get('dragstart')({originalEvent:{}});
const manualCamera=manual.map.camera;
finishAreas({ok:true,json:async()=>JSON.parse(read('public/dhaka-areas.json'))});await new Promise(r=>setTimeout(r,0));
assert.equal(manual.map.camera,manualCamera,'late URL district does not override a native drag');
let finishSearch;
const searchResponse=new Promise(r=>finishSearch=r);
const searchCase=app({inside:false,fetchOverride:url=>url.includes('/api/atlas/search')?searchResponse:undefined});
const searching=searchCase.api.performSearch('Dhaka');searchCase.api.applyLens('people');const selectedCamera=searchCase.map.camera;
finishSearch({ok:true,json:async()=>({results:[{lat:'23.7',lon:'90.4'}]})});await searching;
assert.equal(searchCase.map.camera,selectedCamera,'late search does not override a newer lens');

// A completed explicit search also retires an unfinished opening URL intent.
let finishOpeningAreas;
const deferredOpeningAreas=new Promise(r=>finishOpeningAreas=r);
const searchBeforeAreas=app({inside:false,search:'?area=parliament',fetchOverride:url=>url.includes('dhaka-areas')?deferredOpeningAreas:url.includes('/api/atlas/search')?Promise.resolve({ok:true,json:async()=>({results:[{lat:'23.8',lon:'90.45'}]})}):undefined});
searchBeforeAreas.map.events.get('style.load')();await searchBeforeAreas.api.performSearch('Gulshan');
const searchedCamera=searchBeforeAreas.map.camera;
finishOpeningAreas({ok:true,json:async()=>JSON.parse(read('public/dhaka-areas.json'))});await new Promise(r=>setTimeout(r,0));
assert.equal(searchBeforeAreas.map.camera,searchedCamera,'late opening district cannot override an explicit completed search');

// Repeated registry completions and Retry do not multiply hover handlers.
const bindings=app({inside:false});await bindings.api.loadDataLayers();await bindings.api.loadDataLayers('rivers');
for(const id of ['landmarks-points','rivers-gauges','transit-stations','economy-hubs']){
 assert.ok(bindings.map.eventRegistrations.filter(([type,layer])=>type==='mouseenter'&&layer===id).length<=1);
}
const recovery=app({inside:false});const add=recovery.map.addLayer.bind(recovery.map);let fail=true;
recovery.map.addLayer=(layer,before)=>{if(fail&&layer.id==='parliament-buildings'){fail=false;throw Error('source creation failed');}add(layer,before);};
await recovery.api.loadParliamentBuildings();assert.ok(!recovery.map.getSource('parliament-detail'),'partial failed detail is cleared');
await recovery.api.loadParliamentBuildings({retry:true});assert.ok(recovery.map.getLayer('parliament-buildings'),'Retry reconstructs a partially failed source');
const background=app({inside:false});background.api.wireUIEvents();background.api.scheduleWatch();background.api.scheduleWatch();await new Promise(r=>setTimeout(r,0));
assert.equal(background.requests.filter(u=>u==='/api/atlas/watch').length,1,'equivalent active requests coalesce');
assert.equal([...background.timeouts.values()].filter(t=>t.ms===5*60000).length,1,'one recurring refresh owner');
background.document.hidden=true;background.events.visibilitychange();
assert.equal([...background.timeouts.values()].filter(t=>t.ms===5*60000||t.ms===60000).length,0,'hidden page has no recurring watch/solar work');
console.log('✓ Async ownership: manual camera intent, late search refusal, single hover bindings, partial-source Retry and hidden refresh cleanup.');

// Returning to a lens does not give its earlier request ownership again.
const settleLensReview=()=>new Promise(resolve=>setImmediate(resolve));
const rainSettlers=[];
const rainGeneration=app({inside:false,fetchOverride:url=>url==='/api/atlas/rainfall'?new Promise(resolve=>rainSettlers.push(resolve)):undefined});
rainGeneration.api.applyLens('rain');rainGeneration.api.applyLens('city');rainGeneration.api.applyLens('rain');
assert.equal(rainSettlers.length,2);
const rainFixture=value=>({ok:true,json:async()=>({status:'ok',catchments:[{id:'fixture',name:'Query',lat:23.7,lng:90.4,status:'ok',rain_24h_sum_mm:value,source:'Regression fixture'}]})});
rainSettlers[1](rainFixture(2));await settleLensReview();
assert.equal(rainGeneration.map.getSource('catchment-rain').data.features[0].properties.rain_24h_sum_mm,2);
rainSettlers[0](rainFixture(99));await settleLensReview();
assert.equal(rainGeneration.map.getSource('catchment-rain').data.features[0].properties.rain_24h_sum_mm,2,'older Rain request cannot overwrite a later Rain activation');

// A provider deliberately ignores abort: generation ownership still protects
// the visible reading, and repeated page restoration owns exactly one timer.
const watchSettlers=[];
const restoredWatch=app({inside:false,fetchOverride:url=>url==='/api/atlas/watch'?new Promise(resolve=>watchSettlers.push(resolve)):undefined});
const airValue={textContent:''};restoredWatch.elements.set('atlas-watch-air-value',airValue);
restoredWatch.api.wireUIEvents();restoredWatch.api.scheduleWatch();restoredWatch.api.scheduleWatch();
assert.equal(watchSettlers.length,1);
restoredWatch.document.hidden=true;restoredWatch.events.visibilitychange();
restoredWatch.document.hidden=false;restoredWatch.events.visibilitychange();assert.equal(watchSettlers.length,2);
const watchFixture=(value,category)=>({ok:true,json:async()=>({indicators:{airQuality:{us_aqi:value,category,status:'neutral'}}})});
watchSettlers[1](watchFixture(50,'Good'));await settleLensReview();
watchSettlers[0](watchFixture(199,'Unhealthy'));await settleLensReview();
assert.match(airValue.textContent,/AQI 50/,'late hidden-page reading cannot replace newer visible evidence');
restoredWatch.events.pageshow();restoredWatch.events.pageshow();await settleLensReview();
assert.equal(watchSettlers.length,2,'fresh repeated page restoration does not refetch');
assert.equal([...restoredWatch.timeouts.values()].filter(t=>t.ms>60000&&t.ms<=5*60000).length,1,'one remaining-delay refresh timer survives repeated restoration');
restoredWatch.document.hidden=true;restoredWatch.events.visibilitychange();
assert.equal([...restoredWatch.timeouts.values()].filter(t=>t.ms>=60000&&t.ms<=5*60000).length,0,'hidden restoration leaves no watch or solar timer');
console.log('✓ Lens/watch generations: Rain→City→Rain, ignored aborts, visible return and repeated page restoration remain owned.');

// Public controls select the existing vector channels and inspect real footprints.
const fabricCase = app({search:'?area=parliament'});
fabricCase.api.wireUIEvents();
const basemap = fabricCase.elements.get('atlas-basemap');
basemap.change({target:{value:'fabric'}});
assert.equal(fabricCase.map.getLayer('fabric-water')['source-layer'],'water');
assert.equal(fabricCase.map.getLayer('fabric-streets')['source-layer'],'transportation');
for (const id of ['fabric-water','fabric-streets']) assert.equal(fabricCase.map.getLayoutProperty(id,'visibility'),'visible');
for (const id of ['basemap-esri','basemap-osm']) assert.equal(fabricCase.map.getLayoutProperty(id,'visibility'),'none');
fabricCase.api.applyLens('night');
assert.equal(fabricCase.map.getPaintProperty('fabric-streets','line-opacity'),0.18);
fabricCase.api.applyLens('city');
assert.equal(fabricCase.map.getPaintProperty('fabric-streets','line-opacity'),1);
basemap.change({target:{value:'osm'}});
assert.equal(fabricCase.map.getLayoutProperty('fabric-water','visibility'),'none');
assert.equal(fabricCase.map.getLayoutProperty('basemap-osm','visibility'),'visible');

const inspect = fabricCase.elements.get('atlas-centre-inspection');
const status = fabricCase.elements.get('atlas-centre-inspection-status');
inspect.click({currentTarget:inspect});
assert.match(status.textContent,/still loading/);
fabricCase.map.getCenter=()=>({lng:90.3786,lat:23.76245});
fabricCase.map.project=()=>({x:195,y:422});
fabricCase.map.queryRenderedFeatures=()=>[];
fabricCase.map.events.get('style.load')();
inspect.click({currentTarget:inspect});
assert.match(status.textContent,/No building visible/);
await fabricCase.api.loadParliamentBuildings();
fabricCase.map.ready=true;
fabricCase.map.events.get('sourcedata')({sourceId:'parliament-detail',isSourceLoaded:true});
fabricCase.map.queryRenderedFeatures=(_,options)=>{
  assert.ok(options.layers.includes('parliament-footprints'));
  assert.ok(!options.layers.includes('city-footprints'),'hidden streamed footprints cannot own campus inspection');
  return [{layer:{id:'parliament-footprints'},properties:parliament.properties}];
};
assert.equal(fabricCase.map.getSource('fabric-openings').data.features.length,14);
assert.equal(fabricCase.map.getLayoutProperty('fabric-courtyards','visibility'),'none');
basemap.change({target:{value:'fabric'}});
assert.equal(fabricCase.map.getLayoutProperty('fabric-courtyards','visibility'),'visible');
fabricCase.map.inside=false;
fabricCase.api.syncBuildingVisibility();
assert.equal(fabricCase.map.getLayoutProperty('fabric-courtyards','visibility'),'none');
fabricCase.map.inside=true;
fabricCase.api.syncBuildingVisibility();
const hud = fabricCase.elements.get('atlas-observation-hud');
let restoredFocus = false;
inspect.focus=()=>{restoredFocus=true;};
inspect.click({currentTarget:inspect});
assert.match(hud.innerHTML,/Reported storeys[\s\S]*?>8</);
assert.match(hud.innerHTML,/Unknown · flat footprint/);
assert.match(hud.innerHTML,/https:\/\/www.openstreetmap.org\/relation\/18085267/);
hud.onkeydown({key:'Escape',preventDefault(){},stopPropagation(){}});
assert.equal(hud.hidden,true);
assert.equal(restoredFocus,true);
console.log('✓ Street fabric and campus: source layers, basemap and night transitions, keyboard inspection and source evidence.');
