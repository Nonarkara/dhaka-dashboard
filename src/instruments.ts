// National reference data. Annual statistics and daily FX are not live readings.
//
// Each series carries the city domain it speaks to, so the national picture
// can be read against the satellite picture: what the instruments measured
// in one district, and what the state is doing about it nationally.
export const MACRO_SPECS = [
  {id:'gdp',label:'GDP',label_bn:'জিডিপি',unit:'USD',indicator:'NY.GDP.MKTP.CD',format:'usd',domain:'economy'},
  {id:'population',label:'Population',label_bn:'জনসংখ্যা',unit:'people',indicator:'SP.POP.TOTL',format:'count',domain:'people'},
  {id:'inflation',label:'CPI inflation',label_bn:'মূল্যস্ফীতি',unit:'%',indicator:'FP.CPI.TOTL.ZG',format:'pct',domain:'economy'},
  {id:'remittance',label:'Remittances',label_bn:'প্রবাসী আয়',unit:'USD',indicator:'BX.TRF.PWKR.CD.DT',format:'usd',domain:'economy'},
  {id:'exports',label:'Exports',label_bn:'রপ্তানি',unit:'USD',indicator:'BX.GSR.GNFS.CD',format:'usd',domain:'economy'},
  {id:'industry',label:'Industry share',label_bn:'শিল্পখাতের অংশ',unit:'% GDP',indicator:'NV.IND.TOTL.ZS',format:'pct',domain:'economy'},
  {id:'unemployment',label:'Unemployment',label_bn:'বেকারত্ব',unit:'%',indicator:'SL.UEM.TOTL.ZS',format:'pct',domain:'people'},
  {id:'fx-period',label:'Official FX annual average',label_bn:'সরকারি বার্ষিক গড় বিনিময় হার',unit:'BDT/USD',indicator:'PA.NUS.FCRF',format:'rate',domain:'economy'},
  // Capacities and education.
  {id:'literacy',label:'Adult literacy rate',label_bn:'প্রাপ্তবয়স্কদের সাক্ষরতার হার',unit:'%',indicator:'SE.ADT.LITR.ZS',format:'pct',domain:'people'},
  {id:'school-enrolment',label:'Secondary school enrolment',label_bn:'মাধ্যমিক বিদ্যালয়ে ভর্তি',unit:'%',indicator:'SE.SEC.ENRR',format:'pct',domain:'people'},
  {id:'life-expectancy',label:'Life expectancy at birth',label_bn:'জন্মের সময় আয়ুক্ষমাপ',unit:'years',indicator:'SP.DYN.LE00.IN',format:'count',domain:'smart-living'},
  {id:'physicians',label:'Physicians per 1,000 people',label_bn:'হাজার মানুষে চিকিৎসক',unit:'per 1,000',indicator:'SH.MED.PHYS.ZS',format:'count',domain:'smart-living'},
  {id:'urban-share',label:'Urban population share',label_bn:'শহুরে জনগণের অনুপাত',unit:'%',indicator:'SP.URB.TOTL.IN.ZS',format:'pct',domain:'mobility'},
  // Energy.
  {id:'electricity-access',label:'Electricity access',label_bn:'বিদ্যুৎ সরবরাহ',unit:'%',indicator:'EG.ELC.ACCS.ZS',format:'pct',domain:'energy'},
  {id:'renewables',label:'Renewable electricity share',label_bn:'নবায়নযোগ্য বিদ্যুতের অংশ',unit:'%',indicator:'EG.ELC.RNEW.ZS',format:'pct',domain:'energy'},
  // Environment.
  {id:'co2-per-capita',label:'CO₂ per person',label_bn:'জনপ্রতি কার্বন ডাই-অক্সাইড',unit:'t',indicator:'EN.GHG.CO2.PC.CE.AR5',format:'count',domain:'environment'},
  // Governance.
  {id:'tax-revenue',label:'Tax revenue',label_bn:'কর আদায়',unit:'% GDP',indicator:'GC.TAX.TOTL.GD.ZS',format:'pct',domain:'governance'},
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
