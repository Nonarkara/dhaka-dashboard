(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const bn = () => document.documentElement.lang === 'bn';
  const tr = (en,be) => bn() ? be : en;
  const fields = [['gdp','GDP','জিডিপি'],['population','Population','জনসংখ্যা'],['inflation','CPI inflation','মূল্যস্ফীতি'],['remittance','Remittances','প্রবাসী আয়'],['exports','Exports','রপ্তানি'],['industry','Industry share','শিল্পখাতের অংশ'],['unemployment','Unemployment','বেকারত্ব'],['fx-period','Official FX annual average','সরকারি বার্ষিক গড় বিনিময় হার']];
  let data, started = false;
  function format(value,kind,compact=false) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const scale = compact ? [[1e12,'T',' ট্রিলিয়ন'],[1e9,'B',' বিলিয়ন'],[1e6,'M',' মিলিয়ন'],[1e3,'K',' হাজার']].find(([limit])=>Math.abs(value)>=limit) : null;
    const shown = new Intl.NumberFormat(bn()?'bn-BD':'en-GB',{maximumFractionDigits:kind==='count'?(compact?1:0):2}).format(scale ? value/scale[0] : value);
    return shown + (scale ? scale[bn()?2:1] : '');
  }
  function clock() {
    const text=new Date().toLocaleTimeString(bn()?'bn-BD':'en-GB',{timeZone:'Asia/Dhaka',hour12:false});
    document.querySelectorAll('.instrument-clock').forEach(el=>{el.textContent=text;});
  }
  function label(id) {const f=fields.find(f=>f[0]===id);return f ? f[bn()?2:1] : id;}
  function render() {
    const strip=$('#atlas-instruments'), desk=$('#atlas-national-data');
    if (!strip || !desk) return;
    strip.textContent=''; desk.textContent='';
    const make=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
    strip.append(make('time','', 'instrument-clock'));
    strip.append(make('small',tr('Dhaka · device clock','ঢাকা · যন্ত্রের ঘড়ি')));
    const note=make('p',tr('Bangladesh · national reference data. Annual statistics and daily FX retain their reporting dates.','বাংলাদেশ · জাতীয় তথ্যসূত্র। বার্ষিক পরিসংখ্যান ও দৈনিক বিনিময় হারের নিজস্ব তারিখ রয়েছে।'));
    desk.append(note);
    const localClock=make('p',tr('Device clock · Bangladesh: ','যন্ত্রের ঘড়ি · বাংলাদেশ: '));localClock.append(make('time','','instrument-clock'));desk.append(localClock);
    const rows=make('dl','');
    const fx=data?.currency;
    const show=(id,reading,isFx=false)=>{
      const dt=make('dt',isFx?tr('Daily reference FX · BDT per USD','দৈনিক তথ্যসূত্রের বিনিময় হার · প্রতি ডলারে টাকা'):label(id));
      const dd=make('dd','');
      const raw=isFx?reading?.rate:reading?.value;
      const shown=reading?.status==='ok' ? format(raw,isFx?'rate':reading.format) : null;
      const unit=isFx?'BDT/USD':reading?.unit;
      const unitText=bn()?({'USD':'মার্কিন ডলার','people':'জন','% GDP':'% জিডিপি','BDT/USD':'টাকা/ডলার'})[unit]||unit||'':unit||'';
      dd.append(make('strong',shown===null?tr('Unavailable','অনুপলব্ধ'):`${shown} ${unitText}`));
      const valid=shown!==null&&typeof reading?.period==='string';
      const period=make('small',valid?`${tr('Period','তথ্যকাল')}: ${reading.period} · ${tr('Retrieved','সংগৃহীত')}: ${reading.fetchedAt}`:`${reading?.reasonCode||'national-series-unavailable'} · ${data?.timestamp||new Date().toISOString()}`);
      period.setAttribute('data-language-fixed','');dd.append(period);
      if(valid && ['gdp','population'].includes(id)) {
        const s=make('span',`${label(id)} ${format(raw,reading.format,true)}${id==='gdp'?tr(' USD',' মার্কিন ডলার'):''} · ${reading.period}`,'atlas-instrument');
        strip.append(s);
      }
      const link=make('a',isFx?'Fawaz Ahmed Currency API · CC0':tr('World Bank WDI ↗','বিশ্বব্যাংক WDI ↗'));
      link.href=isFx?'https://github.com/fawazahmed0/exchange-api':`https://data.worldbank.org/indicator/${reading?.indicator||''}?locations=BD`;
      link.target='_blank';link.rel='noopener';dd.append(link);
      rows.append(dt,dd);
    };
    show('daily-fx',fx,true);
    fields.forEach(([id])=>show(id,data?.macro?.find(r=>r.id===id)));
    desk.append(rows);clock();
  }
  async function load() {
    try {
      const res=await fetch('/api/atlas/instruments',{signal:AbortSignal.timeout(20000)});
      const body=await res.json();
      if(!Array.isArray(body.macro)||!body.timestamp)throw Error('invalid-national-response');
      data=body;
    } catch {data={macro:[],timestamp:new Date().toISOString()};}
    render();
  }
  window.AtlasInstruments={format,start(){if(started)return;started=true;render();load();setInterval(clock,1000);setInterval(load,30*60*1000);window.addEventListener('atlas:language',render);}};
})();
