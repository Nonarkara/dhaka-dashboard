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
  let loading = false;
  let readFailed = false;

  /** Escape untrusted text before it goes into the DOM. */
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function number(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat(bn() ? 'bn-BD' : 'en-GB', { maximumFractionDigits: 2 }).format(value);
  }

  /** Show a temperature in Celsius, because Kelvin is not a temperature people feel. */
  function display(m) {
    if (m.value === null || m.value === undefined) return '—';
    if (m.unit === 'K') return `${(m.value - 273.15).toFixed(1)} °C`;
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
  }

  function render() {
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

  async function load() {
    if (loading) return;
    loading = true;
    render();
    try {
      const res = await fetch('/api/atlas/collage', { signal: AbortSignal.timeout(45000) });
      const body = await res.json();
      if (!Array.isArray(body.districts)) throw Error('invalid-collage');
      collage = body;
      readFailed = false;
    } catch {
      readFailed = true;
      if (!collage?.delivery) collage = {status:'unavailable', reasonCode:'snapshot-request-failed', districts:[]};
    } finally {
      loading = false;
      render();
    }
  }

  window.AtlasCollage = {
    start() {
      const open = document.getElementById('collage-dialog');
      if (open) {
        open.addEventListener('close', () => { });
        load();
      }
      document.querySelector('[data-open="collage-dialog"]')?.addEventListener('click',load);
      window.addEventListener('atlas:language', render);
    },
    load,
  };
})();
