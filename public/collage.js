// The collage — satellite measurements, read against the city.
//
// Seven domains, one district at a time. Each domain is answered by a
// different instrument, and every reading names the measurement it came from:
// the value, its unit, the observation date, and the ground resolution it was
// taken at. A reading that cannot be measured says so.
//
// The point of showing all seven at once is that they disagree, and the
// disagreement is the finding: a district can be hot at night and bright at
// midnight and have almost no vegetation, and none of those three facts
// means much on its own.

(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const bn = () => document.documentElement.lang === 'bn';
  const tr = (en, be) => bn() ? be : en;

  let collage = null;
  let selected = null;
  let loading = false, loadController = null, loadGeneration = 0, resumeLoad = false;
  let readFailed = false, started = false, evidenceGeneration = 0, evidenceController = null;

  /** Escape untrusted text before it goes into the DOM. */
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function number(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat(bn() ? 'bn-BD' : 'en-GB', { maximumFractionDigits: 2 }).format(value);
  }

  /**
   * How much ground a reading covers, in the units a reader thinks in.
   *
   * The window is a length, not a count, so it is never rounded to a
   * flattering number: 5.6 km stays 5.6 km, and a window narrower than a
   * kilometre is given in metres.
   */
  function windowText(metres) {
    if (typeof metres !== 'number' || !Number.isFinite(metres) || metres <= 0) return '';
    if (metres < 1000) return `${number(Math.round(metres))} m`;
    const km = metres / 1000;
    return `${number(km < 10 ? Math.round(km * 10) / 10 : Math.round(km))} km`;
  }

  /** Show a temperature in Celsius, because Kelvin is not a temperature people feel. */
  function display(m) {
    if (m.value === null || m.value === undefined) return '—';
    if (m.unit === 'K') return `${new Intl.NumberFormat(bn()?'bn-BD':'en-GB',{maximumFractionDigits:1}).format(m.value-273.15)} °C`;
    if (m.unit === '% of ground') return `${number(m.value)}%`;
    // A dimensionless quantity has no unit; printing "1" beside it would
    // read as a value rather than a unit.
    if (m.unit === '1') return number(m.value);
    return `${number(m.value)} ${m.unit}`;
  }

  /** When the measurement was taken, stated honestly for a static layer too. */
  function when(m) {
    if (m.vintage) return tr(`static map · ${m.vintage}`, `স্থির মানচিত্র · ${m.vintage}`);
    if (m.period) return m.period;
    if (m.observationDate) return m.observationDate;
    return tr('no observation', 'পর্যবেক্ষণ নেই');
  }

  /** Compare recorded estimates, never infer missing method or geography. */
  function compareStored(records, place, layer) {
    const refuse = reasonCode => ({status:'unavailable', reasonCode});
    if (!Array.isArray(records)) return refuse('invalid-stored-history');
    const observed = new Map();
    for (const row of records) {
      const m = row.metadata;
      if (row.place_id !== place || row.layer_id !== layer || !m || m.layerId !== layer || row.status !== m.status) return refuse('incompatible-history-identity');
      if (m.status !== 'ok') continue;
      if (m.static || m.vintage || m.period || layer.startsWith('NASA_POWER')) return refuse('not-time-varying-observation');
      if (row.value !== m.value || row.unit !== m.unit || !Number.isFinite(m.value) || m.censored) return refuse('inexact-stored-estimate');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.observationDate || '') || !Number.isFinite(Date.parse(m.observationDate)) || new Date(m.observationDate).toISOString().slice(0,10) !== m.observationDate || row.observation_date !== m.observationDate || Date.parse(m.observationDate)>Date.now()) return refuse('invalid-stored-observation-date');
      if (!/^\/api\/atlas\/history\?snapshot=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row.snapshotUrl || '')) return refuse('invalid-snapshot-reference');
      if (!observed.has(m.observationDate)) observed.set(m.observationDate, row);
    }
    const pair = [...observed.values()].sort((a,b)=>b.metadata.observationDate.localeCompare(a.metadata.observationDate)).slice(0,2);
    if (pair.length !== 2) return refuse('two-distinct-observations-required');
    const [newer, older] = pair, a = older.metadata, b = newer.metadata;
    if (!a.processingMethod || !b.processingMethod) return refuse('processing-method-not-recorded');
    const method = /^gibs-(palette-window-mean|class-window-share)-v1$/;
    if (!method.test(a.processingMethod) || a.processingMethod !== b.processingMethod || a.unit !== b.unit || !a.source || a.source !== b.source || !/^https:\/\//.test(a.sourceUrl || '') || a.sourceUrl !== b.sourceUrl || a.provenance !== 'measured' || a.provenance !== b.provenance || typeof a.unit !== 'string' || !a.unit.trim()) return refuse('incompatible-measurement-method');
    const signature = m => JSON.stringify([m.sampling?.type,m.sampling?.radiusPx,m.sampling?.bbox,m.sampling?.scope,m.resolutionM,m.windowM,m.nativeResolutionM]);
    if (a.sampling?.type !== 'point-window' || !Array.isArray(a.sampling.bbox) || a.sampling.bbox.length !== 4 || !a.sampling.bbox.every(Number.isFinite) || !(a.resolutionM > 0) || !(a.windowM > 0) || signature(a) !== signature(b)) return refuse('incompatible-sampled-footprint');
    const [west,south,east,north]=a.sampling.bbox;
    if(west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north || !Number.isInteger(a.sampling.radiusPx) || a.sampling.radiusPx<0) return refuse('invalid-sampled-footprint');
    if (a.coverage !== 1 || b.coverage !== 1) return refuse('incomplete-observed-window');
    return {status:'ok',older,newer,delta:b.value-a.value,unit:b.unit,processingMethod:b.processingMethod};
  }

  function comparisonRefusal(reasonCode) {
    const messages = {
      'inexact-stored-estimate': ['An exact pair of stored values is unavailable.', 'সংরক্ষিত মানের নির্ভুল জোড়া অনুপলব্ধ।'],
      'processing-method-not-recorded': ['The archive did not record the processing method.', 'সংরক্ষণে প্রক্রিয়াকরণের পদ্ধতি নথিভুক্ত নেই।'],
      'incompatible-measurement-method': ['The source, unit or processing method changed.', 'উৎস, একক বা প্রক্রিয়াকরণের পদ্ধতি বদলেছে।'],
      'incompatible-sampled-footprint': ['The sample areas or pixel spacing differ.', 'নমুনার সীমানা বা পিক্সেলের দূরত্ব ভিন্ন।'],
      'invalid-sampled-footprint': ['The recorded sample area cannot be verified.', 'নথিভুক্ত নমুনার সীমানা যাচাই করা যায়নি।'],
      'incomplete-observed-window': ['One or both sample areas have missing pixels.', 'একটি বা উভয় নমুনার সীমানায় পিক্সেলের তথ্য অনুপস্থিত।'],
      'two-distinct-observations-required': ['Two different observation dates are needed.', 'দুটি ভিন্ন পর্যবেক্ষণের তারিখ প্রয়োজন।'],
      'not-time-varying-observation': ['Static maps and climatologies cannot show change.', 'স্থির মানচিত্র ও জলবায়ুর দীর্ঘমেয়াদি গড় দিয়ে পরিবর্তন দেখানো যায় না।'],
    };
    const [en, be] = messages[reasonCode] || ['The stored records cannot be safely matched.', 'সংরক্ষিত তথ্য নিরাপদে মেলানো যায়নি।'];
    return tr('Comparison unavailable: ', 'তুলনা অনুপলব্ধ: ') + tr(en, be) + ' · ' + reasonCode;
  }

  function cancelEvidence() {
    evidenceGeneration++; evidenceController?.abort(); evidenceController = null;
  }
  function evidenceDetails(panel, district) {
    const details = document.createElement('details');
    details.className = 'collage-evidence';
    const summary = document.createElement('summary');
    summary.textContent = tr('Source health & stored observations', 'উৎসের অবস্থা ও সংরক্ষিত পর্যবেক্ষণ'); details.appendChild(summary);
    const health = document.createElement('p'); health.setAttribute('role','status');
    health.textContent = tr('Open to check collection and source availability.', 'সংগ্রহ ও উৎসের প্রাপ্যতা দেখতে খুলুন।');
    const sources = document.createElement('ul'); sources.className = 'atlas-plain-list';
    const refresh = document.createElement('button'); refresh.type='button'; refresh.className='atlas-btn'; refresh.textContent=tr('Refresh source health','উৎসের অবস্থা আবার আনুন');
    const label = document.createElement('label'); label.textContent=tr('Stored signal ', 'সংরক্ষিত সংকেত ');
    const select = document.createElement('select'); select.setAttribute('aria-label',tr('Stored signal','সংরক্ষিত সংকেত'));
    for (const m of district.measurements) { const option=document.createElement('option'); option.value=m.layerId;option.textContent=bn()?m.label_bn:m.label;select.appendChild(option); }
    const first = district.measurements.find(m=>!m.static && !m.period && !m.layerId.startsWith('NASA_POWER'));
    if (first) select.value=first.layerId;
    label.appendChild(select);
    const compare = document.createElement('button'); compare.type='button';compare.className='atlas-btn';compare.textContent=tr('Compare latest stored observation dates','সর্বশেষ সংরক্ষিত পর্যবেক্ষণের তারিখ তুলনা করুন');
    const output = document.createElement('p');output.setAttribute('role','status');
    output.textContent=tr('Only matching methods and fully observed sample windows can be compared.', 'শুধু একই পদ্ধতি ও সম্পূর্ণ পর্যবেক্ষিত নমুনার সীমানা তুলনা করা যায়।');
    details.append(health,sources,refresh,label,compare,output);panel.appendChild(details);
    const generation=evidenceGeneration;
    let scope, sourcePending=null, comparisonController, comparisonSequence=0;
    const owned = signal => generation===evidenceGeneration && !signal.aborted && details.open;
    const request = async (url, signal) => {
      const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return response.json();
    };
    function openScope() { if (!scope || scope.signal.aborted) {scope=new AbortController();evidenceController=scope;} return scope; }
    async function readSources() {
      if (sourcePending && !sourcePending.signal.aborted || !details.open) return;
      const controller=openScope(); sourcePending=controller; refresh.disabled=true;
      health.textContent=tr('Reading collection and source status…','সংগ্রহ ও উৎসের অবস্থা পড়া হচ্ছে…');
      try {
        const body=await request('/api/atlas/sources',controller.signal);
        if (!owned(controller.signal)) return;
        if (!['fresh','stale','unavailable'].includes(body.status) || !Array.isArray(body.sources) || body.status!=='unavailable' && !body.collector || body.sources.some(source=>typeof source.layerId!=='string' || !Number.isInteger(source.totalPlaces) || source.totalPlaces<1 || !Number.isInteger(source.availablePlaces) || source.availablePlaces<0 || source.availablePlaces>source.totalPlaces)) throw Error('invalid-source-health');
        if(body.status==='unavailable') health.textContent=tr('Published source snapshot unavailable','প্রকাশিত উৎসের সংরক্ষিত তথ্য অনুপলব্ধ');
        else {
          health.textContent=tr(`Collector last success: ${body.collector.last_success_at || 'unknown'} · snapshot: ${body.status}. Observation dates below remain separate.`, `সংগ্রহের সর্বশেষ সাফল্য: ${body.collector.last_success_at || 'অজানা'} · সংরক্ষিত তথ্য: ${body.status==='fresh'?'সাম্প্রতিক':'পুরোনো'}। নিচে পর্যবেক্ষণের তারিখ আলাদা।`);
          if(body.collector.last_attempt_at)health.textContent+=' · '+tr('Last collection attempt','সর্বশেষ সংগ্রহের চেষ্টা')+': '+body.collector.last_attempt_at;
          if(body.delivery?.snapshotId && collage.delivery?.snapshotId && body.delivery.snapshotId!==collage.delivery.snapshotId)health.textContent+=' · '+tr('Source status is from a different snapshot; selected readings keep their dates.','উৎসের অবস্থা ভিন্ন সংরক্ষণ থেকে; নির্বাচিত পাঠের তারিখ অপরিবর্তিত।');
        }
        const reason=body.reasonCode || body.collector?.reason_code;
        if(reason)health.textContent+=' · '+reason;
        sources.textContent='';
        for (const source of body.sources) {
          const li=document.createElement('li'), m=district.measurements.find(m=>m.layerId===source.layerId);
          li.textContent=`${m?(bn()?m.label_bn:m.label):source.layerId} · ${Number.isInteger(source.availablePlaces)?number(source.availablePlaces):tr('unknown','অজানা')}/${Number.isInteger(source.totalPlaces)?number(source.totalPlaces):tr('unknown','অজানা')} ${tr('sampled places available','টি নমুনার স্থানে তথ্য আছে')} · ${tr('Selected stored sample','নির্বাচিত সংরক্ষিত নমুনা')}: ${m?when(m):tr('unavailable','অনুপলব্ধ')}`;
          sources.appendChild(li);
        }
      } catch (error) { if (owned(controller.signal)) {sources.textContent='';health.textContent=tr('Source health unavailable; retry.', 'উৎসের অবস্থা অনুপলব্ধ; আবার চেষ্টা করুন।')+' · '+(error.name==='TimeoutError'?'source-health-request-timeout':'source-health-request-failed')+' · '+new Date().toISOString();} }
      finally { if(sourcePending===controller)sourcePending=null;if(owned(controller.signal))refresh.disabled=false; }
    }
    details.ontoggle=()=>{
      if (details.open) {openScope();readSources();}
      else {scope?.abort();sourcePending=null;comparisonController?.abort();comparisonSequence++;compare.disabled=false;}
    };
    refresh.onclick=readSources;
    select.onchange=()=>{comparisonSequence++;comparisonController?.abort();compare.disabled=false;output.textContent=tr('Choose Compare to read stored observations.', 'সংরক্ষিত পর্যবেক্ষণ পড়তে তুলনা বেছে নিন।');};
    compare.onclick=async()=>{
      const selectedLayer=select.value, basis=district.measurements.find(m=>m.layerId===selectedLayer);
      if (!basis || basis.static || basis.vintage || basis.period || selectedLayer.startsWith('NASA_POWER')) {output.textContent=comparisonRefusal('not-time-varying-observation');return;}
      const controller=openScope(), sequence=++comparisonSequence;
      comparisonController?.abort();comparisonController=new AbortController();
      const signal=AbortSignal.any([controller.signal,comparisonController.signal]);
      const current=()=>owned(signal) && sequence===comparisonSequence && select.value===selectedLayer;
      compare.disabled=true;output.textContent=tr('Reading stored history…','সংরক্ষিত ইতিহাস পড়া হচ্ছে…');
      try {
        const body=await request(`/api/atlas/history?place=${encodeURIComponent(district.id)}&signal=${encodeURIComponent(selectedLayer)}`,signal);
        if (!current()) return;
        const result=compareStored(body.records,district.id,selectedLayer);
        if(result.status!=='ok'){output.textContent=comparisonRefusal(result.reasonCode);return;}
        const old=result.older.metadata, recent=result.newer.metadata, unit=result.unit==='K'?'°C':result.unit==='1'?'':result.unit;
        output.textContent=tr(`Stored sample difference: ${old.observationDate} ${display(old)} → ${recent.observationDate} ${display(recent)}; change ${result.delta>0?'+':''}${number(result.delta)} ${unit}. Two estimates, not a forecast or causal claim.`, `সংরক্ষিত নমুনার পার্থক্য: ${old.observationDate} ${display(old)} → ${recent.observationDate} ${display(recent)}; পরিবর্তন ${result.delta>0?'+':''}${number(result.delta)} ${unit}। দুটি অনুমান, পূর্বাভাস বা কার্যকারণের দাবি নয়।`);
        for(const [row,text] of [[result.older,tr('Earlier archive','আগের সংরক্ষণ')],[result.newer,tr('Later archive','পরের সংরক্ষণ')]]){const link=document.createElement('a');link.href=row.snapshotUrl;link.target='_blank';link.rel='noopener';link.textContent=text;output.append(' · ',link);}
      } catch (error) {if(current())output.textContent=tr('Stored history unavailable; retry.','সংরক্ষিত ইতিহাস অনুপলব্ধ; আবার চেষ্টা করুন।')+' · '+(error.name==='TimeoutError'?'history-request-timeout':'history-request-failed')+' · '+new Date().toISOString();}
      finally{if(current())compare.disabled=false;}
    };
  }

  function renderDistricts(list) {
    list.innerHTML = '';
    const label = document.createElement('label');
    label.textContent = tr('Sampled place', 'নমুনার স্থান');
    const select = document.createElement('select');
    select.setAttribute('aria-label', tr('Sampled place', 'নমুনার স্থান'));
    for (const d of collage.districts) {
      const option = document.createElement('option');
      option.value = d.id;
      option.textContent = bn() ? d.name_bn : d.name;
      option.selected = d.id === selected;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {selected = select.value; render();});
    label.appendChild(select);
    list.appendChild(label);
  }

  function renderDomains(panel, district) {
    panel.innerHTML = '';
    if (!district) {
      panel.innerHTML = `<p class="collage-empty">${tr('Pick a district to read its signals.', 'সংকেত পড়তে একটি এলাকা বেছে নিন।')}</p>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'collage-grid';

    for (const domain of collage.domains) {
      const reading = district.readings.find(r => r.domain === domain.id);
      const card = document.createElement('article');
      card.className = 'collage-card';
      if (!reading || reading.status !== 'ok') {
        card.dataset.state = 'unavailable';
        card.innerHTML = `
          <h4>${esc(bn() ? domain.label_bn : domain.label)}</h4>
          <p class="collage-unavailable">${tr('Not measurable here', 'এখানে মাপা যায়নি')}</p>
          <small data-language-fixed>${esc(reading?.reasonCode || 'no-measured-signal-in-domain')}</small>`;
        grid.appendChild(card);
        continue;
      }
      const basis = reading.basis;
      card.dataset.state = 'ok';
      card.innerHTML = `
        <h4>${esc(bn() ? domain.label_bn : domain.label)}</h4>
        <p class="collage-question">${esc(bn() ? domain.question_bn : domain.question)}</p>
        <p class="collage-reading">${esc(bn() ? reading.reading_bn : reading.reading)}</p>
        <div class="collage-basis">
          <span>${esc(bn() ? basis.label_bn : basis.label)}</span>
          <span>${basis.censored ? "≥ " : ""}${esc(display(basis))}</span>
          <span>${esc(when(basis))}</span>
          <span>${esc(basis.source || tr('Source unavailable','উৎস অনুপলব্ধ'))} · ${esc(basis.provenance === 'modeled' ? tr('modeled','মডেলভিত্তিক') : basis.provenance === 'reference' ? tr('reference','তথ্যসূত্র') : tr('satellite-derived estimate','উপগ্রহভিত্তিক অনুমান'))}</span>
          ${basis.resolutionM ? `<span>${tr('Tile pixel spacing','টাইলের পিক্সেলের দূরত্ব')}: ${number(basis.resolutionM)} m · ${tr('native resolution unverified','মূল রেজোলিউশন যাচাই করা হয়নি')}</span>` : `<span>${basis.nativeResolutionDegrees ? tr(`Source grid ${basis.nativeResolutionDegrees}°; not rooftop potential`, `উৎসের গ্রিড ${number(basis.nativeResolutionDegrees)}°; ছাদের সম্ভাবনা নয়`) : tr('Native resolution unavailable','মূল রেজোলিউশন অনুপলব্ধ')}</span>`}
          <span>${basis.coverage === null ? tr('Model point; observed coverage not supplied','মডেলের স্থান; পর্যবেক্ষণের পরিমাণ সরবরাহ করা হয়নি') : tr('Observed sample coverage','নমুনায় তথ্যের পরিমাণ') + ': ' + number(basis.coverage * 100) + '%'}</span>
          ${basis.windowM ? `<span>${tr('Sampled over','নমুনার সীমারেখা')}: ${windowText(basis.windowM)} ${tr('wide','বিস্তৃত')}</span>` : ''}
          ${basis.rank ? `<span>${basis.tied
            ? tr(`tied ${basis.rank} of ${basis.of}`, `${basis.of}টির মধ্যে যৌথ ${basis.rank} নম্বর`)
            : tr(`rank ${basis.rank} of ${basis.of}`, `${basis.of}টির মধ্যে ${basis.rank} নম্বর`)}</span>` : ''}
        </div>`;
      if (basis.sampling?.bbox) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'atlas-btn collage-sample';
        button.textContent = tr('Show sampled footprint','নমুনার সীমানা দেখুন');
        button.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('atlas:sampling', {detail:{bbox:basis.sampling.bbox, label:bn()?district.name_bn:district.name}}));
          document.getElementById('collage-dialog')?.close();
        });
        card.appendChild(button);
      }
      grid.appendChild(card);
    }
    panel.appendChild(grid);

    const foot = document.createElement('p');
    foot.className = 'collage-foot';
    const delivery = collage.delivery ? {...collage.delivery} : null;
    if (delivery) {
      delivery.ageSeconds = Math.max(0, Math.floor((Date.now()-Date.parse(delivery.collectedAt))/1000));
      delivery.status = readFailed || delivery.ageSeconds>4*3600 ? 'stale' : 'fresh';
      delivery.reasonCode = readFailed ? 'snapshot-request-failed' : delivery.ageSeconds>4*3600 ? 'collector-overdue' : null;
    }
    foot.textContent = delivery ? tr(
      `${collage.measured}/${collage.total} readings · ${delivery.status} snapshot · collected ${delivery.collectedAt} · age ${number(delivery.ageSeconds / 3600)} h. Observation dates differ by instrument.`,
      `${number(collage.measured)}/${number(collage.total)}টি পাঠ · ${delivery.status === 'fresh' ? 'সাম্প্রতিক' : 'পুরোনো'} সংরক্ষিত তথ্য · সংগ্রহ ${delivery.collectedAt} · বয়স ${number(delivery.ageSeconds / 3600)} ঘণ্টা। যন্ত্রভেদে পর্যবেক্ষণের তারিখ আলাদা।`
    ) : tr('Snapshot age unavailable','সংরক্ষিত তথ্যের বয়স অনুপলব্ধ');
    if (delivery?.reasonCode) { const reason=document.createElement('span');reason.dataset.languageFixed='';reason.textContent=' · '+delivery.reasonCode;foot.appendChild(reason); }
    const history = document.createElement('a');
    history.href = `/api/atlas/history?place=${encodeURIComponent(district.id)}&signal=${encodeURIComponent(district.measurements[0]?.layerId || '')}`;
    history.target = '_blank'; history.rel = 'noopener'; history.textContent = tr('Stored history (JSON)','সংরক্ষিত ইতিহাস (JSON)');
    foot.append(' · ', history);
    panel.appendChild(foot);
    evidenceDetails(panel,district);
  }

  function render() {
    cancelEvidence();
    const list = $('#collage-districts');
    const panel = $('#collage-domains');
    if (!list || !panel) return;
    if (!collage) {
      list.innerHTML = '';
      panel.innerHTML = `<p class="collage-empty">${tr('Snapshot unavailable or loading.', 'সংরক্ষিত তথ্য অনুপলব্ধ অথবা লোড হচ্ছে।')}</p>`;
      return;
    }
    const expired=collage.delivery && Date.now()-Date.parse(collage.delivery.collectedAt)>7*86400000;
    if (collage.status === 'unavailable' || expired) {
      list.innerHTML = '';
      panel.innerHTML = `<p class="collage-unavailable">${tr('Published snapshot unavailable.', 'প্রকাশিত সংরক্ষিত তথ্য অনুপলব্ধ।')} · ${esc(expired ? "snapshot-expired" : collage.reasonCode)}</p>`;
      const retry=document.createElement('button');retry.type='button';retry.className='atlas-btn collage-retry';
      retry.textContent=tr('Retry snapshot','সংরক্ষিত তথ্য আবার আনুন');retry.addEventListener('click',load);panel.appendChild(retry);
      return;
    }
    if (!selected && collage.districts.length) selected = collage.districts[0].id;
    renderDistricts(list);
    renderDomains(panel, collage.districts.find(d => d.id === selected));
  }

  function readableSnapshot(body) {
    if (!body || !Array.isArray(body.districts)) return false;
    if (body.status==='unavailable') return typeof body.reasonCode==='string';
    if (!['ok','partial'].includes(body.status) || !Array.isArray(body.domains) || !body.domains.length || !body.districts.length || !Number.isInteger(body.measured) || !Number.isInteger(body.total) || body.measured<0 || body.measured>body.total) return false;
    if (body.delivery && (!Number.isFinite(Date.parse(body.delivery.collectedAt)) || Date.parse(body.delivery.collectedAt)>Date.now()+60000)) return false;
    return body.domains.every(d=>typeof d.id==='string') && body.districts.every(d=>typeof d.id==='string' && Array.isArray(d.measurements) && d.measurements.length && d.measurements.every(m=>typeof m.layerId==='string' && typeof m.label==='string' && typeof m.label_bn==='string') && Array.isArray(d.readings) && d.readings.every(r=>r.status==='unavailable' || r.status==='ok' && r.basis && typeof r.basis.unit==='string' && Number.isFinite(r.basis.value)));
  }

  async function load() {
    if (loading) return;
    loading = true;
    const controller=new AbortController(), token=++loadGeneration;loadController=controller;resumeLoad=false;
    render();
    try {
      const res = await fetch('/api/atlas/collage', { signal: AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]) });
      const body = await res.json();
      if (!readableSnapshot(body)) throw Error('invalid-collage');
      if(controller.signal.aborted || token!==loadGeneration)return;
      collage = body;
      readFailed = false;
    } catch {
      if(controller.signal.aborted || token!==loadGeneration)return;
      readFailed = true;
      if (!collage?.delivery) collage = {status:'unavailable', reasonCode:'snapshot-request-failed', districts:[]};
    } finally {
      if(token===loadGeneration){loadController=null;loading=false;render();}
    }
  }

  window.AtlasCollage = {
    compareStored,
    start() {
      if (started) return; started=true;
      const open = document.getElementById('collage-dialog');
      if (open) {
        open.addEventListener('close', () => {cancelEvidence();if(loading){resumeLoad=true;loadGeneration++;loadController?.abort();loadController=null;loading=false;}});
        if(open.open)load();
      }
      document.querySelector('[data-open="collage-dialog"]')?.addEventListener('click',load);
      document.addEventListener?.('visibilitychange',()=>{
        if(document.hidden){cancelEvidence();if(loading){resumeLoad=true;loadGeneration++;loadController?.abort();loadController=null;loading=false;}}
        else if(open?.open && resumeLoad)load();
      });
      window.addEventListener('atlas:language', render);
    },
    load,
  };
})();
