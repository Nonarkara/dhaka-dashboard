import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/index.ts';
import {DHAKA_STUDY_BOUNDARY,RIVER_STATIONS,FLOOD_SCENARIO_TYPES,DDM_SHELTER_SOURCE} from '../src/dhaka-data.ts';
import {DDM_SOURCE_REVIEW} from '../src/ddm-source-review.ts';
import {isShelterMappable,publicShelterRegister} from '../src/planning.ts';
import {reviewDdmSource} from './review-ddm-source.mjs';

const manifest=JSON.parse(readFileSync('public/data/people-manifest.json','utf8'));
assert.deepEqual([...DHAKA_STUDY_BOUNDARY.bbox],manifest.bbox);
assert.equal(DHAKA_STUDY_BOUNDARY.sourceUrl,'/data/people-manifest.json');
assert.equal(DHAKA_STUDY_BOUNDARY.verificationStatus,'unreviewed');
assert.ok(!DHAKA_STUDY_BOUNDARY.name.includes('City Corporation'));
for(const station of RIVER_STATIONS) {
  assert.equal(station.evidence.evidenceClass,'unverified_reference');
  assert.equal(station.evidence.geometryMethod,'unverified');
  assert.equal(station.evidence.sourceFeatureId,null);
  assert.equal(station.evidence.retrievedAt,null);
  assert.ok(!station.evidence.limitations.join(' ').includes('officially surveyed'));
}
for(const feature of JSON.parse(readFileSync('public/dhaka-rivers.geojson','utf8')).features.filter(f=>f.properties.type==='gauge')) {
  assert.equal(feature.properties.verification_status,'unreviewed');
  assert.equal(feature.properties.vertical_datum,null);
}
for(const text of [...FLOOD_SCENARIO_TYPES.flatMap(s=>[s.label_bn,s.note_bn]),DDM_SHELTER_SOURCE.name_bn]) {
  assert.match(text,/\p{Script=Bengali}/u);assert.doesNotMatch(text,/[\uac00-\ud7af]/u);assert.ok(!text.includes('departamento'));
}
assert.deepEqual(JSON.parse(readFileSync('public/data/ddm-source-review.json','utf8')),DDM_SOURCE_REVIEW);
assert.equal(DDM_SOURCE_REVIEW.recordCount,1950);assert.equal(DDM_SOURCE_REVIEW.coordinatePairCount,1950);assert.equal(DDM_SOURCE_REVIEW.withinStudyExtentCount,5);
const input=[{lat:23.8,lon:90.4,contact_no:'PRIVATE_CONTACT_CANARY'}, {lat:'',lon:''}, {lat:null,lon:null}, {lat:91,lon:90}, {lat:0,lon:0}, {lat:'20.1',lon:'90.1'}, {lat:true,lon:90}];
const review=reviewDdmSource('const shelter='+JSON.stringify(input)+'; doNotExecute();','2026-10-30T00:00:00Z',manifest);
assert.equal(review.recordCount,7);assert.equal(review.coordinatePairCount,2);assert.equal(review.withinStudyExtentCount,1);
assert.ok(!JSON.stringify(review).includes('PRIVATE_CONTACT_CANARY'));
assert.throws(()=>reviewDdmSource('const shelter=executeCode()','2026-10-30',manifest));
assert.throws(()=>reviewDdmSource('const shelter=[{','2026-10-30',manifest));
assert.throws(()=>reviewDdmSource('const shelter=[]','2026-10-30',manifest));
assert.throws(()=>reviewDdmSource('const shelter=[{}];const shelter=[{}]','2026-10-30',manifest));
assert.throws(()=>reviewDdmSource('const shelter=[{}]','invalid',manifest));

const now=Date.parse('2026-10-30T00:00:00Z'),past='2026-10-29T00:00:00Z';
const entry={id:'fixture',name:'Fixture school shelter',name_bn:null,type:'flood_shelter',area:null,area_bn:null,constructedBy:null,constructionYear:null,coveringPeople:null,coveringPeopleUnit:null,location:null,
  lat:23.8,lng:90.4,mappable:true,
  evidence:{sourceName:'Fixture source',sourceUrl:'https://example.invalid/inventory/1',sourceFeatureId:'1',retrievedAt:past,observedAt:null,license:null,evidenceClass:'official_inventory',geometryMethod:'source_geometry',positionalAccuracyM:null,verificationStatus:'reviewed',limitations:[]},
  geometryReview:{reviewedAt:past,reference:'fixture-location-review'},publicationReview:{status:'permitted',reviewedAt:past,reference:'fixture-reuse-review'},
  readiness:{operationalStatus:'unreviewed',capacityVerified:false,accessibilityReviewed:false,structuralAssessment:false,ownerOperatorPermission:false,operatingArrangements:false,reviewedAt:null,reviewedBy:'PRIVATE_REVIEWER',limitations:[]},contact_no:'PRIVATE_CONTACT_CANARY'};
assert.equal(isShelterMappable(entry,now),true);
for(const patch of [{mappable:false},{lat:null},{lng:null},{lat:NaN},{lng:Infinity},{lat:0,lng:0},{lat:24.5},{type:'unreviewed'},{geometryReview:undefined},{publicationReview:undefined},{geometryReview:{reviewedAt:'2030-01-01',reference:'future'}}]) {
  const changed={...entry,...patch};assert.equal(isShelterMappable(changed,now),false);
  const projected=publicShelterRegister([changed],now)[0];assert.equal(projected.mappable,false);assert.equal(projected.lat,null);assert.equal(projected.lng,null);
}
for(const patch of [{verificationStatus:'unreviewed'},{geometryMethod:'unverified'},{sourceFeatureId:null},{sourceUrl:'javascript:alert(1)'},{retrievedAt:null},{evidenceClass:'unverified_reference'}]) assert.equal(isShelterMappable({...entry,evidence:{...entry.evidence,...patch}},now),false);
const projected=publicShelterRegister([entry],now)[0];assert.equal(projected.mappable,true);assert.equal(projected.readiness.operationalStatus,'unreviewed');
assert.ok(!JSON.stringify(projected).includes('PRIVATE_CONTACT_CANARY'));assert.ok(!JSON.stringify(projected).includes('PRIVATE_REVIEWER'));

const originalFetch=globalThis.fetch;let outgoing=0;
globalThis.fetch=async()=>{outgoing++;throw Error('offline');};
let shelter;
try {
  const response=await worker.fetch(new Request('https://example.invalid/api/dhaka/shelters'),{});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');shelter=await response.json();
  assert.equal(shelter.status,'unreviewed');assert.equal(shelter.inventoryStatus,'not-imported');
  assert.equal(shelter.registerCount,0);assert.equal(shelter.mappableCount,0);assert.deepEqual(shelter.register,[]);
  assert.equal(shelter.source.recordCount,1950);assert.equal(shelter.source.withinStudyExtentCount,5);
  assert.equal(shelter.retrievedAt,DDM_SOURCE_REVIEW.retrievedAt);assert.notEqual(shelter.timestamp,shelter.retrievedAt);assert.equal(shelter.observedAt,null);
  assert.equal(outgoing,0,'visitors must not fetch DDM page/contacts');
}finally{globalThis.fetch=originalFetch;}

const retry={onclick:null},slot={isConnected:true,dataset:{},innerHTML:'',textContent:'',querySelector:()=>retry},container={querySelector:()=>slot};
const document={readyState:'loading',documentElement:{lang:'en'},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
let offline=false,release,delayed=false;const pending=new Promise(resolve=>release=resolve);
const context={window:{},document,console,Intl,AbortSignal,fetch:async()=>{if(delayed)await pending;if(offline)throw Error('offline');return Response.json(shelter);}};
let code=readFileSync('public/dashboard.js','utf8');code=code.slice(0,code.indexOf('  function bootDashboard()'))+'window.test={loadPlanningEvidence,planningDisclosure,loadRivers};})();';
vm.runInNewContext(code,context);
await context.window.test.loadPlanningEvidence(container);assert.ok(slot.innerHTML.includes('1,950'));assert.ok(slot.innerHTML.includes('not a DNCC/DSCC boundary'));assert.ok(slot.innerHTML.includes('Imported shelter records'));
document.documentElement.lang='bn';await context.window.test.loadPlanningEvidence(container);assert.ok(slot.innerHTML.includes('১,৯৫০'));assert.ok(!slot.innerHTML.includes('departamento'));
offline=true;await context.window.test.loadPlanningEvidence(container);assert.equal(slot.dataset.reasonCode,'shelter-review-unavailable');assert.ok(slot.dataset.checkedAt);
offline=false;await retry.onclick();assert.equal(slot.dataset.status,'reference');assert.equal(slot.dataset.reasonCode,undefined);
offline=false;delayed=true;slot.innerHTML='existing';const late=context.window.test.loadPlanningEvidence(container);slot.isConnected=false;release();await late;assert.equal(slot.innerHTML,'existing','late response must not update detached language/dialog state');

// Planning metadata must render without waiting on external rainfall, and an
// older-language river response must not replace the current language's rows.
const rainContainer={nodes:{},set innerHTML(value){for(const n of Object.values(this.nodes))n.isConnected=false;this.nodes={'#planning-shelter-status':{isConnected:true,dataset:{},querySelector:()=>({})},'#river-readings':{isConnected:true}};},querySelector(selector){return this.nodes[selector];}};
const riverDocument={readyState:'loading',documentElement:{lang:'en'},querySelector:s=>s==='#rivers-list-container'?rainContainer:null,querySelectorAll:()=>[],addEventListener(){}};
const riverRequests=[];
const riverContext={window:{},document:riverDocument,Intl,AbortSignal,console,fetch:url=>url.includes('/shelters')?Promise.resolve(Response.json(shelter)):new Promise(resolve=>riverRequests.push(resolve))};
vm.runInNewContext(code,riverContext);
const oldRiver=riverContext.window.test.loadRivers();await new Promise(resolve=>setImmediate(resolve));
assert.equal(rainContainer.nodes['#planning-shelter-status'].dataset.status,'reference','rainfall blocked static planning review');
riverDocument.documentElement.lang='bn';const currentRiver=riverContext.window.test.loadRivers();await new Promise(resolve=>setImmediate(resolve));
const currentRows=rainContainer.nodes['#river-readings'];
riverRequests[1](Response.json({stations:[]}));await currentRiver;const currentHTML=currentRows.innerHTML;
riverRequests[0](Response.json({stations:[{name:'OBSOLETE_ENGLISH_ROW',rainfall:{}}]}));await oldRiver;
assert.equal(currentRows.innerHTML,currentHTML,'late river response replaced current language');
console.log('✓ Planning provenance: true grid extent, unverified stations, bilingual metadata, DDM structure/privacy, stable retrieval dates, pin eligibility and visible empty/error/review states');
