import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
// Recheck the exact user URL while edge assets converge. Never create cache keys
// or declare success until the deployed body matches the committed local bytes.
export async function verifyAsset(url,expected,{fetcher=fetch,attempts=15,pause=()=>new Promise(resolve=>setTimeout(resolve,2000)),notice=()=>{}}={}) {
  let detail='no response';
  for(let attempt=1;attempt<=attempts;attempt++) {
    try {
      const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(response.ok) {
        const actual=sha256(Buffer.from(await response.arrayBuffer()));
        if(actual===expected)return {attempts:attempt,hash:actual};
        detail=`deployed SHA-256 ${actual} differs from local ${expected}`;
      } else detail=`HTTP ${response.status}`;
    } catch(error) {detail=String(error);}
    if(attempt<attempts){notice(`Waiting for edge bytes (${attempt}/${attempts}): ${url}`);await pause();}
  }
  throw Error(`${url}: exact deployed bytes did not converge after ${attempts} attempts: ${detail}`);
}
