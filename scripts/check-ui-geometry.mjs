import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rows=JSON.parse(readFileSync(process.argv[2]||'docs/evidence/reconciliation-2026-11-04/geometry.json','utf8'));
function verify(g) {
  assert.equal(g.overflow,false,'no horizontal page overflow');
  assert.ok(g.header.height<=48,'compact normal-text header');
  assert.ok(g.watch.bottom<=g.credit.y-4,'watch must leave the source attribution unobscured');
  const unobscured=g.map.width*g.map.height-g.watch.width*g.watch.height-g.key.width*g.key.height-g.credit.width*g.credit.height;
  assert.ok(unobscured/(g.width*g.height)>=.6,'map remains at least60% of initial viewport after edge instruments');
  assert.ok(g.readings.every(r=>!r.clipped&&r.label.includes(r.text.split('\n').at(-1))),'complete visible and accessible readings');
}
for(const row of rows)verify(row);
assert.equal(new Set(rows.map(r=>r.width)).size,3);
assert.ok(rows.some(r=>r.lang==='en')&&rows.some(r=>r.lang==='bn'));
const regression=structuredClone(rows[0]);regression.watch.bottom=regression.credit.y+1;
assert.throws(()=>verify(regression),/attribution/,'restoring the original attribution overlap must fail');
console.log('✓ Rendered geometry:6viewport/language cases, map≥60%, header≤48px, complete readings and attribution; original overlap falsified.');
