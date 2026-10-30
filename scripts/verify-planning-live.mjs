import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.ATLAS_URL||'https://dhaka.nonarkara.org';
const expected=JSON.parse(readFileSync(new URL('../public/data/ddm-source-review.json',import.meta.url)));
const extent=JSON.parse(readFileSync(new URL('../public/data/people-manifest.json',import.meta.url))).bbox;
const r=await fetch(base+'/api/dhaka/shelters',{cache:'no-store'});assert.ok(r.ok);assert.equal(r.headers.get('cache-control'),'no-store');
const shelters=await r.json();
assert.equal(shelters.status,'unreviewed');assert.equal(shelters.inventoryStatus,'not-imported');
assert.equal(shelters.registerCount,0);assert.equal(shelters.mappableCount,0);assert.deepEqual(shelters.register,[]);
assert.deepEqual(shelters.source.structureReview,expected);assert.equal(shelters.retrievedAt,expected.retrievedAt);assert.notEqual(shelters.timestamp,shelters.retrievedAt);assert.equal(shelters.observedAt,null);
assert.deepEqual(shelters.studyBoundary.bbox,extent);assert.equal(shelters.studyBoundary.sourceUrl,'/data/people-manifest.json');
const rr=await fetch(base+'/api/dhaka/rivers');assert.ok([200,503].includes(rr.status));const rivers=await rr.json();
assert.equal(rivers.stations.length,6);assert.deepEqual(rivers.studyBoundary.bbox,extent);assert.equal(rivers.scenarioTypes.length,3);
for(const s of rivers.stations){assert.equal(s.floodRisk.tier,null);assert.equal(s.current_level_m,null);assert.equal(s.evidence.geometryMethod,'unverified');assert.equal(s.evidence.evidenceClass,'unverified_reference');assert.equal(s.evidence.sourceFeatureId,null);}
for(const text of [...rivers.scenarioTypes.flatMap(s=>[s.label_bn,s.note_bn]),shelters.source.name_bn]) {assert.match(text,/\p{Script=Bengali}/u);assert.doesNotMatch(text,/[\uac00-\ud7af]/u);assert.ok(!text.includes('departamento'));}
console.log(`✓ Live planning: population-grid extent; six unverified station references; ${expected.recordCount} source records/${expected.withinStudyExtentCount} within-extent source points, zero imported records/pins; fixed source retrieval time and Bengali metadata.`);
