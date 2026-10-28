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
  globalThis.fetch=async()=>{throw Error('offline')};const missing=await load().getInstruments();assert.equal(missing.status,'unavailable');assert.equal(missing.macro.length,8);assert.equal(missing.currency.rate,null);assert.ok(missing.currency.reasonCode&&missing.currency.timestamp);assert.ok(missing.macro.every(x=>x.value===null&&x.reasonCode&&x.timestamp));
  let calls=0;globalThis.fetch=async url=>{calls++;if(String(url).includes('currencies/usd.json'))return Response.json({date:new Date().toISOString().slice(0,10),usd:{usd:1,bdt:122.4}});const id=String(url).split('/indicator/')[1].split('?')[0];return Response.json([{},[row(id==='SP.POP.TOTL'?177000000:4,'2025','BGD',id)]]);};
  const api=load();const [a,b]=await Promise.all([api.getInstruments(),api.getInstruments()]);assert.equal(calls,9,'concurrent requests share upstream work');assert.equal(a.status,'ok');assert.equal(a.macro[1].period,'2025');assert.equal(a.currency.cadence,'daily');assert.equal(a.currency.provenance,'reference');await api.getInstruments();assert.equal(calls,9,'fresh reference data cached');
  const successFetch=globalThis.fetch;globalThis.fetch=async url=>String(url).includes('NY.GDP.MKTP.CD')?new Response('',{status:429}):successFetch(url);const partial=await load().getInstruments();assert.equal(partial.status,'partial');assert.equal(partial.macro[0].reasonCode,'worldbank-rate-limited');assert.equal(partial.macro[1].status,'ok');
} finally {globalThis.fetch=original;}
console.log('✓ National data: correct population scale, Bengali digits, null/zero, country/indicator/date validation, daily FX freshness, partial outages and single-flight cache');
