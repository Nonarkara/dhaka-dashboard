import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const app=read('public/app.js'), html=read('public/index.html'), css=read('public/dhaka-design.css');

// Preserve the exploration feature without licensing unsupported geographic height.
assert.match(html,/<option value="walk">Low-angle map<\/option>/);
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
vm.runInNewContext(prefix+'window.test={setMap:m=>map=m,measureStreetLevel,buildingPaint,syncBuildingVisibility,streetScoutUrl,show:()=>{currentLens="walk";renderWalkPanel();}};})();',{window:win,document:doc,URLSearchParams,URL,Intl,console});
let features=[],queried;
const map={getLayer:id=>['city-footprints','parliament-footprints'].includes(id)?{}:null,getLayoutProperty:()=> 'visible',queryRenderedFeatures:options=>{queried=options;return features;},getCenter:()=>({lat:23.75,lng:90.4})};
win.test.setMap(map);
features=[
 {id:10,source:'buildings',sourceLayer:'building',properties:{}},
 {id:10,source:'buildings',sourceLayer:'building',properties:{}}, // adjacent source fragment
 {id:'way/5',source:'parliament-detail',properties:{}},
 {source:'buildings',properties:{}}, // no stable identity
 {id:11,source:'buildings',properties:{hide_3d:true}},
];
assert.equal(win.test.measureStreetLevel().total,2,'unique rendered IDs, not loaded tile fragments');
assert.equal(win.test.measureStreetLevel().unidentified,1);
assert.equal(queried.layers.join(','),'city-footprints,parliament-footprints');
for(const lang of ['en','bn']) {
 doc.documentElement.lang=lang;win.test.show();
 assert.equal(elements.get('#atlas-walk').hidden,false);
 assert.match(elements.get('#atlas-walk-counts').textContent,lang==='en'?/2 buildings in view/:/২টি ভবন দৃশ্যমান/);
 assert.match(elements.get('#atlas-walk-note').textContent,lang==='en'?/map provider/:/মানচিত্র সরবরাহকারীর/);
 assert.match(elements.get('#atlas-walk-scout').textContent,lang==='en'?/street scene/:/রাস্তার দৃশ্য/);
 const link=new URL(elements.get('#atlas-walk-scout').href);
 assert.equal(new URLSearchParams(link.hash.slice(1)).get('ll'),'23.750000,90.400000');
}
features=[];doc.documentElement.lang='en';win.test.show();
assert.equal(elements.get('#atlas-walk-counts').textContent,'Building count unavailable.','empty source cannot fabricate zero buildings');
map.queryRenderedFeatures=()=>{throw Error('tiles absent');};
assert.equal(win.test.measureStreetLevel(),null);
assert.match(read('public/dashboard.js'),/\/api\/dhaka\/transit/);
assert.match(html,/id="transit-registry"/);
console.log('✓ Map exploration: explicit source heights, rendered-ID dedup, unknown count, bilingual qualification/map-centre link and preserved transit/bookmark controls.');

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
  if(op==='case')return evaluate(args[0],properties)?evaluate(args[1],properties):evaluate(args[2],properties);
  throw Error('unsupported paint operation '+op);
}
const streamed=win.test.buildingPaint('render_height','render_min_height');
assert.equal(evaluate(streamed['fill-extrusion-height'],{render_height:99,render_min_height:12}),99);
const tagged=win.test.buildingPaint('height_m','min_height_m');
assert.equal(evaluate(tagged['fill-extrusion-height'],{height_m:35.7,min_height_m:0}),35.7);
assert.equal(evaluate(tagged['fill-extrusion-height'],{height_m:null}),0);

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
