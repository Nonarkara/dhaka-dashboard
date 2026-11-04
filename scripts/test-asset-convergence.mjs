import assert from 'node:assert/strict';
import {sha256,verifyAsset} from './lib/verify-asset.mjs';
const url='https://example.invalid/research',expected=sha256('new');
let calls=0,pauses=0;const requested=[];
const recovered=await verifyAsset(url,expected,{attempts:3,pause:async()=>{pauses++;},fetcher:async target=>{requested.push(String(target));return new Response(++calls===1?'old':'new');}});
assert.equal(recovered.attempts,2);assert.equal(pauses,1);assert.deepEqual(requested,[url,url],'convergence must not poison new cache keys');
await assert.rejects(()=>verifyAsset(url,expected,{attempts:2,pause:async()=>{},fetcher:async()=>new Response('old')}),/did not converge after 2/,'permanent stale bytes must block release');
await assert.rejects(()=>verifyAsset(url,expected,{attempts:2,pause:async()=>{},fetcher:async()=>new Response('',{status:404})}),/HTTP 404/);
console.log('✓ Asset convergence: transient stale bytes recover at exact URL; permanent mismatch/404 still block release.');
