import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.ATLAS_URL || 'https://dhaka.nonarkara.org';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of ['index.html','app.js','loader.js','dashboard.js','style.css','dhaka-design.css','translations.js','dhaka-rivers.geojson','dhaka-economy.geojson','dhaka-areas.json','data/parliament-buildings.geojson']) {
  const res=await fetch(new URL(file==='index.html'?'/':`/${file}`,base),{cache:'no-store'});
  assert.ok(res.ok,`${file}: HTTP ${res.status}`);
  assert.equal(hash(Buffer.from(await res.arrayBuffer())),hash(readFileSync(new URL(`../public/${file}`,import.meta.url))),`${file}: deployed bytes differ`);
}
console.log('✓ Live SHA-256 matches for HTML, client scripts, styles, translations and reference layers');
