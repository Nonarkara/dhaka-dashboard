import jpeg from 'jpeg-js';
import { tileHasData } from './png-decode.mjs';
export const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export function tileUrl(spec,date,template=false) {
  const p=spec.probe;
  return `${GIBS_BASE}/${spec.id}/default/${date?date+'/':''}GoogleMapsCompatible_Level${spec.level}/${template?'{z}/{y}/{x}':`${p.z}/${p.y}/${p.x}`}.${spec.ext}`;
}
export async function fetchTile(url,fetcher=fetch) {
  try {
    const res=await fetcher(url,{signal:AbortSignal.timeout(25000)});
    if(!res.ok)return {ok:false,status:res.status,bytes:0,type:null};
    const buf=Buffer.from(await res.arrayBuffer());
    return {ok:buf.length>0,status:res.status,bytes:buf.length,type:res.headers.get('content-type'),buf};
  } catch(error) {return {ok:false,status:0,bytes:0,type:null,error:String(error)};}
}
export async function carriesData(tile) {
  if(!tile.ok || !tile.buf?.length)return false;
  try {
    if(tile.type?.split(';')[0]==='image/jpeg') {
      const decoded=jpeg.decode(tile.buf,{useTArray:true,maxResolutionInMP:1,maxMemoryUsageInMB:16});
      // Same material-content criterion as PNG: an opaque tile needs variation.
      const min=[255,255,255],max=[0,0,0];
      for(let i=0;i<decoded.data.length;i+=4)for(let channel=0;channel<3;channel++){
        min[channel]=Math.min(min[channel],decoded.data[i+channel]);max[channel]=Math.max(max[channel],decoded.data[i+channel]);
      }
      return max.some((v,i)=>v-min[i]>2);
    }
    if(tile.type?.split(';')[0]!=='image/png')return false;
    return (await tileHasData(tile.buf)).hasData;
  } catch {return false;}
}
export async function verifyDeployedEnvironment(body,specs,{readTile=fetchTile,hasData=carriesData,now=Date.now()}={}) {
  const failures=[],verified=[],degraded=[];
  const layers=body?.layers;
  if(!Array.isArray(layers))return {failures:['environment layers missing'],verified,degraded};
  const expected=new Map(specs.map(s=>[s.id,s]));
  const today=Math.floor(now/86400000)*86400000;
  const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&Date.parse(date)<=today&&Date.parse(date)>=today-3*86400000;
  const seen=new Set();
  for(const layer of layers) {
    if(!layer || seen.has(layer.id)){failures.push('duplicate or malformed API layer');continue;}
    seen.add(layer.id);
    const spec=expected.get(layer.id);
    if(!spec) {
      // Radar is a different provider/transport, not evidence of GIBS success.
      if(layer.id!=='rainviewer-radar'||layer.kind!=='json-endpoint'||layer.endpoint!=='https://api.rainviewer.com/public/weather-maps.json')failures.push(`unexpected registry layer ${layer.id}`);
      if(!['ok','unavailable'].includes(layer.status))failures.push(`invalid status ${layer.id}`);
      if(layer.status==='unavailable') {
        if(!layer.reasonCode||layer.latest_date!==null||layer.template!==null)failures.push(`invalid unavailable envelope ${layer.id}`);
        else degraded.push({id:layer.id,reasonCode:layer.reasonCode});
      } else if(layer.status==='ok'&&(!validDate(layer.latest_date)||layer.reasonCode!==null||layer.template!==null))failures.push(`invalid radar date/envelope ${layer.id}`);
      continue;
    }
    if(layer.kind!=='gibs-raster'||layer.tile_level!==spec.level||layer.format!==spec.ext){failures.push(`${spec.id}: source registry mismatch`);continue;}
    if(layer.status==='unavailable') {
      if(typeof layer.reasonCode!=='string'||!layer.reasonCode.trim()||layer.latest_date!==null||layer.template!==null)failures.push(`${spec.id}: invalid unavailable envelope`);
      else degraded.push({id:spec.id,reasonCode:layer.reasonCode});
      continue;
    }
    if(layer.status!=='ok'){failures.push(`${spec.id}: invalid status ${layer.status}`);continue;}
    const date=layer.latest_date;
    const valid=validDate(date);
    if(!valid||layer.template!==tileUrl(spec,date,true)||layer.reasonCode!==null){failures.push(`${spec.id}: invalid advertised date/template`);continue;}
    // Fetch exactly the dated URL advertised to the user. A different recent
    // successful date cannot clear a broken advertised observation.
    const tile=await readTile(tileUrl(spec,date));
    const expectedType=spec.ext==='jpg'?'image/jpeg':'image/png';
    if(tile.type?.split(';')[0]!==expectedType||!await hasData(tile))failures.push(`${spec.id}: advertised ${date} has no decoded data (HTTP ${tile.status})`);
    else verified.push({id:spec.id,date,bytes:tile.bytes});
  }
  for(const spec of specs)if(!seen.has(spec.id))failures.push(`${spec.id}: missing API registry layer`);
  if(!seen.has('rainviewer-radar'))failures.push('missing radar registry layer');
  const available=layers.filter(l=>l?.status==='ok').length;
  const unavailable=layers.filter(l=>l?.status==='unavailable').length;
  const status=available?(unavailable?'partial':'ok'):'unavailable';
  if(body.status!==status)failures.push(`environment status ${body.status} contradicts layer coverage (${status})`);
  if(status==='ok'&&body.reasonCode!==null)failures.push('healthy environment has failure reason');
  if(status!=='ok'&&(typeof body.reasonCode!=='string'||!body.reasonCode.trim()))failures.push('degraded environment needs reasonCode');
  if(!body.timestamp||!Number.isFinite(Date.parse(body.timestamp))||now-Date.parse(body.timestamp)>5*60000||Date.parse(body.timestamp)-now>60000)failures.push('environment timestamp missing/stale/future');
  return {failures,verified,degraded};
}
