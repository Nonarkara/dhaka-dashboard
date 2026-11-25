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

if(process.argv[3]) {
  const enlarged=JSON.parse(readFileSync(process.argv[3],'utf8'));
  function verifyEnlarged(g) {
    assert.equal(g.overflow,false,'doubled text must not overflow the page');
    assert.ok(g.header.height<=112,'doubled phone header earns at most two complete rows');
    assert.ok(g.watch.height<=240,'doubled readings remain content-sized, without stretched empty row mates');
    assert.ok(g.credit.height<=110,'attribution keeps its separately reachable row');
    assert.ok(g.watch.bottom<=g.credit.y-4,'doubled readings cannot cover attribution');
    assert.ok(g.readings.every(r=>!r.clipped),'doubled readings cannot clip');
    assert.ok(g.readings.some(r=>/AQI/.test(r.text)),'loaded AQI is required, not only short unavailable labels');
  }
  for(const g of enlarged) verifyEnlarged(g);
  assert.equal(enlarged.length,2);
  const stretched=structuredClone(enlarged[0]);stretched.watch.height=320;
  assert.throws(()=>verifyEnlarged(stretched),/content-sized/,'restoring stretched watch rows must fail');
  const threeRows=structuredClone(enlarged[0]);threeRows.header.height=154;
  assert.throws(()=>verifyEnlarged(threeRows),/two complete rows/,'restoring the three-row English header must fail');
  console.log('✓ Doubled text: EN/BN loaded AQI, two-row header, content-sized readings, separate attribution and original stretched-row/three-row falsifiers.');
}
