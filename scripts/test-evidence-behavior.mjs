import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const NOW=Date.parse('2026-11-25T12:00:00Z');
class ClockDate extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.events=new Map();this.value='';this.open=false;this.disabled=false;this.className='';this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>typeof child==='string'?child:child.textContent).join('');}
  set innerHTML(value){this._text=String(value);this.children=[];}
  get innerHTML(){return this._text;}
  appendChild(child){this.children.push(child);return child;}
  append(...children){this.children.push(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}
  close(){this.open=false;for(const fn of this.events.get('close')||[])fn();}
}
const descendants=e=>e.children.flatMap(c=>typeof c==='string'?[]:[c,...descendants(c)]);
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const signalId='MODIS_Terra_Land_Surface_Temp_Day_TES';
const measurement=(date,value=300)=>({layerId:signalId,label:'Daytime surface heat',label_bn:'দিনের ভূমির তাপ',domain:'environment',status:'ok',value,unit:'K',observationDate:date,static:false,vintage:null,period:null,censored:false,coverage:1,source:'NASA GIBS',sourceUrl:'https://gibs.earthdata.nasa.gov/',provenance:'measured',processingMethod:'gibs-palette-window-mean-v1',sampling:{type:'point-window',radiusPx:2,bbox:[90.4,23.7,90.5,23.8],scope:'square window 5px across around motijheel'},resolutionM:1120,windowM:5600,nativeResolutionM:null});
const row=(date,value,id)=>({place_id:'motijheel',layer_id:signalId,status:'ok',value,unit:'K',observation_date:date,metadata:measurement(date,value),snapshotUrl:`/api/atlas/history?snapshot=${id}`});
const history=[row('2026-11-22',303,'11111111-1111-4111-8111-111111111111'),row('2026-11-22',303,'33333333-3333-4333-8333-333333333333'),row('2026-11-21',300,'22222222-2222-4222-8222-222222222222')];
const fixture={status:'partial',measured:1,total:7,domains:[{id:'environment',label:'Environment',label_bn:'পরিবেশ',question:'Heat?',question_bn:'তাপ?'}],districts:[{id:'motijheel',name:'Motijheel',name_bn:'মতিঝিল',measurements:[measurement('2026-11-22',303)],readings:[{domain:'environment',status:'unavailable',reasonCode:'fixture'}]}],delivery:{collectedAt:new ClockDate().toISOString(),status:'fresh'}};
function collageHarness(){
  const elements=new Map(['collage-districts','collage-domains','collage-dialog','opener'].map(id=>[id,new Element()])),listeners=new Map(),calls=[];
  const document={documentElement:{lang:'en'},querySelector:s=>s.startsWith('#')?elements.get(s.slice(1)):elements.get('opener'),getElementById:id=>elements.get(id),createElement:tag=>new Element(tag)};
  const window={addEventListener:(name,fn)=>listeners.set(name,fn)},timeouts=[];
  let ignoreAbort=false,malformedHealth=false,malformedSnapshot=false,currentHistory=structuredClone(history);
  let failHealth=false,failHistory=false,holdHistory=false,releaseHistory;
  const gate=new Promise(resolve=>releaseHistory=resolve);
  vm.runInNewContext(read('public/collage.js'),{window,document,Intl,Date:ClockDate,URLSearchParams,AbortController,AbortSignal:{any:AbortSignal.any,timeout(){const c=new AbortController();timeouts.push(c);return c.signal;}},fetch:async(url,options)=>{
    calls.push({url,signal:options.signal});
    if(url==='/api/atlas/collage')return Response.json(malformedSnapshot?{districts:[]}:structuredClone(fixture));
    if(url==='/api/atlas/sources' && malformedHealth)return Response.json({status:'fresh',collector:{},sources:null});
    if(url==='/api/atlas/sources')return failHealth?new Response('',{status:503}):Response.json({status:'fresh',collector:{last_success_at:'2026-11-25T07:00:00Z'},sources:[{layerId:signalId,availablePlaces:0,totalPlaces:14,observationDate:'2001-01-01'}]});
    if(holdHistory)await (ignoreAbort?gate:Promise.race([gate,new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))]));
    return failHistory?new Response('',{status:503}):Response.json({status:'ok',records:structuredClone(currentHistory)});
  }});
  return {api:window.AtlasCollage,window,document,elements,listeners,calls,async open(){elements.get('collage-dialog').open=true;for(const fn of elements.get('opener').events.get('click')||[])await fn();},set failHealth(v){failHealth=v;},set failHistory(v){failHistory=v;},set holdHistory(v){holdHistory=v;},set ignoreAbort(v){ignoreAbort=v;},set malformedHealth(v){malformedHealth=v;},set malformedSnapshot(v){malformedSnapshot=v;},set history(v){currentHistory=v;},expire(){timeouts.at(-1).abort(new DOMException('timeout','TimeoutError'));},releaseHistory};
}
let h=collageHarness();
const compare=h.api.compareStored;
let comparison=compare(history,'motijheel',signalId);
assert.equal(comparison.status,'ok');assert.equal(comparison.delta,3);assert.equal(comparison.older.metadata.observationDate,'2026-11-21');
assert.equal(comparison.newer.metadata.observationDate,'2026-11-22','duplicate collection dates do not become a new observation');
for(const [label,mutate] of [
  ['method absent',m=>delete m.processingMethod],['method changed',m=>m.processingMethod='gibs-palette-window-mean-v2'],
  ['unit changed',m=>m.unit='C'],['window changed',m=>m.sampling.bbox[0]=90.3],['source changed',m=>m.source='other'],
  ['spacing changed',m=>m.resolutionM=500],['partial pixels',m=>m.coverage=0.9],['static reference',m=>m.static=true],
  ['annual period',m=>m.period='2024'],['climatology',m=>m.period='2001–2020'],['censored',m=>m.censored=true],
  ['bad geometry',m=>m.sampling.bbox=[190,0,191,1]],['model method',m=>m.processingMethod='nasa-power-climatology-point-v1'],
]){
  const bad=structuredClone(history);mutate(bad[0].metadata);bad[0].unit=bad[0].metadata.unit;
  assert.equal(compare(bad,'motijheel',signalId).status,'unavailable',label);
}
assert.equal(compare(history.slice(0,2),'motijheel',signalId).reasonCode,'two-distinct-observations-required');
assert.equal(compare(history,'gulshan',signalId).reasonCode,'incompatible-history-identity');
const foreign=structuredClone(history);foreign[0].snapshotUrl='https://example.com';assert.equal(compare(foreign,'motijheel',signalId).reasonCode,'invalid-snapshot-reference');
assert.equal(compare(null,'motijheel',signalId).status,'unavailable');

h.api.start();h.api.start();await drain();assert.equal(h.calls.length,0,'closed collage must not fetch at startup');await h.open();await drain();
assert.equal(h.calls.filter(c=>c.url==='/api/atlas/collage').length,1,'module starts once');
assert.equal(h.calls.length,1,'collector/history sources are not fetched until the optional evidence is requested');
const details=()=>descendants(h.elements.get('collage-domains')).find(el=>el.className==='collage-evidence');
let d=details();d.open=true;d.ontoggle();await drain();
assert.match(d.textContent,/Collector last success/);assert.match(d.textContent,/0\/14/,'no source observations is distinct from fresh collection');assert.match(d.textContent,/Selected stored sample: 2026-11-22/);assert.doesNotMatch(d.textContent,/2001-01-01/,'source aggregate first-place date must not replace selected-place observation');
assert.equal(h.calls.at(-1).url,'/api/atlas/sources');
let button=descendants(d).find(el=>el.textContent==='Compare latest stored observation dates');
await button.onclick();assert.match(d.textContent,/change \+3 °C/);assert.match(d.textContent,/Earlier archive/);assert.match(d.textContent,/Later archive/);
assert.ok(h.calls.at(-1).url.startsWith('/api/atlas/history?place=motijheel&signal='));
const lowerBound=structuredClone(history);lowerBound[0].metadata.censored=true;h.history=lowerBound;await button.onclick();
assert.match(d.textContent,/An exact pair of stored values is unavailable/);assert.match(d.textContent,/inexact-stored-estimate/,'human explanation retains the machine reason');
h.history=history;
h.failHealth=true;await descendants(d).find(el=>el.textContent==='Refresh source health').onclick();assert.match(d.textContent,/source-health-request-failed/);
h.failHealth=false;await descendants(d).find(el=>el.textContent==='Refresh source health').onclick();assert.match(d.textContent,/Collector last success/);
h.failHistory=true;await button.onclick();assert.match(d.textContent,/history-request-failed/);h.failHistory=false;await button.onclick();assert.match(d.textContent,/change \+3/);
h.holdHistory=true;const timedRead=button.onclick();h.expire();await timedRead;assert.match(d.textContent,/history-request-timeout/);assert.equal(button.disabled,false,'timed-out history can retry');
h.malformedHealth=true;await descendants(d).find(el=>el.textContent==='Refresh source health').onclick();assert.match(d.textContent,/source-health-request-failed/);h.malformedHealth=false;
h.ignoreAbort=true;const oldRead=button.onclick();h.document.documentElement.lang='bn';h.listeners.get('atlas:language')();h.releaseHistory();await oldRead;
assert.match(details().textContent,/উৎসের অবস্থা/);assert.doesNotMatch(details().textContent,/Stored sample difference/,'detached language response cannot repaint the current panel');
assert.ok(h.calls.some(c=>c.signal.aborted),'closing/rebuilding evidence cancels its owned request');
const oldMethod=structuredClone(history);delete oldMethod[0].metadata.processingMethod;h.history=oldMethod;h.holdHistory=false;
d=details();d.open=true;d.ontoggle();await drain();
button=descendants(d).find(el=>el.textContent==='সর্বশেষ সংরক্ষিত পর্যবেক্ষণের তারিখ তুলনা করুন');await button.onclick();
assert.match(d.textContent,/প্রক্রিয়াকরণের পদ্ধতি নথিভুক্ত নেই/);assert.match(d.textContent,/processing-method-not-recorded/);
assert.doesNotMatch(d.textContent,/The archive did not record/,'Bengali refusal must not rely on the English explanation');
const broken=collageHarness();broken.malformedSnapshot=true;broken.api.start();await broken.open();await drain();
assert.match(broken.elements.get('collage-domains').textContent,/snapshot-request-failed/);
const retry=descendants(broken.elements.get('collage-domains')).find(el=>el.className.includes('collage-retry'));
broken.malformedSnapshot=false;await retry.events.get('click')[0]();assert.ok(descendants(broken.elements.get('collage-domains')).some(el=>el.className==='collage-evidence'),'malformed snapshot Retry recovers without a page reload');
console.log('✓ Evidence: stored method/geometry/date compatibility, honest refusal, source-health absence, explicit acquisition, retry and language ownership.');

function instrumentHarness(){
  const desk=new Element(),dialog=new Element('dialog'),opener=new Element('button'),documentEvents=new Map(),windowEvents=new Map(),timers=new Map(),calls=[];
  let next=0,blocked=false,release;
  const gate=new Promise(resolve=>release=resolve);
  const document={hidden:false,documentElement:{lang:'en'},createElement:tag=>new Element(tag),querySelector:s=>s==='#atlas-national-data'?desk:s==='#national-data-dialog'?dialog:s==='[data-open="national-data-dialog"]'?opener:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>documentEvents.set(name,fn)};
  const window={addEventListener:(name,fn)=>windowEvents.set(name,fn)};
  let populationValue=1;
  const payload=()=>({timestamp:new Date().toISOString(),macro:[{id:'population',status:'ok',value:populationValue,format:'count',unit:'people',period:'2024',fetchedAt:'2026-11-25T07:00:00Z',source:'World Bank WDI'}]});
  vm.runInNewContext(read('public/instruments.js'),{window,document,Intl,Date:ClockDate,AbortController,AbortSignal,setInterval:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearInterval:id=>timers.delete(id),fetch:async(url,options)=>{calls.push(options.signal);const body=payload();if(blocked)await gate;return Response.json(body);}});
  return {api:window.AtlasInstruments,desk,timers,calls,document,windowEvents,async open(){dialog.open=true;for(const fn of opener.events.get('click')||[])await fn();},close(){dialog.close();},visibility(hidden){document.hidden=hidden;documentEvents.get('visibilitychange')();},set blocked(v){blocked=v;},set population(v){populationValue=v;},release};
}
let instruments=instrumentHarness();instruments.api.start();instruments.api.start();await drain();assert.equal(instruments.calls.length,0,'closed national desk must not fetch at startup');assert.equal(instruments.timers.size,0);await instruments.open();await drain();
assert.equal(instruments.timers.size,2);assert.equal(instruments.calls.length,1);
instruments.visibility(true);assert.equal(instruments.timers.size,0,'hidden page owns no clock or refresh timer');
instruments.visibility(false);await drain();assert.equal(instruments.calls.length,1,'fresh return does not repeat acquisition');assert.equal(instruments.timers.size,2);
instruments.population=2;instruments.blocked=true;[...instruments.timers.values()].find(t=>t.ms===30*60*1000).fn();await drain();
assert.equal(instruments.calls.length,2);[...instruments.timers.values()].find(t=>t.ms===30*60*1000).fn();await drain();assert.equal(instruments.calls.length,2,'concurrent refreshes share one pending request');instruments.visibility(true);assert.equal(instruments.calls.at(-1).aborted,true);
instruments.population=3;instruments.blocked=false;instruments.visibility(false);await drain();assert.equal(instruments.calls.length,3,'interrupted refresh restarts exactly once on return');
instruments.release();await drain();instruments.windowEvents.get('atlas:language')();assert.match(instruments.desk.textContent,/Population3 people/,'cancelled earlier response must not replace the newer visible value');assert.equal(instruments.timers.size,2,'late old request does not duplicate tasks');
console.log('✓ National lifecycle: single start/request, hidden-page timer cancellation, due/interrupted refresh and stale-response ownership.');

const hiddenStart=instrumentHarness();hiddenStart.document.hidden=true;hiddenStart.api.start();await hiddenStart.open();await drain();assert.equal(hiddenStart.calls.length,0);assert.equal(hiddenStart.timers.size,0);hiddenStart.visibility(false);await drain();assert.equal(hiddenStart.calls.length,1);assert.equal(hiddenStart.timers.size,2);

instruments.close();assert.equal(instruments.timers.size,0,'closing the national desk stops its recurring work');const closedCalls=instruments.calls.length;instruments.visibility(true);instruments.visibility(false);await drain();assert.equal(instruments.calls.length,closedCalls,'a closed desk remains idle when the page returns');
