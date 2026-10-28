(function () {
  'use strict';
  let map, lens, data, index = 0, timer, generation = 0, watchWasOpen, priorMinZoom, focusedLens;
  const tr = (en,bn) => document.documentElement.lang === 'bn' ? bn : en;
  const panel = () => document.getElementById('forecast-player');
  const colors = ['#547076','#c5a56e','#dd4027','#8e4665'];
  const color = v => colors[v < 15 ? 0 : v < 35 ? 1 : v < 75 ? 2 : 3];

  function pause() {
    clearInterval(timer);
    timer = null;
    const b = document.getElementById('forecast-play');
    if (b) b.textContent = tr('Play','চালান');
  }

  function clear() {
    pause();
    hideOutlookHUD();
    for (const id of ['outlook-labels','outlook-cells']) if (map?.getLayer(id)) map.removeLayer(id);
    if (map?.getSource('outlook')) map.removeSource('outlook');
  }

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  const valueText = value => numeric(value) ? value.toFixed(1) : tr('Unavailable','অনুপলব্ধ');
  const dateText = time => time ? new Date(time).toLocaleDateString(document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB', {timeZone:'UTC',month:'short',day:'numeric'}) : tr('Unavailable','অনুপলব্ধ');

  function hideOutlookHUD() {
    const hud = document.getElementById('atlas-observation-hud');
    if (hud?.dataset?.owner === 'outlook') hud.hidden = true;
  }

  function inspectReach(e) {
    if (lens !== 'rivers' || !data || !e.features?.[0]) return;
    const id = e.features[0].properties.id;
    const c = data.frames[index].cells.find(c => c.id === id);
    const hud = document.getElementById('atlas-observation-hud');
    if (!c || !hud) return;
    const place = tr(c.place || '',c.place_bn || c.place || '');
    hud.dataset.owner = 'outlook';
    hud.hidden = false;
    hud.innerHTML = `<h3>${escape(place ? tr('Model reach near ','কাছাকাছি মডেল নদীখণ্ড: ') + place : tr('Model reach','মডেল নদীখণ্ড'))}</h3>
      <p>${escape(c.latitude.toFixed(3))}, ${escape(c.longitude.toFixed(3))}</p>
      <p>${tr('Modeled discharge','মডেল নদীপ্রবাহ')}: <strong>${valueText(c.value)} ${escape(data.unit)}</strong></p>
      <p>${tr('Valid model day (UTC)','কার্যকর মডেল দিন (UTC)')}: ${dateText(data.frames[index].validAt)}</p>
      <p>${tr('Ensemble middle 50%','এনসেম্বলের মধ্যবর্তী ৫০%')}: ${numeric(c.p25) && numeric(c.p75) ? `${c.p25.toFixed(1)}–${c.p75.toFixed(1)} ${escape(data.unit)}` : tr('Unavailable','অনুপলব্ধ')}</p>
      <p>${tr('Maximum in available daily series','উপলব্ধ দৈনিক সিরিজে সর্বোচ্চ')}: ${valueText(c.seriesMaximum)} ${escape(data.unit)} · ${dateText(c.seriesMaximumValidAt)}</p>
      <p>${tr('Station match, flood arrival and harvest guidance are unvalidated or unavailable.','স্টেশনের মিল যাচাই হয়নি; বন্যা আসার সময় ও কর্তন পরামর্শ অনুপলব্ধ।')}</p>
      <p>${escape(data.source)} · ${tr('Retrieved','সংগৃহীত')}: ${escape(data.fetchedAt)}</p>
      <button id="forecast-inspection-close" class="atlas-btn" type="button">${tr('Close','বন্ধ করুন')}</button>`;
    document.getElementById('forecast-inspection-close').onclick = () => {hud.hidden = true;};
  }

  function frame() {
    if (!data || !map) return;
    hideOutlookHUD();
    const f = data.frames[index], flood = lens === 'rivers';
    const isBn = document.documentElement.lang === 'bn';
    const features = f.cells.filter(c => numeric(c.value)).map(c => {
      const place = isBn ? c.place_bn || c.place : c.place;
      return {
        type:'Feature',
        properties:{id:c.id,value:c.value,color:flood ? '#547076' : color(c.value),label:flood && place ? `${tr('Near ','কাছে: ')}${place}: ${c.value.toFixed(1)}` : c.value.toFixed(1)},
        geometry:flood ? {type:'Point',coordinates:[c.longitude,c.latitude]} : {type:'Polygon',coordinates:[[[c.longitude-.2,c.latitude-.2],[c.longitude+.2,c.latitude-.2],[c.longitude+.2,c.latitude+.2],[c.longitude-.2,c.latitude+.2],[c.longitude-.2,c.latitude-.2]]]}
      };
    });
    const geo={type:'FeatureCollection',features};
    if (map.getSource('outlook')) map.getSource('outlook').setData(geo);
    else {
      map.addSource('outlook',{type:'geojson',data:geo,attribution:data.source});
      map.addLayer(flood ? {id:'outlook-cells',type:'circle',source:'outlook',paint:{'circle-radius':10,'circle-color':'#547076','circle-stroke-width':2,'circle-stroke-color':'#f5f0dc'}} : {id:'outlook-cells',type:'fill',source:'outlook',paint:{'fill-color':['get','color'],'fill-opacity':.6,'fill-outline-color':'#f5f0dc'}},map.getLayer('parliament-buildings') ? 'parliament-buildings' : 'city-buildings');
      map.addLayer({id:'outlook-labels',type:'symbol',source:'outlook',layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':13,'text-offset':[0,1.3]},paint:{'text-color':'#ffffff','text-halo-color':'#0d171d','text-halo-width':2}});
    }
    document.getElementById('forecast-time').textContent = flood
      ? `${dateText(f.validAt)} · ${tr('valid model day, UTC','কার্যকর মডেল দিন, UTC')}`
      : new Date(f.validAt).toLocaleString(isBn?'bn-BD':'en-GB',{timeZone:'Asia/Dhaka',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) + tr(' · valid time, Bangladesh',' · কার্যকর সময়, বাংলাদেশ');
    document.getElementById('forecast-range').value=index;
    const vals=f.cells.filter(c=>numeric(c.value)).map(c=>c.value);
    document.getElementById('forecast-values').textContent=vals.length ? `${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)} ${data.unit} · ${vals.length}/${f.cells.length} ${flood?tr('model reaches','মডেল নদীখণ্ড'):tr('model cells','মডেল সেল')}` : tr('No data for this frame','এই ধাপে তথ্য নেই');

    // Keep the decision qualification beside the play/scrub controls.
    // No value or absence of a value establishes safe farming conditions.
    const decision = document.getElementById('forecast-harvest-card');
    if (decision && flood) {
      decision.className='forecast-harvest-card';
      decision.textContent=tr('Warning thresholds, flood arrival and harvest guidance: unavailable.','বিপৎসীমা, বন্যা আসার সময় ও কর্তন পরামর্শ: অনুপলব্ধ।');
    }
    const list=document.getElementById('forecast-reaches');
    if (list && flood) {
      list.innerHTML=f.cells.map(c=>{
        const place=isBn ? c.place_bn || c.place : c.place;
        const context=place ? tr('Model reach near ','কাছাকাছি মডেল নদীখণ্ড: ')+place : tr('Model reach','মডেল নদীখণ্ড');
        const ensemble=numeric(c.p25)&&numeric(c.p75) ? `${c.p25.toFixed(1)}–${c.p75.toFixed(1)} ${escape(data.unit)}` : tr('Unavailable','অনুপলব্ধ');
        return `<div class="reach-row">
          <strong>${escape(context)}</strong>
          <span>${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}</span>
          <span>${tr('Selected day','নির্বাচিত দিন')}: ${valueText(c.value)} ${escape(data.unit)}</span>
          <span>${tr('Ensemble middle 50%','এনসেম্বলের মধ্যবর্তী ৫০%')}: ${ensemble}</span>
          <span>${tr('Available-series maximum','উপলব্ধ সিরিজে সর্বোচ্চ')}: ${valueText(c.seriesMaximum)} ${escape(data.unit)} · ${dateText(c.seriesMaximumValidAt)}</span>
          <small>${tr('Available days','উপলব্ধ দিন')}: ${c.usableDays ?? 0}/${c.totalDays ?? data.frames.length} · ${tr('station match unvalidated','স্টেশনের মিল যাচাই হয়নি')}</small>
        </div>`;
      }).join('');
    }
  }

  function render() {
    if (!data) return;
    const flood = lens === 'rivers', el = panel();
    el.innerHTML = `<h2>${flood ? tr('Northeast · river discharge','উত্তর-পূর্ব · নদীপ্রবাহ') : tr('Central Bangladesh · PM2.5','মধ্য বাংলাদেশ · পিএম২.৫')}</h2>
      <p>${flood ? tr('Daily modeled flow; not a flood-arrival or inundation forecast.','দৈনিক মডেলপ্রবাহ; বন্যা আসার সময় বা প্লাবনের পূর্বাভাস নয়।') : tr('CAMS global · ~45 km cells · modeled, not street measurements.','CAMS বৈশ্বিক · প্রায় ৪৫ কিমি সেল · মডেল, রাস্তার পরিমাপ নয়।')}</p>
      <output id="forecast-time"></output>
      <div class="forecast-controls">
        <button id="forecast-play" type="button">${tr('Play','চালান')}</button>
        <input id="forecast-range" aria-label="${tr('Forecast time','পূর্বাভাস এর সময়')}" type="range" min="0" max="${data.frames.length-1}" value="${index}">
        <button id="forecast-focus" type="button">${tr('Locate','অবস্থান')}</button>
      </div>
      <output id="forecast-values"></output>
      ${flood ? `<div id="forecast-harvest-card" class="forecast-harvest-card"></div>` : `<div class="forecast-scale">${['<15','15–35','35–75','≥75'].map((label,i)=>`<span style="--value-color:${colors[i]}">${label}</span>`).join('')} μg/m³</div>`}
      <details>
        <summary>${tr('Source, reaches & uncertainty','উৎস, নদীখণ্ড ও অনিশ্চয়তা')}</summary>
        <p><a href="${data.sourceUrl}" target="_blank" rel="noopener">${data.source}</a> · ${flood ? tr('~5 km, daily steps','প্রায় ৫ কিমি, দৈনিক ধাপ') : tr('native 3-hour steps; updates every 12 hours','মূল ধাপ ৩ ঘণ্টা; প্রতি ১২ ঘণ্টায় হালনাগাদ')}</p>
        <p>${tr('Retrieved','সংগৃহীত')}: ${data.fetchedAt}</p>
        <p>${tr('Model issue time not exposed. Local accuracy unvalidated. Missing cells are omitted.','মডেল প্রকাশের সময় দেওয়া হয়নি। স্থানীয় নির্ভুলতা যাচাই হয়নি। তথ্যহীন সেল বাদ দেওয়া হয়েছে।')}</p>
        ${flood ? `<p><strong>${tr('Why river discharge does not equal field inundation:','কেন নদীপ্রবাহ প্লাবনসীমার সমান নয়:')}</strong> ${tr('The largest modeled river within 5 km may be a different channel. Place names describe query context only. Local warning thresholds, crop stage, terrain and embankment conditions have not been validated. A daily series maximum does not establish flash-flood arrival.','৫ কিমির মধ্যে বৃহত্তম মডেল নদীটি ভিন্ন খালও হতে পারে। স্থানের নাম কেবল অনুসন্ধানের প্রেক্ষাপট। স্থানীয় বিপৎসীমা, ফসলের পরিপক্বতা, ভূমি ও বাঁধের অবস্থা যাচাই হয়নি। দৈনিক সিরিজের সর্বোচ্চ মান আকস্মিক বন্যার আগমন সময় প্রমাণ করে না।')}</p>
        <div id="forecast-reaches" class="forecast-reaches"></div>
        <a href="https://ffwc.gov.bd" target="_blank" rel="noopener">${tr('Official FFWC water level & warning bulletins ↗','সরকারি FFWC পানি সমতল ও সতর্কবার্তা ↗')}</a>` : ''}
      </details>`;

    document.getElementById('forecast-play').onclick = () => {
      if (timer) { pause(); return; }
      if (index === data.frames.length-1) index = 0;
      document.getElementById('forecast-play').textContent = tr('Pause','থামান');
      frame();
      timer = setInterval(() => {
        if (document.hidden) { pause(); return; }
        if (index >= data.frames.length-1) { pause(); return; }
        index++;
        frame();
      }, 1500);
    };

    document.getElementById('forecast-range').oninput = e => {
      pause();
      index = Number(e.target.value);
      frame();
    };

    document.getElementById('forecast-focus').onclick = focus;
    frame();
  }

  function focus() {
    map?.fitBounds(lens === 'rivers' ? [[91.05,24.65],[92.4,25.4]] : [[89.8,23],[91.4,25]], {
      padding: { top: 90, bottom: 230, left: 30, right: 30 },
      pitch: 0,
      bearing: 0,
      duration: 0
    });
  }

  async function activate(next) {
    if (!map) { lens = next; return; }
    if (next === lens && data) { pause(); render(); return; }
    lens = next;
    const token = ++generation;
    clear();
    data = null;
    panel().hidden = !['air','rivers'].includes(next);

    const watch = document.getElementById('atlas-watch-shell');
    if (panel().hidden) {
      focusedLens = undefined;
      if (priorMinZoom !== undefined) { map.setMinZoom(priorMinZoom); priorMinZoom = undefined; }
      if (watch && watchWasOpen !== undefined) watch.open = watchWasOpen;
      watchWasOpen = undefined;
      return;
    }

    if (priorMinZoom === undefined) {
      priorMinZoom = map.getMinZoom();
      map.setMinZoom(6);
    }
    if (watch && watchWasOpen === undefined) {
      watchWasOpen = watch.open;
      watch.open = false;
    }

    panel().innerHTML = `<p role="status">${tr('Loading model outlook…','মডেলের পূর্বাভাস আসছে…')}</p>`;
    try {
      const res = await fetch(`/api/atlas/outlook?kind=${next === 'air' ? 'air' : 'flood'}`, { signal: AbortSignal.timeout(25000) });
      const result = await res.json();
      if (!res.ok || result.status !== 'ok' || !result.frames?.length) throw new Error(result.reasonCode || 'outlook-unavailable');
      if (token !== generation) return;
      data = result;
      index = 0;
      render();
      if (focusedLens !== next) {
        focus();
        focusedLens = next;
      }
    } catch {
      if (token !== generation) return;
      panel().innerHTML = `<p role="status">${tr('Outlook unavailable. No forecast is drawn.','পূর্বাভাস অনুপলব্ধ। কোনো পূর্বাভাস আঁকা হয়নি।')}</p><p data-language-fixed>${new Date().toISOString()} · model-provider-or-valid-horizon-unavailable</p><button id="forecast-retry">${tr('Retry','আবার চেষ্টা')}</button>`;
      document.getElementById('forecast-retry').onclick = () => activate(lens);
    }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('atlas:language', () => { pause(); if (data) render(); });
  window.AtlasForecast = {
    attach(m) {
      map = m;
      map.on?.('click', 'outlook-cells', inspectReach);
      const watch = document.getElementById("atlas-watch");
      if (watch) {
        new ResizeObserver(() => {
          panel().style.bottom = `${watch.getBoundingClientRect().height + 34}px`;
        }).observe(watch);
      }
      if (lens) activate(lens);
    },
    activate
  };
})();
