// National reference data. Annual statistics and daily FX are not live readings.
export const MACRO_SPECS = [
  {id:'gdp',label:'GDP',label_bn:'জিডিপি',unit:'USD',indicator:'NY.GDP.MKTP.CD',format:'usd'},
  {id:'population',label:'Population',label_bn:'জনসংখ্যা',unit:'people',indicator:'SP.POP.TOTL',format:'count'},
  {id:'inflation',label:'CPI inflation',label_bn:'মূল্যস্ফীতি',unit:'%',indicator:'FP.CPI.TOTL.ZG',format:'pct'},
  {id:'remittance',label:'Remittances',label_bn:'প্রবাসী আয়',unit:'USD',indicator:'BX.TRF.PWKR.CD.DT',format:'usd'},
  {id:'exports',label:'Exports',label_bn:'রপ্তানি',unit:'USD',indicator:'BX.GSR.GNFS.CD',format:'usd'},
  {id:'industry',label:'Industry share',label_bn:'শিল্পখাতের অংশ',unit:'% GDP',indicator:'NV.IND.TOTL.ZS',format:'pct'},
  {id:'unemployment',label:'Unemployment',label_bn:'বেকারত্ব',unit:'%',indicator:'SL.UEM.TOTL.ZS',format:'pct'},
  {id:'fx-period',label:'Official FX annual average',label_bn:'সরকারি বার্ষিক গড় বিনিময় হার',unit:'BDT/USD',indicator:'PA.NUS.FCRF',format:'rate'},
] as const;
const FX_URLS = ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json','https://latest.currency-api.pages.dev/v1/currencies/usd.json'];
export function selectMacro(raw: unknown, indicator: string, now=Date.now()) {
  if (!Array.isArray(raw) || !Array.isArray(raw[1])) throw Error('worldbank-invalid-response');
  const year=new Date(now).getUTCFullYear();
  const rows=raw[1].filter((r: any)=>r?.countryiso3code==='BGD' && r?.indicator?.id===indicator && typeof r.value==='number' && Number.isFinite(r.value) && /^\d{4}$/.test(r.date) && Number(r.date)<=year && Number(r.date)>=1960 && (indicator==='FP.CPI.TOTL.ZG' || r.value>=0));
  rows.sort((a: any,b: any)=>Number(b.date)-Number(a.date));
  if (!rows.length) throw Error('worldbank-no-valid-observation');
  return {value:rows[0].value as number,period:rows[0].date as string};
}
export function selectFx(raw: unknown,now=Date.now()) {
  const x=raw as {date?:string;usd?:{bdt?:number;usd?:number}};
  if (typeof x?.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || !Number.isFinite(x.usd?.bdt) || x.usd!.bdt!<=0 || x.usd?.usd!==1) throw Error('fx-invalid-response');
  const ms=Date.parse(x.date+'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10)!==x.date || ms>now || now-ms>3*86400000) throw Error('fx-stale-or-invalid-date');
  return {rate:x.usd!.bdt!,period:x.date};
}
const cache=new Map<string,{at:number;ttl:number;data:unknown}>();
const pending=new Map<string,Promise<any>>();
async function cached(key:string,ttl:number,run:()=>Promise<unknown>) {
  const hit=cache.get(key);if(hit&&Date.now()-hit.at<hit.ttl)return hit.data;
  if(pending.has(key))return pending.get(key);
  const task=run().then(data=>{const healthy=Array.isArray(data)?data.every(r=>r.status==='ok'):(data as {status?:string}).status==='ok';cache.set(key,{at:Date.now(),ttl:healthy?ttl:60000,data});return data;}).finally(()=>pending.delete(key));
  pending.set(key,task);return task;
}
function reason(e:unknown) {return e instanceof Error && /^(worldbank|fx)-[a-z-]+$/.test(e.message) ? e.message : 'upstream-unreachable';}
export async function getInstruments() {
  const [currency,macro]=await Promise.all([
    cached('fx',3600000,async()=>{
      const timestamp=new Date().toISOString();
      const base={base:'USD',quote:'BDT',source:'Fawaz Ahmed Currency API',sourceUrl:'https://github.com/fawazahmed0/exchange-api',license:'CC0-1.0',provenance:'reference',cadence:'daily',fetchedAt:timestamp,timestamp};
      let reasonCode='fx-upstream-unreachable';
      for(const url of FX_URLS) {
        try {
          const res=await fetch(url,{signal:AbortSignal.timeout(7000)});
          if(!res.ok)throw Error(res.status===429?'fx-rate-limited':'fx-upstream-http-error');
          return {...base,...selectFx(await res.json()),status:'ok',reasonCode:null};
        } catch(e) {reasonCode=reason(e);}
      }
      return {...base,status:'unavailable',provenance:'unavailable',reasonCode,rate:null,period:null};
    }),
    cached('macro',6*3600000,()=>Promise.all(MACRO_SPECS.map(async spec=>{
      const timestamp=new Date().toISOString();
      const base={...spec,source:'World Bank WDI',sourceUrl:`https://data.worldbank.org/indicator/${spec.indicator}?locations=BD`,cadence:'annual',fetchedAt:timestamp,timestamp};
      try {
        const res=await fetch(`https://api.worldbank.org/v2/country/BGD/indicator/${spec.indicator}?format=json&mrv=5&per_page=10`,{signal:AbortSignal.timeout(10000)});
        if(!res.ok)throw Error(res.status===429?'worldbank-rate-limited':'worldbank-upstream-http-error');
        return {...base,...selectMacro(await res.json(),spec.indicator),status:'ok',provenance:'reference',reasonCode:null};
      } catch(e) {return {...base,status:'unavailable',provenance:'unavailable',reasonCode:reason(e),value:null,period:null};}
    })))
  ]);
  const any=currency.status==='ok'||macro.some((m:any)=>m.status==='ok');
  const all=currency.status==='ok'&&macro.every((m:any)=>m.status==='ok');
  return {status:all?'ok':any?'partial':'unavailable',reasonCode:all?null:any?'some-national-series-unavailable':'national-series-unavailable',country:'Bangladesh',currency,macro,timestamp:new Date().toISOString()};
}
