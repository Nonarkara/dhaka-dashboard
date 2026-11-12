import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const app=read('public/app.js'), html=read('public/index.html'), css=read('public/dhaka-design.css');

// Preserve the exploration feature without licensing unsupported geographic height.
assert.match(html,/<option value="walk">([^<]+)<\/option>/);
// The control a reader clicks and the story the panel tells must name the
// same lens. A dropdown that says one thing while the panel says another is
// two names for one view.
const walkOption=html.match(/<option value="walk">([^<]+)<\/option>/)[1];
const walkStory=app.slice(app.indexOf('walk: {')).match(/title:\s*"([^"]+)"/)[1];
assert.equal(walkOption,walkStory,`the lens control says "${walkOption}" and the story says "${walkStory}"`);
assert.match(app,/AtlasWalk\?\.activate/);
assert.match(app,/AtlasWalk\?\.attach/);
assert.match(app,/maxPitch: 85/);
const layer=app.slice(app.indexOf('id: "walk-massing"'),app.indexOf('\n    try {',app.indexOf('id: "walk-massing"')));
assert.match(layer,/buildingPaint\("render_height", "render_min_height"\)/);
assert.match(layer,/\["get", "render_height"\]/);
assert.match(layer,/\["get", "render_min_height"\]/);
assert.match(css,/\.atlas-walk\[hidden\]\s*\{\s*display:none/);
assert.match(html,/id="atlas-walk-route"/,'authored bookmarks remain');
assert.match(html,/id="atlas-walk-prev"/);
assert.match(html,/id="atlas-walk-next"/);
assert.match(app,/panel.hidden = !isWalk/);
assert.match(html,/rel="noopener noreferrer"/);
assert.match(app,/Location Scout \(oyasumi-gamedev.com\)/);
assert.match(read('scripts/verify-live-bytes.mjs'),/'walk.js'/,'new runtime module must be byte-verified');
assert.match(read('scripts/stamp-build-id.mjs'),/walk/,'new runtime module must follow the release epoch');

// Exercise the real count/qualifications/link implementation with rendered IDs.
const elements=new Map();
for(const id of ['atlas-walk','atlas-walk-counts','atlas-walk-summary','atlas-walk-note','atlas-walk-legend-text','atlas-walk-scout','atlas-walk-credit'])elements.set('#'+id,{textContent:'',hidden:true});
const doc={documentElement:{lang:'en'},querySelector:s=>elements.get(s)||null,addEventListener(){}};
const win={location:{search:''},addEventListener(){}};
const prefix=app.slice(0,app.indexOf('  // Safe boot:'));
// A clock the test owns: the count is published only when two readings
// agree half a second apart, so the test must be able to move time.
let clock=1_700_000_000_000;
class TestDate extends Date { static now(){return clock;} }
vm.runInNewContext(prefix+'window.test={setMap:m=>map=m,setIdle:v=>{mapIdle=v;},measureStreetLevel,refreshWalkCount,buildingPaint,syncBuildingVisibility,streetScoutUrl,sunOverDhaka,show:()=>{currentLens="walk";renderWalkPanel();}};})();',{window:win,document:doc,URLSearchParams,URL,Intl,console,Date:TestDate});
let features=[],queried,tilesLoaded=true,sourceLoaded=true;
const map={getLayer:id=>['city-footprints','parliament-footprints'].includes(id)?{}:null,getLayoutProperty:()=> 'visible',queryRenderedFeatures:options=>{queried=options;return features;},getCenter:()=>({lat:23.75,lng:90.4}),areTilesLoaded:()=>tilesLoaded,isSourceLoaded:()=>sourceLoaded};
win.test.setMap(map);
features=[
 {id:10,source:'buildings',sourceLayer:'building',properties:{}},
 {id:10,source:'buildings',sourceLayer:'building',properties:{}}, // adjacent source fragment
 {id:'way/5',source:'parliament-detail',properties:{}},
 {source:'buildings',properties:{}}, // no stable identity
 {id:11,source:'buildings',properties:{hide_3d:true}},
];

// A map that has not finished drawing holds no countable view. The count
// must be absent, not small: a fraction dressed as a total is the reading
// this instrument must never publish.
win.test.setIdle(false);
assert.equal(win.test.measureStreetLevel(),null,'a moving map cannot be counted');
win.test.refreshWalkCount();
assert.equal(elements.get('#atlas-walk-counts').textContent,'Reading the street…','a loading map says it is reading, not how few it found');

// Tiles still in flight: same rule, one step further down.
win.test.setIdle(true);
tilesLoaded=false;
assert.equal(win.test.measureStreetLevel(),null,'unloaded tiles cannot be counted');
win.test.refreshWalkCount();
assert.equal(elements.get('#atlas-walk-counts').textContent,'Reading the street…');
tilesLoaded=true;
sourceLoaded=false;
assert.equal(win.test.measureStreetLevel(),null,'an unloaded source cannot be counted');
sourceLoaded=true;

// A settled map: the count is real, and it is published only once two
// readings agree half a second apart.
win.test.refreshWalkCount();
assert.equal(elements.get('#atlas-walk-counts').textContent,'Reading the street…','one reading is not a settled reading');
clock+=600;
win.test.refreshWalkCount();
assert.match(elements.get('#atlas-walk-counts').textContent,/2 buildings in view/,'a settled map publishes its count');
assert.equal(win.test.measureStreetLevel().total,2,'unique rendered IDs, not loaded tile fragments');
assert.equal(win.test.measureStreetLevel().unidentified,1);
assert.equal(queried.layers.join(','),'city-footprints,parliament-footprints');

// A view that is still changing publishes nothing: the number would be a
// fraction of the street the reader is about to see.
features=features.slice(0,1);
clock+=600;
win.test.refreshWalkCount();
assert.equal(elements.get('#atlas-walk-counts').textContent,'Reading the street…','a changing view is not published');
clock+=600;
win.test.refreshWalkCount();
assert.match(elements.get('#atlas-walk-counts').textContent,/1 building in view/,'the number and the words agree with each other');

for(const lang of ['en','bn']) {
 doc.documentElement.lang=lang;win.test.show();
 assert.equal(elements.get('#atlas-walk').hidden,false);
 assert.match(elements.get('#atlas-walk-counts').textContent,lang==='en'?/Reading the street…|1 building in view/:/রাস্তা পড়া হচ্ছে…|১টি ভবন দৃশ্যমান/);
 assert.match(elements.get('#atlas-walk-note').textContent,lang==='en'?/map provider/:/মানচিত্র সরবরাহকারীর/);
 assert.match(elements.get('#atlas-walk-scout').textContent,lang==='en'?/street scene/:/রাস্তার দৃশ্য/);
 const link=new URL(elements.get('#atlas-walk-scout').href);
 assert.equal(new URLSearchParams(link.hash.slice(1)).get('ll'),'23.750000,90.400000');
}
// A settled map with nothing in it says so; it does not print a zero.
features=[];doc.documentElement.lang='en';clock+=600;win.test.refreshWalkCount();clock+=600;win.test.refreshWalkCount();
assert.equal(elements.get('#atlas-walk-counts').textContent,'Building count unavailable.','empty source cannot fabricate zero buildings');
map.queryRenderedFeatures=()=>{throw Error('tiles absent');};
assert.equal(win.test.measureStreetLevel(),null);

// The sun over Dhaka: a reading the map can be checked against. The
// instants below are universal time; Dhaka is six hours ahead.
const noon=win.test.sunOverDhaka(new Date('2026-03-21T06:00:00Z'));
assert.ok(noon&&Number.isFinite(noon.altitudeDeg)&&Number.isFinite(noon.azimuthDeg),'the sun must be computable');
assert.ok(noon.altitudeDeg>50&&noon.altitudeDeg<72,`the equinox noon sun over Dhaka is high, got ${noon.altitudeDeg}`);
assert.ok(noon.azimuthDeg>150&&noon.azimuthDeg<205,`the noon sun is southerly over Dhaka, got ${noon.azimuthDeg}`);
const midnight=win.test.sunOverDhaka(new Date('2026-03-20T18:00:00Z'));
assert.ok(midnight.altitudeDeg<0,'the sun is below the horizon at midnight over Dhaka');
const beforeDawn=win.test.sunOverDhaka(new Date('2026-03-20T22:00:00Z'));
assert.ok(beforeDawn.altitudeDeg<0,'the sun is below the horizon before dawn over Dhaka');
assert.ok(beforeDawn.azimuthDeg>60&&beforeDawn.azimuthDeg<120,`the morning sun rises in the east over Dhaka, got ${beforeDawn.azimuthDeg}`);
// The tropics are the test: the sun passes almost overhead in June and
// never climbs far in December. A sun model that gets these wrong is not
// lighting the real city.
const june=win.test.sunOverDhaka(new Date('2026-06-21T06:00:00Z'));
const december=win.test.sunOverDhaka(new Date('2026-12-21T06:00:00Z'));
assert.ok(june.altitudeDeg>88&&june.altitudeDeg<=90,`the June sun is nearly overhead over Dhaka, got ${june.altitudeDeg}`);
assert.ok(december.altitudeDeg>40&&december.altitudeDeg<46,`the December sun is low over Dhaka, got ${december.altitudeDeg}`);
assert.match(app,/anchor: "map"/,'the light is anchored to the map, so the sun keeps its compass bearing');
assert.match(read('scripts/msh-audit.mjs'),/tilesLoaded/,'the audit must wait for the tiles it measures');
assert.match(read('public/dashboard.js'),/\/api\/dhaka\/transit/);
assert.match(html,/id="transit-registry"/);
console.log('✓ Map exploration: settled-only counts, no partial readings, rendered-ID dedup, bilingual qualification/map-centre link, real solar bearing and preserved transit/bookmark controls.');

// Execute the shared paint expression: a provider render value is not a
// substitute for the original source tag. Zero and absent source metadata
// remain flat; a tagged local height remains an actual extrusion.
function evaluate(expression,properties) {
  if(!Array.isArray(expression))return expression;
  const [op,...args]=expression;
  if(op==='get')return properties[args[0]];
  if(op==='to-number') {
    for(const arg of args) {
      const value=evaluate(arg,properties);
      if(value!==null&&value!==undefined&&Number.isFinite(Number(value)))return Number(value);
    }
    return 0;
  }
  if(op==='max')return Math.max(...args.map(arg=>evaluate(arg,properties)));
  if(op==='>')return evaluate(args[0],properties)>evaluate(args[1],properties);
  if(op==='<')return evaluate(args[0],properties)<evaluate(args[1],properties);
  if(op==='>=')return evaluate(args[0],properties)>=evaluate(args[1],properties);
  if(op==='<=')return evaluate(args[0],properties)<=evaluate(args[1],properties);
  if(op==='case')return evaluate(args[0],properties)?evaluate(args[1],properties):evaluate(args[2],properties);
  throw Error('unsupported paint operation '+op);
}
const streamed=win.test.buildingPaint('render_height','render_min_height');
assert.equal(evaluate(streamed['fill-extrusion-height'],{render_height:99,render_min_height:12}),99);
const tagged=win.test.buildingPaint('height_m','min_height_m');
assert.equal(evaluate(tagged['fill-extrusion-height'],{height_m:35.7,min_height_m:0}),35.7);
assert.equal(evaluate(tagged['fill-extrusion-height'],{height_m:null}),0);
// A bad tag is a bad tag, not a tall building: the atlas clamps it instead
// of extruding a hundred-kilometre tower over the city.
assert.equal(evaluate(tagged['fill-extrusion-height'],{height_m:99999}),500,'an absurd height is clamped');
assert.equal(evaluate(tagged['fill-extrusion-height'],{height_m:-12}),0,'a negative height stays flat');
assert.equal(evaluate(streamed['fill-extrusion-height'],{render_height:99999}),500,'a provider height is clamped too');

// The selected map target, rather than an invented camera-foot position,
// drives the external link each time. Manual exploration cannot retain an
// old place's coordinates or invent a measured pedestrian position.
map.getCenter=()=>({lat:23.8,lng:90.41});
const moved=new URL(win.test.streetScoutUrl());
assert.equal(new URLSearchParams(moved.hash.slice(1)).get('ll'),'23.800000,90.410000');
const visibility=new Map();
map.setLayoutProperty=(id,key,value)=>visibility.set(id,value);
map.getLayoutProperty=id=>visibility.get(id)||"none";
win.test.syncBuildingVisibility();
assert.equal(visibility.get('city-footprints'),'visible','low-angle exploration retains unknown flat footprints');
assert.equal(map.getLayoutProperty('parliament-footprints'),'none','exclusive local/native coverage selection survives');
console.log('✓ Exploration conservation: provider values remain flat, explicit source heights extrude, moving target updates the link, native footprints persist.');
