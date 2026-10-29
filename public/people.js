(function () {
  'use strict';
  let map, active = false, data, pending, generation = 0, selected, filterValue = 'all';
  const ids = ['people-cells', 'people-borders', 'people-facilities'];
  const tr = (en, bn) => document.documentElement.lang === 'bn' ? bn : en;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel = () => document.getElementById('people-key');
  const hud = () => document.getElementById('atlas-observation-hud');
  const number = v => new Intl.NumberFormat(document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB', {maximumFractionDigits: 0}).format(v);
  const population = v => v === null ? tr('Unknown', 'অজানা') : v === 0 ? number(0) : v < 10 ? tr('<10', '<১০') : '≈' + number(Math.round(v / 10) * 10);
  const label = kind => ({school: tr('School object', 'স্কুলের চিহ্ন'), hospital: tr('Hospital object', 'হাসপাতালের চিহ্ন'), clinic: tr('Clinic object', 'ক্লিনিকের চিহ্ন')})[kind];
  function hideSelection() {
    hud()?.classList.remove('people-inspection');
    if (hud()?.dataset.owner === 'people') hud().hidden = true;
    selected = null;
  }
  function inspect(properties) {
    if (!active || !data || !hud()) return;
    selected = properties;
    if (panel()) panel().open = false;
    const h = hud(), m = data.manifest;
    h.dataset.owner = 'people'; h.hidden = false; h.classList.add('people-inspection');
    let content;
    if (properties.osmId) {
      const p = properties;
      content = `<h3>${esc(tr(p.name || label(p.kind), p.name_bn || p.name || label(p.kind)))}</h3><p>${esc(label(p.kind))} · ${esc(p.osmId)}</p>
        <p>${esc(p.osmId.startsWith('node/') ? tr('Mapped point', 'মানচিত্রে চিহ্নিত বিন্দু') : tr('Object bounding-box centre', 'বস্তুর সীমার কেন্দ্র'))}</p>
        <a href="https://www.openstreetmap.org/${esc(p.osmId)}" target="_blank" rel="noopener">${tr('View source object', 'উৎস বস্তু দেখুন')} ↗</a>`;
    } else {
      const row = data.grid.cells.find(c => c[0] === properties.id);
      if (!row) return;
      const share = row[4] ? Math.round(row[3] / row[4] * 100) : null;
      content = `<h3>${tr('2025 population model', '২০২৫ জনসংখ্যা মডেল')}</h3><p><strong>${population(row[2])}</strong> ${tr('people in valid pixels', 'বৈধ পিক্সেলে মানুষ')}</p>
        <p>${tr('1 km² cell', '১ বর্গকিমি সেল')} · ${esc(row[0])}<br>${tr('Valid model pixels', 'বৈধ মডেল পিক্সেল')}: ${number(row[3])}/${number(row[4])}${share === null ? '' : ` (${number(share)}%)`}</p>
        <p>${tr('Mapped objects', 'মানচিত্রের চিহ্ন')}: ${tr('schools', 'স্কুল')} ${number(row[5])} · ${tr('hospitals', 'হাসপাতাল')} ${number(row[6])} · ${tr('clinics', 'ক্লিনিক')} ${number(row[7])}</p>
        <p>${tr('Sum of native pixel estimates. Missing pixels stay unknown; pixel coverage is not accuracy. This is not a census or current resident count.', 'মূল পিক্সেলের অনুমানের যোগফল। অনুপস্থিত পিক্সেল অজানা থাকে; পিক্সেলের আওতা নির্ভুলতা নয়। এটি জনগণনা বা বর্তমান বাসিন্দার সংখ্যা নয়।')}</p>
        <a href="https://doi.org/${esc(m.population.doi)}" target="_blank" rel="noopener">WorldPop 2025 · CC BY 4.0 ↗</a>`;
      const objects = data.facilities.features.filter(f => f.properties.cell === row[0]);
      if (objects.length) content += `<label>${tr('Inspect mapped object', 'মানচিত্রের চিহ্ন দেখুন')} <select id="people-object"><option value="">${tr('Choose', 'বাছুন')}</option>${objects.map(f => `<option value="${esc(f.properties.osmId)}">${esc(tr(f.properties.name || label(f.properties.kind), f.properties.name_bn || f.properties.name || label(f.properties.kind)))} · ${esc(f.properties.osmId)}</option>`).join('')}</select></label>`;
    }
    h.innerHTML = `<button type="button" class="atlas-btn" id="people-close">${tr('Close', 'বন্ধ করুন')}</button>${content}<button type="button" class="atlas-btn" id="people-focus">${tr('Show on map', 'মানচিত্রে দেখুন')}</button><p>OSM · ${esc(m.facilities.observedAt.slice(0, 10))}<br>${tr('Mapping may be incomplete or duplicate campuses. No capacity or opening-status data.', 'মানচিত্র অসম্পূর্ণ হতে পারে বা একই ক্যাম্পাস একাধিকবার থাকতে পারে। ধারণক্ষমতা বা খোলা থাকার তথ্য নেই।')}</p>`;
    document.getElementById('people-close').onclick = hideSelection;
    document.getElementById('people-focus').onclick = () => {
      const object = properties.osmId && data.facilities.features.find(f => f.properties.osmId === properties.osmId);
      const row = !object && data.grid.cells.find(c => c[0] === properties.id);
      const centre = object ? object.geometry.coordinates : row?.[1].reduce((sum, point) => [sum[0]+point[0]/4,sum[1]+point[1]/4], [0,0]);
      if (centre) map.flyTo({center:centre,zoom:14.2,offset:map.getContainer().clientWidth<600 ? [0,150] : [0,0],duration:0});
    };
    const selector = document.getElementById('people-object');
    if (selector) selector.onchange = e => {const object = data.facilities.features.find(f => f.properties.osmId === e.target.value); if (object) inspect(object.properties);};
  }
  function filter() {
    if (!map?.getLayer('people-facilities')) return;
    const value = filterValue;
    map.setFilter('people-facilities', value === 'all' ? null : ['==', ['get', 'kind'], value]);
  }
  function render() {
    const p = panel(); if (!p) return;
    p.hidden = !active;
    if (!active) return;
    p.innerHTML = `<summary>${tr('People & facilities', 'মানুষ ও সেবা প্রতিষ্ঠান')}</summary><div class="people-key-body">
      <strong>${tr('WorldPop 2025 · model / 1 km²', 'WorldPop ২০২৫ · মডেল / ১ বর্গকিমি')}</strong>
      <span id="people-status" role="status" ${data ? 'hidden' : ''}>${data ? '' : tr('Loading reference layers…', 'তথ্যসূত্র স্তর লোড হচ্ছে…')}</span><button type="button" class="atlas-btn" id="people-retry" hidden>${tr('Retry', 'আবার চেষ্টা করুন')}</button>
      <div class="people-scale"><small>${tr('People (000s)','হাজার মানুষ')}</small><span>${tr('0–5','০–৫')}</span><span>${tr('5–20','৫–২০')}</span><span>${tr('20–50','২০–৫০')}</span><span>${tr('≥50','≥৫০')}</span></div>
      <span>${tr('Valid pixels only; unfilled is unknown.', 'শুধু বৈধ পিক্সেল; রংহীন অংশ অজানা।')}</span>
      <label>${tr('Mapped objects', 'মানচিত্রের চিহ্ন')} <select id="people-filter" ${map?.getLayer('people-cells') ? '' : 'disabled'}><option value="all">${tr('All', 'সব')}</option><option value="school">${tr('Schools', 'স্কুল')}</option><option value="hospital">${tr('Hospitals', 'হাসপাতাল')}</option><option value="clinic">${tr('Clinics', 'ক্লিনিক')}</option></select></label>
      <span class="people-symbols">${tr('Zoom in:', 'জুম করুন:')} <i class="people-school"></i>${tr('School', 'স্কুল')} · <i class="people-health"></i>${tr('Hospital / clinic', 'হাসপাতাল / ক্লিনিক')}</span>
      <label>${tr('Inspect cell', 'সেল দেখুন')} <select id="people-cell" ${map?.getLayer('people-cells') ? '' : 'disabled'}><option value="">${tr('Choose', 'বাছুন')}</option><option value="centre">${tr('Map centre', 'মানচিত্রের কেন্দ্র')}</option>${(data?.grid.cells || []).map(c => `<option value="${c[0]}">${c[0]} · ${esc(population(c[2]))}</option>`).join('')}</select></label>
      <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ${esc(data?.manifest.facilities.observedAt.slice(0, 10) || '…')}</span>
      <span>${tr('Capacity unknown; campuses may repeat.', 'ধারণক্ষমতা অজানা; একই ক্যাম্পাস বারবার থাকতে পারে।')}</span>
      </div>`;
    document.getElementById('people-filter').value = filterValue;
    document.getElementById('people-filter').onchange = e => {filterValue = e.target.value; filter();};
    document.getElementById('people-cell').onchange = e => {
      if (!map?.getLayer('people-cells')) return;
      if (e.target.value === 'centre') {
        const point = map.project(map.getCenter());
        const hit = map.queryRenderedFeatures(point, {layers:['people-cells']})[0];
        if (hit) inspect(hit.properties);
        else {const status=document.getElementById('people-status');status.hidden=false;status.textContent=tr('Map centre is outside this reference grid.', 'মানচিত্রের কেন্দ্র এই তথ্যসূত্র গ্রিডের বাইরে।');}
      } else if (e.target.value) inspect({id: e.target.value});
    };
    document.getElementById('people-retry').onclick = () => activate('people');
    filter();
  }
  async function fetchJSON(url) {
    const r = await fetch(url); if (!r.ok) throw Error(`HTTP ${r.status}`); return r.json();
  }
  async function load() {
    if (!pending) pending = (async () => {
      const manifest = await fetchJSON('/api/atlas/people');
      const [grid, facilities] = await Promise.all(['people-grid.json', 'facilities.geojson'].map(async name => {
        const asset = manifest.assets[name], response = await fetch(asset.url + '?v=' + asset.sha256);
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
        if (digest !== asset.sha256) throw Error('Reference asset hash mismatch');
        return JSON.parse(new TextDecoder().decode(bytes));
      }));
      if (!Array.isArray(grid.cells) || !grid.cells.length || facilities.type !== 'FeatureCollection' || !Array.isArray(facilities.features) || !manifest.population?.year || !manifest.facilities?.observedAt) throw Error('Invalid reference data');
      data = {manifest, grid, facilities}; return data;
    })().catch(error => {pending = null; throw error;});
    return pending;
  }
  function install() {
    if (ids.every(id => map.getLayer(id))) return;
    clearLayers();
    map.addSource('people-grid', {type: 'geojson', attribution: '<a href="https://doi.org/10.5258/SOTON/WP00839">WorldPop 2025 (CC BY 4.0)</a>', data: {type: 'FeatureCollection', features: data.grid.cells.map(c => ({type: 'Feature', properties: {id: c[0], population: c[2]}, geometry: {type: 'Polygon', coordinates: [[...c[1], c[1][0]]]}}))}});
    map.addSource('people-objects', {type: 'geojson', data: data.facilities, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'});
    const before = map.getStyle().layers.find(layer => layer.type === 'fill-extrusion')?.id;
    map.addLayer({id: ids[0], type: 'fill', source: 'people-grid', paint: {'fill-color': ['case', ['==', ['get', 'population'], null], 'rgba(0,0,0,0)', ['step', ['get', 'population'], '#b9c9bd', 5000, '#c5a56e', 20000, '#b77855', 50000, '#a34830']], 'fill-opacity': 0.55}}, before);
    map.addLayer({id: ids[1], type: 'line', source: 'people-grid', paint: {'line-color': '#c5a56e', 'line-width': 0.5, 'line-opacity': 0.5}}, before);
    map.addLayer({id: ids[2], type: 'circle', source: 'people-objects', minzoom: 12.5, paint: {'circle-radius': 5, 'circle-color': ['case', ['==', ['get', 'kind'], 'school'], window.DhakaDesign?.colors.education || '#2563a8', window.DhakaDesign?.colors.healthcare || '#10b981'], 'circle-stroke-width': 2, 'circle-stroke-color': '#f3eedf'}});
  }
  // One listener across retries; facility objects take priority over the grid.
  function inspectClick(e) {
    if (!active || !ids.every(id => map.getLayer(id))) return;
    const hits = map.queryRenderedFeatures(e.point, {layers: ['people-facilities', 'people-cells']});
    const feature = hits.find(f => f.layer.id === 'people-facilities') || hits[0];
    if (feature) inspect(feature.properties);
  }
  function clearLayers() {
    for (const id of ids) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of ['people-grid', 'people-objects']) if (map.getSource(id)) map.removeSource(id);
  }
  async function activate(lens) {
    const prior = active && lens === 'people' ? selected : null;
    active = lens === 'people'; const token = ++generation;
    hideSelection(); render();
    for (const id of ids) if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', active ? 'visible' : 'none');
    if (!active || !map) return;
    try {
      await load(); if (!active || token !== generation) return;
      install(); render();
      if (panel()) {panel().dataset.status='reference';delete panel().dataset.reasonCode;panel().dataset.checkedAt=new Date().toISOString();}
      for (const id of ids) map.setLayoutProperty(id, 'visibility', 'visible');
      if (prior) inspect(prior);
    } catch (error) {
      if (active && token === generation) {
        clearLayers();
        if (panel()) {panel().dataset.status='unavailable';panel().dataset.reasonCode='reference-layer-unavailable';panel().dataset.checkedAt=new Date().toISOString();}
        const status = document.getElementById('people-status');
        if (status) {status.hidden=false;status.textContent=tr('Reference layers unavailable.', 'তথ্যসূত্র স্তর অনুপলব্ধ।');}
        const retry = document.getElementById('people-retry');
        if (retry) retry.hidden = false;
        for (const id of ['people-cell', 'people-filter']) {const control=document.getElementById(id);if(control)control.disabled=true;}
        console.warn('[people] reference-layer-unavailable', error);
      }
    }
  }
  window.AtlasPeople = {attach(value) {if (map) map.off('click', inspectClick); map = value; map.on('click', inspectClick); if (active) return activate('people');}, activate};
})();
