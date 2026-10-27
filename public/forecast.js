(function () {
  'use strict';
  let map, lens, data, index = 0, timer, generation = 0, watchWasOpen, priorMinZoom, focusedLens;
  const tr = (en,bn) => document.documentElement.lang === 'bn' ? bn : en;
  const panel = () => document.getElementById('forecast-player');
  const colors = ['#547076','#c5a56e','#dd4027','#8e4665'];
  const color = v => colors[v < 15 ? 0 : v < 35 ? 1 : v < 75 ? 2 : 3];
  function pause() { clearInterval(timer); timer = null; const b = document.getElementById('forecast-play'); if (b) b.textContent = tr('Play','চালান'); }
  function clear() { pause(); for (const id of ['outlook-labels','outlook-cells']) if (map?.getLayer(id)) map.removeLayer(id); if (map?.getSource('outlook')) map.removeSource('outlook'); }
  function frame() {
    if (!data || !map) return;
    const f = data.frames[index], flood = lens === 'rivers';
    const features = f.cells.filter(c => c.value !== null).map(c => ({type:'Feature',properties:{value:c.value,color:color(c.value),label:`${c.value.toFixed(1)}${flood ? '' : ''}`},geometry:flood ? {type:'Point',coordinates:[c.longitude,c.latitude]} : {type:'Polygon',coordinates:[[[c.longitude-.2,c.latitude-.2],[c.longitude+.2,c.latitude-.2],[c.longitude+.2,c.latitude+.2],[c.longitude-.2,c.latitude+.2],[c.longitude-.2,c.latitude-.2]]]}}));
    const geo = {type:'FeatureCollection',features};
    if (map.getSource('outlook')) map.getSource('outlook').setData(geo);
    else {
      map.addSource('outlook',{type:'geojson',data:geo,attribution:data.source});
      map.addLayer(flood ? {id:'outlook-cells',type:'circle',source:'outlook',paint:{'circle-radius':9,'circle-color':'#547076','circle-stroke-width':2,'circle-stroke-color':'#ffefae'}} : {id:'outlook-cells',type:'fill',source:'outlook',paint:{'fill-color':['get','color'],'fill-opacity':.6,'fill-outline-color':'#f5f0dc'}}, map.getLayer('parliament-buildings') ? 'parliament-buildings' : 'city-buildings');
      map.addLayer({id:'outlook-labels',type:'symbol',source:'outlook',layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':14,'text-offset':[0,1.3]},paint:{'text-color':'#ffffff','text-halo-color':'#0d171d','text-halo-width':2}});
    }
    document.getElementById('forecast-time').textContent = new Date(f.validAt).toLocaleString(document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB',{timeZone:'Asia/Dhaka',month:'short',day:'numeric',hour:flood ? undefined : '2-digit',minute:flood ? undefined : '2-digit'}) + tr(' · valid time, Bangladesh',' · কার্যকর সময়, বাংলাদেশ');
    document.getElementById('forecast-range').value = index;
    const vals = f.cells.filter(c => c.value !== null).map(c => c.value);
    document.getElementById('forecast-values').textContent = vals.length ? `${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)} ${data.unit} · ${vals.length}/${f.cells.length} ${tr('model cells','মডেল সেল')}` : tr('No data for this frame','এই ধাপে তথ্য নেই');
    const list = document.getElementById('forecast-reaches');
    if (list) list.textContent = f.cells.map(c => `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}: ${c.value === null ? tr('unavailable','অনুপলব্ধ') : c.value.toFixed(1)} ${data.unit} · ${tr('ensemble middle 50%','এনসেম্বলের মধ্যবর্তী ৫০%')}: ${c.p25 === null || c.p75 === null ? tr('unavailable','অনুপলব্ধ') : `${c.p25.toFixed(1)}–${c.p75.toFixed(1)}`}`).join('\n');
  }
  function render() {
    if (!data) return;
    const flood = lens === 'rivers', el = panel();
    el.innerHTML = `<h2>${flood ? tr('Northeast · river discharge','উত্তর-পূর্ব · নদীপ্রবাহ') : tr('Central Bangladesh · PM2.5','মধ্য বাংলাদেশ · পিএম২.৫')}</h2>
      <p>${flood ? tr('Modeled reaches, not flood extent or flash-flood arrival.','মডেল নদীখণ্ড; প্লাবনসীমা বা আকস্মিক বন্যা আসার সময় নয়।') : tr('CAMS global · ~45 km cells · modeled, not street measurements.','CAMS বৈশ্বিক · প্রায় ৪৫ কিমি সেল · মডেল, রাস্তার পরিমাপ নয়।')}</p>
      <output id="forecast-time"></output><div class="forecast-controls"><button id="forecast-play" type="button">${tr('Play','চালান')}</button><input id="forecast-range" aria-label="${tr('Forecast time','পূর্বাভাসের সময়')}" type="range" min="0" max="${data.frames.length-1}" value="${index}"><button id="forecast-focus" type="button">${tr('Locate','অবস্থান')}</button></div>
      <output id="forecast-values"></output>${flood ? '' : `<div class="forecast-scale">${['<15','15–35','35–75','≥75'].map((label,i)=>`<span style="--value-color:${colors[i]}">${label}</span>`).join('')} μg/m³</div>`}
      <details><summary>${tr('Source & uncertainty','উৎস ও অনিশ্চয়তা')}</summary><p><a href="${data.sourceUrl}" target="_blank" rel="noopener">${data.source}</a> · ${flood ? tr('~5 km, daily steps','প্রায় ৫ কিমি, দৈনিক ধাপ') : tr('native 3-hour steps; updates every 12 hours','মূল ধাপ ৩ ঘণ্টা; প্রতি ১২ ঘণ্টায় হালনাগাদ')}</p><p>${tr('Retrieved','সংগৃহীত')}: ${data.fetchedAt}</p><p>${tr('Model issue time not exposed. Local accuracy unvalidated. Missing cells are omitted.','মডেল প্রকাশের সময় দেওয়া হয়নি। স্থানীয় নির্ভুলতা যাচাই হয়নি। তথ্যহীন সেল বাদ দেওয়া হয়েছে।')}</p>${flood ? `<p>${tr('Largest river within 5 km of each query; reaches are not validated against warning stations. Daily UTC model values, not danger levels in metres.','প্রতি অনুসন্ধানের ৫ কিমির মধ্যে বৃহত্তম নদী; সতর্কতা কেন্দ্রের সঙ্গে নদীখণ্ড যাচাই হয়নি। দৈনিক UTC মডেলপ্রবাহ, মিটারে বিপৎসীমা নয়।')}</p><pre id="forecast-reaches" class="forecast-reaches"></pre><a href="https://ffwc.gov.bd" target="_blank" rel="noopener">${tr('Official FFWC warnings ↗','সরকারি FFWC সতর্কতা ↗')}</a>` : ''}</details>`;
    document.getElementById('forecast-play').onclick = () => {
      if (timer) { pause(); return; }
      if (index === data.frames.length-1) index = 0;
      document.getElementById('forecast-play').textContent = tr('Pause','থামান');
      frame(); timer = setInterval(() => { if (document.hidden) { pause(); return; } if (index >= data.frames.length-1) { pause(); return; } index++; frame(); }, 1500);
    };
    document.getElementById('forecast-range').oninput = e => { pause(); index = Number(e.target.value); frame(); };
    document.getElementById('forecast-focus').onclick = focus;
    frame();
  }
  function focus() { map?.fitBounds(lens === 'rivers' ? [[91.05,24.65],[92.4,25.4]] : [[89.8,23],[91.4,25]],{padding:{top:90,bottom:230,left:30,right:30},pitch:0,bearing:0,duration:0}); }
  async function activate(next) {
    if (!map) { lens = next; return; }
    if (next === lens && data) { pause(); render(); return; }
    lens = next; const token = ++generation;
    clear(); data = null; panel().hidden = !['air','rivers'].includes(next);
    const watch = document.getElementById('atlas-watch-shell');
    if (panel().hidden) { focusedLens = undefined; if (priorMinZoom !== undefined) { map.setMinZoom(priorMinZoom); priorMinZoom = undefined; } if (watch && watchWasOpen !== undefined) watch.open = watchWasOpen; watchWasOpen = undefined; return; }
    if (priorMinZoom === undefined) { priorMinZoom = map.getMinZoom(); map.setMinZoom(6); }
    if (watch && watchWasOpen === undefined) { watchWasOpen = watch.open; watch.open = false; }
    panel().innerHTML = `<p role="status">${tr('Loading model outlook…','মডেলের পূর্বাভাস আসছে…')}</p>`;
    try {
      const res = await fetch(`/api/atlas/outlook?kind=${next === 'air' ? 'air' : 'flood'}`,{signal:AbortSignal.timeout(25000)});
      const result = await res.json();
      if (!res.ok || result.status !== 'ok' || !result.frames?.length) throw new Error(result.reasonCode || 'outlook-unavailable');
      if (token !== generation) return;
      data = result; index = 0; render(); if (focusedLens !== next) { focus(); focusedLens = next; }
    } catch {
      if (token !== generation) return;
      panel().innerHTML = `<p role="status">${tr('Outlook unavailable. No forecast is drawn.','পূর্বাভাস অনুপলব্ধ। কোনো পূর্বাভাস আঁকা হয়নি।')}</p><p>${new Date().toISOString()} · model-provider-or-valid-horizon-unavailable</p><button id="forecast-retry">${tr('Retry','আবার চেষ্টা')}</button>`;
      document.getElementById('forecast-retry').onclick = () => activate(lens);
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('atlas:language', () => { pause(); if (data) render(); });
  window.AtlasForecast = {attach(m) { map = m; const watch = document.getElementById("atlas-watch"); if (watch) new ResizeObserver(() => { panel().style.bottom = `${watch.getBoundingClientRect().height + 34}px`; }).observe(watch); if (lens) activate(lens); }, activate};
})();
