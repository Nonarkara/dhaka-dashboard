import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
function load(){const m={exports:{}};new Function('module','exports',ts.transpileModule(readFileSync('src/instruments.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);return m.exports;}
const {selectMacro,selectFx}=load(), now=Date.parse('2026-10-28T12:00Z');
const row=(value,date='2025',code='BGD',id='SP.POP.TOTL')=>({value,date,countryiso3code:code,indicator:{id}});
assert.deepEqual(selectMacro([{},[row(null,'2026'),row(170000000,'2024'),row(177000000,'2025')]],'SP.POP.TOTL',now),{value:177000000,period:'2025'});
for(const r of [row('177'),row(NaN),row(1,'2027'),row(-1),row(170,'2025','IND'),row(170,'2025','BGD','wrong')])assert.throws(()=>selectMacro([{},[r]],'SP.POP.TOTL',now));
assert.equal(selectMacro([{},[row(-1,'2025','BGD','FP.CPI.TOTL.ZG')]],'FP.CPI.TOTL.ZG',now).value,-1);
const fx={date:'2026-10-28',usd:{usd:1,bdt:122.4}};assert.equal(selectFx(fx,now).rate,122.4);
for(const bad of [{...fx,date:'2026-10-20'},{...fx,date:'2026-10-29'},{...fx,usd:{usd:1,bdt:0}},{...fx,usd:{usd:1,bdt:'122'}},{...fx,usd:{usd:2,bdt:122}}])assert.throws(()=>selectFx(bad,now));
const win={}, doc={documentElement:{lang:'en'}};vm.runInNewContext(readFileSync('public/instruments.js','utf8'),{window:win,document:doc,Intl});
assert.match(win.AtlasInstruments.format(170000000,'count',true),/^170m$/i);assert.equal(win.AtlasInstruments.format(null,'count'),null);assert.equal(win.AtlasInstruments.format(0,'count'),'0');
doc.documentElement.lang='bn';assert.match(win.AtlasInstruments.format(170000000,'count'),/[০-৯]/);
assert.match(win.AtlasInstruments.format(456000000000,'usd',true),/৪৫৬ বিলিয়ন/);
const original=globalThis.fetch;
try {
  globalThis.fetch=async()=>{throw Error('offline')};const missing=await load().getInstruments();assert.equal(missing.status,'unavailable');assert.equal(missing.macro.length,17);assert.equal(missing.currency.rate,null);assert.ok(missing.currency.reasonCode&&missing.currency.timestamp);assert.ok(missing.macro.every(x=>x.value===null&&x.reasonCode&&x.timestamp));
  let calls=0;globalThis.fetch=async url=>{calls++;if(String(url).includes('currencies/usd.json'))return Response.json({date:new Date().toISOString().slice(0,10),usd:{usd:1,bdt:122.4}});const id=String(url).split('/indicator/')[1].split('?')[0];return Response.json([{},[row(id==='SP.POP.TOTL'?177000000:4,'2025','BGD',id)]]);};
  const api=load();const [a,b]=await Promise.all([api.getInstruments(),api.getInstruments()]);assert.equal(calls,18,'concurrent requests share upstream work');assert.equal(a.status,'ok');assert.equal(a.macro[1].period,'2025');assert.equal(a.currency.cadence,'daily');assert.equal(a.currency.provenance,'reference');await api.getInstruments();assert.equal(calls,18,'fresh reference data cached');
  const successFetch=globalThis.fetch;globalThis.fetch=async url=>String(url).includes('NY.GDP.MKTP.CD')?new Response('',{status:429}):successFetch(url);const partial=await load().getInstruments();assert.equal(partial.status,'partial');assert.equal(partial.macro[0].reasonCode,'worldbank-rate-limited');assert.equal(partial.macro[1].status,'ok');
} finally {globalThis.fetch=original;}
console.log('✓ National data: correct population scale, Bengali digits, null/zero, country/indicator/date validation, daily FX freshness, partial outages and single-flight cache');

// Exercise the actual ledger render: the API already had 17 series while the
// old eight-item client silently hid nine of them. Rendering on outages must
// keep the same register of series, with missing values explicitly unavailable.
class LedgerElement {
  constructor(tag) { this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.className='';this._text=''; }
  set textContent(value) {this._text=String(value);this.children=[];}
  get textContent() {return this._text+this.children.map(child=>child.textContent).join('');}
  appendChild(child) {this.children.push(child);return child;}
  append(...children) {children.forEach(child=>this.appendChild(child));}
  setAttribute(name,value) {this.attributes[name]=String(value);}
}
function descendants(element) {return element.children.flatMap(child=>[child,...descendants(child)]);}
async function renderLedger(payload,language='en',offline=false,withBand=true) {
  const strip=new LedgerElement('div'),desk=new LedgerElement('div'),listeners={};
  const document={documentElement:{lang:language},createElement:tag=>new LedgerElement(tag),
    querySelector:selector=>selector==='#atlas-instruments'?(withBand?strip:null):selector==='#atlas-national-data'?desk:null,
    querySelectorAll:selector=>selector==='.instrument-clock'?[...descendants(strip),...descendants(desk)].filter(el=>el.className==='instrument-clock'):[]};
  const window={addEventListener:(name,fn)=>listeners[name]=fn};
  vm.runInNewContext(readFileSync('public/instruments.js','utf8'),{window,document,Intl,Date,AbortSignal,setInterval(){},fetch:async()=>{if(offline)throw Error('offline');return {ok:true,json:async()=>payload};}});
  window.AtlasInstruments.start();
  const initialText=desk.textContent;
  // load() is started by the public boot interface and intentionally returns
  // no network promise. Drain its two resolved fetch/JSON continuations.
  await new Promise(resolve=>setImmediate(resolve));
  return {strip,desk,document,initialText,rerender:()=>listeners['atlas:language']()};
}
const specs=load().MACRO_SPECS;
for(const id of ['life-expectancy','physicians','co2-per-capita'])assert.equal(specs.find(spec=>spec.id===id).format,'decimal',`${id} must keep fractions`);
const ledgerPayload={status:'partial',timestamp:'2026-11-04T12:00:00.000Z',currency:{status:'ok',rate:122.4,period:'2026-11-04',fetchedAt:'2026-11-04T12:00:00.000Z',source:'Fawaz Ahmed Currency API'},macro:specs.map(spec=>({...spec,status:'ok',value:spec.id==='population'?177000000:spec.id==='life-expectancy'?73.72:spec.id==='physicians'?0.73:spec.id==='co2-per-capita'?0.64:4,period:'2024',fetchedAt:'2026-11-04T11:00:00.000Z',source:'World Bank WDI'}))};
ledgerPayload.macro.find(reading=>reading.id==='tax-revenue').status='unavailable';
ledgerPayload.macro.find(reading=>reading.id==='tax-revenue').value=null;
ledgerPayload.macro.find(reading=>reading.id==='tax-revenue').reasonCode='worldbank-rate-limited';
for(const language of ['en','bn']) {
  const {desk,strip,document,rerender}=await renderLedger(ledgerPayload,language);
  const elements=descendants(desk),rows=elements.filter(el=>el.tagName==='DD');
  assert.equal(rows.length,18,'daily FX plus every national series is rendered');
  assert.deepEqual(rows.filter(el=>el.dataset.series!=='daily-fx').map(el=>el.dataset.series).sort(),specs.map(spec=>spec.id).sort());
  assert.equal(elements.filter(el=>el.tagName==='H4').length,7,'all seven domains retain their series');
  const shown=id=>rows.find(el=>el.dataset.series===id).children[0].textContent;
  assert.match(shown('physicians'),language==='bn'?/০\.৭৩ প্রতি ১,০০০ জনে/:/0\.73 per 1,000 people/);
  assert.match(shown('co2-per-capita'),language==='bn'?/০\.৬৪ টন/:/0\.64 tonnes/);
  assert.match(shown('life-expectancy'),language==='bn'?/৭৩\.৭২ বছর/:/73\.72 years/);
  assert.match(shown('tax-revenue'),language==='bn'?/অনুপলব্ধ/:/Unavailable/);
  assert.match(rows.find(el=>el.dataset.series==='tax-revenue').textContent,/worldbank-rate-limited/);
  const physician=rows.find(el=>el.dataset.series==='physicians');
  assert.match(physician.textContent,/2024/);assert.match(physician.textContent,/2026-11-04T11:00:00.000Z/);
  assert.match(physician.children.find(el=>el.tagName==='A').href,/SH.MED.PHYS.ZS/);
  const fxSlot=descendants(strip).find(el=>el.dataset.slot==='fx');
  assert.doesNotMatch(fxSlot.title,/live|লাভ/i);assert.match(fxSlot.title,language==='bn'?/দৈনিক তথ্যসূত্র/:/Daily reference/);
  document.documentElement.lang=language==='bn'?'en':'bn';rerender();
  assert.match(desk.textContent,language==='bn'?/Life expectancy at birth/:/জন্মের সময় প্রত্যাশিত আয়ু/);
  const outage=await renderLedger(null,language,true);
  const outageRows=descendants(outage.desk).filter(el=>el.tagName==='DD');
  assert.equal(outageRows.length,18,'offline UI retains all source series');
  assert.ok(outageRows.every(el=>el.children[0].textContent===(language==='bn'?'অনুপলব্ধ':'Unavailable')));
}
console.log('✓ National ledger rendering: 17 series + daily FX, seven bilingual groups, fractional units, source periods, partial/offline rows and daily-reference wording');

// The real header removed the optional band. The desk must not depend on it.
const actualHeaderHasBand=readFileSync('public/index.html','utf8').includes('id="atlas-instruments"');
for(const language of ['en','bn']) {
  for(const withBand of new Set([false,actualHeaderHasBand])) {
    const rendered=await renderLedger(ledgerPayload,language,false,withBand);
    assert.equal(descendants(rendered.desk).filter(el=>el.tagName==='DD').length,18,'desk renders without optional header band');
    assert.match(rendered.initialText,language==='bn'?/যন্ত্রের ঘড়ি/:/Device clock/,'before synchronization the clock names device time');
    assert.match(rendered.desk.textContent,language==='bn'?/সার্ভারের সঙ্গে সমন্বিত ঘড়ি/:/Server-synced clock/);
    const failed=await renderLedger(ledgerPayload,language,true,withBand);
    assert.match(failed.desk.textContent,language==='bn'?/যন্ত্রের ঘড়ি/:/Device clock/,'offline clock never claims server synchronization');
    const malformed=await renderLedger({...ledgerPayload,timestamp:'invalid-time'},language,false,withBand);
    assert.match(malformed.desk.textContent,language==='bn'?/যন্ত্রের ঘড়ি/:/Device clock/,'invalid timestamp cannot label a server clock');
    assert.doesNotMatch(malformed.desk.textContent,/Invalid Date/);
  }
}
console.log('✓ National desk works without removed header band; clock basis names device time until valid synchronization and after failure');
