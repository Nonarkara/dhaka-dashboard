import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const data=read('public/data/city-height-buildings.geojson'),register=read('public/data/skyline-coverage.json');
assert.equal(register.sourceHeightFootprints,data.features.length);
assert.equal(register.captureAreas.length,data.metadata.inputs.length);
assert.equal(register.capturedAt,data.metadata.retrieved_at);
assert.equal(register.methods.osmHeightTag+register.methods.publishedProjectHeight,data.features.length);
assert.equal(register.heightConflicts[0].osmHeightM,120);
assert.equal(register.review.candidates.length,10);
assert.equal(register.review.newGeometryImported,0);
for(const c of register.review.candidates){
 assert.ok(['usable','conflicting','insufficient-evidence'].includes(c.classification));
 assert.ok(/^https:\/\//.test(c.sourceUrl)&&c.finding.length>30);
 assert.ok(!('coordinates' in c)&&!('geometry' in c),'source review cannot create guessed pins');
 if(c.classification==='insufficient-evidence')assert.equal(c.heightM,null);
 if(c.existingFeatureId)assert.ok(data.features.some(f=>f.id===c.existingFeatureId&&f.properties.height_m===c.heightM));
}
console.log('✓ Skyline register: source counts/methods/conflicts preserved; ten bounded findings, no guessed geometry or height.');
