import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base=process.env.ATLAS_URL || 'https://dhaka.nonarkara.org';
const response=await fetch(base+'/api/atlas/people',{cache:'no-store'});
assert.ok(response.ok);assert.equal(response.headers.get('cache-control'),'no-store');
const manifest=await response.json();assert.equal(manifest.status,'reference');assert.equal(manifest.population.year,2025);
assert.ok(manifest.facilities.extract?.sha256 && manifest.facilities.observedAt);
const data={};
for(const [name,asset] of Object.entries(manifest.assets)) {
  const res=await fetch(new URL(asset.url+'?v='+asset.sha256,base));assert.ok(res.ok);
  const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.length,asset.bytes);assert.ok(bytes.length<=500000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);data[name]=JSON.parse(bytes);
}
const cells=data['people-grid.json'].cells, objects=data['facilities.geojson'].features;
assert.equal(cells.length,manifest.grid.cells);assert.equal(objects.length,manifest.facilities.objects);
assert.equal(new Set(objects.map(f=>f.properties.osmId)).size,objects.length);
assert.ok(cells.some(c=>c[2]===null&&c[3]===0));
assert.ok(cells.every(c=>c[2]===null||Number.isFinite(c[2])&&c[2]>=0));
for(const [column,kind] of [[5,'school'],[6,'hospital'],[7,'clinic']]) assert.equal(cells.reduce((n,c)=>n+c[column],0),objects.filter(f=>f.properties.kind===kind).length);
const collage=await (await fetch(base+'/api/atlas/collage')).json();
assert.equal(collage.domains.find(d=>d.id==='energy').question,'What is the regional long-term solar resource?');
assert.equal(collage.domains.find(d=>d.id==='economy').question,'How bright is this sampled area at night?');
console.log(`✓ Live population reference: ${cells.length} cells and ${objects.length} dated OSM objects; hashes, category counts, unknown cells, source provenance and corrected questions.`);
