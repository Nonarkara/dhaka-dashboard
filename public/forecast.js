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
    for (const id of ['outlook-labels','outlook-cells']) if (map?.getLayer(id)) map.removeLayer(id);
    if (map?.getSource('outlook')) map.removeSource('outlook');
  }

  function frame() {
    if (!data || !map) return;
    const f = data.frames[index], flood = lens === 'rivers';
    const isBn = document.documentElement.lang === 'bn';

    const features = f.cells.filter(c => c.value !== null).map(c => {
      const risk = c.riskLevel || (c.value < 15 ? 'normal' : c.value < 35 ? 'watch' : 'alert');
      const pointColor = flood ? (risk === 'alert' ? '#dd4027' : (risk === 'watch' ? '#c5a56e' : '#547076')) : color(c.value);
      const stName = isBn ? (c.station_bn || c.station || '') : (c.station || '');
      const lbl = flood ? (stName ? `${stName.split('/')[0].trim()}: ${c.value.toFixed(1)}` : `${c.value.toFixed(1)}`) : `${c.value.toFixed(1)}`;
      return {
        type: 'Feature',
        properties: {
          value: c.value,
          color: pointColor,
          label: lbl,
          station: stName,
          river: isBn ? (c.river_bn || c.river || '') : (c.river || ''),
          haor: isBn ? (c.haor_bn || c.haor || '') : (c.haor || ''),
          riskLevel: risk,
          p25: c.p25,
          p75: c.p75,
          peakValue: c.peakValue,
          peakTime: c.peakTime,
          peakLeadDays: c.peakLeadDays,
          peakLeadHours: c.peakLeadHours,
          advisory: isBn ? (c.harvestAdvisory_bn || c.harvestAdvisory || '') : (c.harvestAdvisory || ''),
        },
        geometry: flood
          ? { type: 'Point', coordinates: [c.longitude, c.latitude] }
          : { type: 'Polygon', coordinates: [[[c.longitude-.2,c.latitude-.2],[c.longitude+.2,c.latitude-.2],[c.longitude+.2,c.latitude+.2],[c.longitude-.2,c.latitude+.2],[c.longitude-.2,c.latitude-.2]]] }
      };
    });

    const geo = { type: 'FeatureCollection', features };
    if (map.getSource('outlook')) {
      map.getSource('outlook').setData(geo);
    } else {
      map.addSource('outlook', { type: 'geojson', data: geo, attribution: data.source });
      map.addLayer(
        flood
          ? { id: 'outlook-cells', type: 'circle', source: 'outlook', paint: { 'circle-radius': 10, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#f5f0dc' } }
          : { id: 'outlook-cells', type: 'fill', source: 'outlook', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': .6, 'fill-outline-color': '#f5f0dc' } },
        map.getLayer('parliament-buildings') ? 'parliament-buildings' : 'city-buildings'
      );
      map.addLayer({
        id: 'outlook-labels',
        type: 'symbol',
        source: 'outlook',
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 13, 'text-offset': [0, 1.3] },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#0d171d', 'text-halo-width': 2 }
      });

      if (map.on) {
        map.on('click', 'outlook-cells', (e) => {
          if (lens !== 'rivers' || !e.features?.[0]) return;
          const props = e.features[0].properties;
          const hud = document.getElementById('atlas-observation-hud');
          if (hud) {
            hud.hidden = false;
            hud.innerHTML = `<h3>${props.station || 'Reach'} · ${props.river || ''}</h3>
              <p style="margin:2px 0;font-size:12px;color:var(--dim);">${props.haor || ''}</p>
              <div style="margin:6px 0;"><strong>${tr('Current flow:','বর্তমান প্রবাহ:')}</strong> ${props.value} ${data.unit}</div>
              ${props.p25 && props.p75 ? `<div style="font-size:12px;color:var(--dim);">${tr('Ensemble middle 50%:','এনসেম্বল ৫০%:')} ${props.p25}–${props.p75} ${data.unit}</div>` : ''}
              ${props.peakTime ? `<div style="margin:6px 0;padding:6px;background:var(--bg-strong);border-left:2px solid ${props.color}"><strong>${tr('Peak surge:','সর্বোচ্চ ঢল:')}</strong> ${props.peakValue} ${data.unit} (+${props.peakLeadHours}${tr('h lead time',' ঘণ্টা পূর্বে')})</div>` : ''}
              <div style="margin-top:6px;font-size:12px;"><strong>${tr('Harvest guidance:','ধান কর্তন পরামর্শ:')}</strong> ${props.advisory || ''}</div>
              <button type="button" class="atlas-btn" style="margin-top:8px;width:100%;" onclick="document.getElementById('atlas-observation-hud').hidden=true">${tr('Close','বন্ধ করুন')}</button>`;
          }
        });
      }
    }

    const validDate = new Date(f.validAt);
    document.getElementById('forecast-time').textContent = validDate.toLocaleString(
      isBn ? 'bn-BD' : 'en-GB',
      { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: flood ? undefined : '2-digit', minute: flood ? undefined : '2-digit' }
    ) + tr(' · valid time, Bangladesh',' · কার্যকর সময়, বাংলাদেশ');
    document.getElementById('forecast-range').value = index;

    const vals = f.cells.filter(c => c.value !== null).map(c => c.value);
    document.getElementById('forecast-values').textContent = vals.length
      ? `${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)} ${data.unit} · ${vals.length}/${f.cells.length} ${tr('model reaches','মডেল নদীখণ্ড')}`
      : tr('No data for this frame','এই ধাপে তথ্য নেই');

    // Agricultural Harvest Advisory Card
    const harvestCard = document.getElementById('forecast-harvest-card');
    if (harvestCard && flood) {
      const activeCells = f.cells.filter(c => c.value !== null);
      const hasAlert = activeCells.some(c => c.riskLevel === 'alert');
      const hasWatch = activeCells.some(c => c.riskLevel === 'watch');
      const overallRisk = hasAlert ? 'alert' : (hasWatch ? 'watch' : 'normal');

      const riskBadge = overallRisk === 'alert'
        ? tr('SURGE ALERT · EMERGENCY HARVEST','ঢল সতর্কতা · দ্রুত কর্তন')
        : (overallRisk === 'watch' ? tr('FLOOD WATCH · PREPARE HARVESTERS','বন্যা সতর্কতা · হারভেস্টার প্রস্তুতি') : tr('NORMAL FLOW · DEFER HARVEST','স্বাভাবিক প্রবাহ · অকাল কর্তন পরিহার'));

      const advice = overallRisk === 'alert'
        ? tr('Peak surge approaching in <72h. Department of Agricultural Extension (DAE) advises harvesting all Boro paddy ≥80% ripe immediately to avert total crop loss from overtopping dykes.', '৭২ ঘণ্টার মধ্যে পাহাড়ি ঢল আসার সম্ভাবনা। বাঁধ উপচে ফসলহানি রোধে কৃষি সম্প্রসারণ অধিদপ্তর (DAE) ৮০% পাকা বোরো ধান অবিলম্বে কেটে ফেলার পরামর্শ দিচ্ছে।')
        : (overallRisk === 'watch'
          ? tr('Discharge rising towards bankfull. Mobilize combine harvesters and labor. Track upstream Cherrapunji rainfall.', 'নদীপ্রবাহ ডুবন্ত বাঁধের ধারণক্ষমতার দিকে বাড়ছে। কম্বাইন হারভেস্টার ও কৃষি শ্রমিক প্রস্তুত রাখুন। চেরাপুঞ্জির বৃষ্টিপাত পর্যবেক্ষণ করুন।')
          : tr('River discharge is within safe seasonal limits. Defer harvesting to allow 100% full ripening and optimal grain yield.', 'নদীপ্রবাহ নিরাপদ মৌসুমি সীমার মধ্যে রয়েছে। পূর্ণ ফলনের জন্য অপরিপক্ব ধান না কেটে ১০০% পাকার সুযোগ দিন।'));

      harvestCard.className = `forecast-harvest-card harvest-${overallRisk}`;
      harvestCard.innerHTML = `<div class="harvest-badge">${riskBadge}</div><div class="harvest-advisory">${advice}</div>`;
    }

    // Detailed reaches list
    const list = document.getElementById('forecast-reaches');
    if (list) {
      if (flood) {
        list.innerHTML = f.cells.map(c => {
          const stName = isBn ? (c.station_bn || c.station || `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}`) : (c.station || `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}`);
          const riverName = isBn ? (c.river_bn || c.river || '') : (c.river || '');
          const haorName = isBn ? (c.haor_bn || c.haor || '') : (c.haor || '');
          const valText = c.value !== null ? `${c.value.toFixed(1)} ${data.unit}` : tr('unavailable','অনুপলব্ধ');
          const ensText = c.p25 !== null && c.p75 !== null ? `${c.p25.toFixed(1)}–${c.p75.toFixed(1)} ${data.unit}` : tr('unavailable','অনুপলব্ধ');
          const riskText = c.riskLevel === 'alert' ? tr('Alert','সতর্কতা') : (c.riskLevel === 'watch' ? tr('Watch','নজরদারি') : tr('Normal','স্বাভাবিক'));
          const peakText = c.peakTime
            ? (isBn ? `সর্বোচ্চ ঢল: ${c.peakValue?.toFixed(1)} ${data.unit} (${new Date(c.peakTime).toLocaleDateString('bn-BD', {month:'short', day:'numeric'})}, +${c.peakLeadHours}ঘণ্টা)`
                    : `Peak flow: ${c.peakValue?.toFixed(1)} ${data.unit} (${new Date(c.peakTime).toLocaleDateString('en-GB', {month:'short', day:'numeric'})}, +${c.peakLeadHours}h)`)
            : '';
          return `<div class="reach-row">
            <div class="reach-header"><strong>${stName}</strong> <span class="reach-river">· ${riverName}</span> <span class="reach-badge reach-${c.riskLevel || 'normal'}">${riskText}</span></div>
            ${haorName ? `<div class="reach-haor">${haorName}</div>` : ''}
            <div class="reach-metrics">
              <span>${tr('Current flow','বর্তমান প্রবাহ')}: <strong>${valText}</strong></span>
              <span>${tr('Ensemble 50%','এনসেম্বল ৫০%')}: ${ensText}</span>
            </div>
            ${peakText ? `<div class="reach-peak">${peakText}</div>` : ''}
          </div>`;
        }).join('');
      } else {
        list.textContent = f.cells.map(c => `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}: ${c.value === null ? tr('unavailable','অনুপলব্ধ') : c.value.toFixed(1)} ${data.unit} · ${tr('ensemble middle 50%','এনসেম্বলের মধ্যবর্তী ৫০%')}: ${c.p25 === null || c.p75 === null ? tr('unavailable','অনুপলব্ধ') : `${c.p25.toFixed(1)}–${c.p75.toFixed(1)}`}`).join('\n');
      }
    }
  }

  function render() {
    if (!data) return;
    const flood = lens === 'rivers', el = panel();
    el.innerHTML = `<h2>${flood ? tr('Northeast · river discharge & harvest advisory','উত্তর-পূর্ব · নদীপ্রবাহ ও ধান কর্তন পরামর্শ') : tr('Central Bangladesh · PM2.5','মধ্য বাংলাদেশ · পিএম২.৫')}</h2>
      <p>${flood ? tr('Modeled reaches with arrival time and Boro crop harvest guidance.','নদীখণ্ডের আগমন সময় ও হাওর বোরো ধান কর্তনের সিদ্ধান্ত সহায়তা।') : tr('CAMS global · ~45 km cells · modeled, not street measurements.','CAMS বৈশ্বিক · প্রায় ৪৫ কিমি সেল · মডেল, রাস্তার পরিমাপ নয়।')}</p>
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
        ${flood ? `<p><strong>${tr('Why river discharge does not equal field inundation:','কেন নদীপ্রবাহ প্লাবনসীমার সমান নয়:')}</strong> ${tr('Discharge (m³/s) models upstream surge volume and peak arrival time. Farmland inundation depends on BWDB submersible dykes (ডুবন্ত বাঁধ) and field elevation. When flow exceeds bankfull, dykes risk overtopping.','নদীপ্রবাহ (মি³/সেকেন্ড) উজানের পানির পরিমাণ ও ঢল আসার সময় নির্দেশ করে। নির্দিষ্ট ফসলি জমি প্লাবিত হবে কিনা তা নির্ভর করে স্থানীয় ডুবন্ত বাঁধের উচ্চতা ও জমির উচ্চতার ওপর। প্রবাহ ধারণক্ষমতা ছাড়িয়ে গেলে বাঁধ উপচে হাওরে পানি প্রবেশ করে।')}</p>
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
      panel().innerHTML = `<p role="status">${tr('Outlook unavailable. No forecast is drawn.','পূর্বাভাস অনুপলব্ধ। কোনো পূর্বাভাস আঁকা হয়নি।')}</p><p>${new Date().toISOString()} · model-provider-or-valid-horizon-unavailable</p><button id="forecast-retry">${tr('Retry','আবার চেষ্টা')}</button>`;
      document.getElementById('forecast-retry').onclick = () => activate(lens);
    }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('atlas:language', () => { pause(); if (data) render(); });
  window.AtlasForecast = {
    attach(m) {
      map = m;
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
