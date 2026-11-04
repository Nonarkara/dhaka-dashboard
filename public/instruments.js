// The instrument band — the narrow strip that carries the country's clock, the
// daily reference exchange rate and dated national readings.
//
// Three rules govern what may appear here:
//
//  1. Every figure arrives from a named upstream with its own period. Nothing
//     is typed in by hand.
//  2. A figure that cannot be read says so. It never shows a zero, and it
//     never shows yesterday's number without its date.
//  3. The clock names its basis: device time until a valid server response
//     supplies an offset, and device time again when synchronization fails.
//
// The band is a band: one row, one message. The full set of readings lives in
// the Bangladesh data panel, and this strip is the short version of it.

(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const bn = () => document.documentElement.lang === 'bn';
  const tr = (en, be) => bn() ? be : en;

  // The ledger uses source-domain groups; the band below stays a short list.
  const DOMAIN_ORDER = [
    ['economy', 'Economy', 'অর্থনীতি'],
    ['people', 'People', 'জনগণ'],
    ['energy', 'Energy', 'জ্বালানি'],
    ['mobility', 'Mobility', 'চলাচল'],
    ['smart-living', 'Smart living', 'স্মার্ট জীবনযাপন'],
    ['environment', 'Environment', 'পরিবেশ'],
    ['governance', 'Governance', 'শাসন'],
  ];
  const fields = [
    ['gdp', 'GDP', 'জিডিপি', 'economy'],
    ['population', 'Population', 'জনসংখ্যা', 'people'],
    ['inflation', 'CPI inflation', 'মূল্যস্ফীতি', 'economy'],
    ['remittance', 'Remittances', 'প্রবাসী আয়', 'economy'],
    ['exports', 'Exports', 'রপ্তানি', 'economy'],
    ['industry', 'Industry share', 'শিল্পখাতের অংশ', 'economy'],
    ['unemployment', 'Unemployment', 'বেকারত্ব', 'people'],
    ['fx-period', 'Official FX annual average', 'সরকারি বার্ষিক গড় বিনিময় হার', 'economy'],
    ['literacy', 'Adult literacy rate', 'প্রাপ্তবয়স্কদের সাক্ষরতার হার', 'people'],
    ['school-enrolment', 'Secondary school enrolment', 'মাধ্যমিক বিদ্যালয়ে ভর্তি', 'people'],
    ['life-expectancy', 'Life expectancy at birth', 'জন্মের সময় প্রত্যাশিত আয়ু', 'smart-living'],
    ['physicians', 'Physicians per 1,000 people', 'হাজার মানুষে চিকিৎসক', 'smart-living'],
    ['urban-share', 'Urban population share', 'শহুরে জনগণের অনুপাত', 'mobility'],
    ['electricity-access', 'Electricity access', 'বিদ্যুৎপ্রাপ্তির হার', 'energy'],
    ['renewables', 'Renewable electricity share', 'নবায়নযোগ্য বিদ্যুতের অংশ', 'energy'],
    ['co2-per-capita', 'CO₂ per person', 'জনপ্রতি কার্বন ডাই-অক্সাইড', 'environment'],
    ['tax-revenue', 'Tax revenue', 'কর আদায়', 'governance'],
  ];

  /**
   * Band order and the width at which each reading appears.
   *
   * The clock and the rate are the two a person checks without meaning to, so
   * they are never dropped. The rest arrive as the width allows.
   */
  const BAND = [
    { id: 'fx', from: 0 },
    { id: 'gdp', from: 2 },
    { id: 'population', from: 3 },
    { id: 'inflation', from: 4 },
    { id: 'exports', from: 5 },
    { id: 'industry', from: 6 },
  ];

  let data, started = false;
  let serverOffsetMs = null;

  function format(value, kind, compact = false) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const scale = compact ? [[1e12, 'T', ' ট্রিলিয়ন'], [1e9, 'B', ' বিলিয়ন'], [1e6, 'M', ' মিলিয়ন'], [1e3, 'K', ' হাজার']].find(([limit]) => Math.abs(value) >= limit) : null;
    const shown = new Intl.NumberFormat(bn() ? 'bn-BD' : 'en-GB', { maximumFractionDigits: kind === 'count' ? (compact ? 1 : 0) : 2 }).format(scale ? value / scale[0] : value);
    return shown + (scale ? scale[bn() ? 2 : 1] : '');
  }

  function label(id) { const f = fields.find(f => f[0] === id); return f ? f[bn() ? 2 : 1] : id; }

  /**
   * The unit beside a number, in the language of the interface.
   *
   * A currency code stays as it is — "USD" is an ISO code and is not
   * translated — but a unit like "people" or "% GDP" is a word, and a word
   * left in the wrong language in a Bengali interface is a hole.
   */
  const UNITS = {
    en: { 'USD': 'USD', 'people': 'people', '% GDP': '% of GDP', 'BDT/USD': 'BDT/USD', '%': '%', 'years': 'years', 'per 1,000': 'per 1,000 people', 't': 'tonnes' },
    bn: { 'USD': 'USD', 'people': 'জন', '% GDP': '% জিডিপি', 'BDT/USD': 'টাকা/ডলার', '%': '%', 'years': 'বছর', 'per 1,000': 'প্রতি ১,০০০ জনে', 't': 'টন' },
  };
  const unitText = unit => (UNITS[bn() ? 'bn' : 'en'][unit]) ?? unit ?? '';

  /** A number written in the interface's own numerals. */
  function decimal(value, digits = 2) {
    return new Intl.NumberFormat(bn() ? 'bn-BD' : 'en-GB', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
  }

  /**
   * Glue a percent sign to its number.
   *
   * "8.8 %" reads as two things; "8.8%" is one. The sign belongs to the
   * number, not to the unit, so it moves across before the unit takes its
   * place in the line.
   */
  function gluePercent(valueEl, unitEl) {
    const unit = unitEl.textContent || '';
    if (!unit.startsWith('%')) return;
    valueEl.textContent = `${valueEl.textContent}%`;
    unitEl.textContent = unit.slice(1).trim();
  }

  // Bangladesh time is UTC+6; synchronization provenance stays visible.
  function clockBasis() {
    return serverOffsetMs === null
      ? tr('Device clock · Bangladesh time · UTC+6', 'যন্ত্রের ঘড়ি · বাংলাদেশের সময় · UTC+6')
      : tr('Server-synced clock · Bangladesh time · UTC+6', 'সার্ভারের সঙ্গে সমন্বিত ঘড়ি · বাংলাদেশের সময় · UTC+6');
  }
  function countryTime() {
    const now = new Date(Date.now() + (serverOffsetMs ?? 0));
    return now.toLocaleTimeString(bn() ? 'bn-BD' : 'en-GB', {
      timeZone: 'Asia/Dhaka', hour12: false,
    });
  }

  function clock() {
    const text = countryTime();
    document.querySelectorAll('.instrument-clock').forEach(el => { el.textContent = text; });
  }

  function make(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  /** The reading a band slot shows, or null when it cannot be measured. */
  function readingFor(id) {
    if (id === 'fx') return data?.currency;
    return data?.macro?.find(r => r.id === id);
  }

  function renderBand(strip) {
    strip.textContent = '';

    // Optional band clock; the national desk remains independently usable.
    const clockEl = make('time', '', 'instrument-clock');
    clockEl.setAttribute('role', 'timer');
    clockEl.setAttribute('aria-live', 'off');
    clockEl.title = clockBasis();
    strip.appendChild(clockEl);

    for (const slot of BAND) {
      const reading = readingFor(slot.id);
      const el = make('span', '', 'atlas-instrument');
      el.dataset.slot = slot.id;

      const value = make('span', '', 'atlas-instrument-value');
      const unit = make('span', '', 'atlas-instrument-unit');
      el.append(value, unit);

      if (slot.id === 'fx') {
        unit.textContent = unitText('BDT/USD');
        if (reading?.status === 'ok' && Number.isFinite(reading.rate)) {
          value.textContent = decimal(reading.rate);
          el.dataset.state = 'ok';
          el.title = tr(
            `Daily reference exchange rate · ${reading.source} · ${reading.period}`,
            `দৈনিক তথ্যসূত্রের বিনিময় হার · ${reading.source} · ${reading.period}`,
          );
        } else {
          value.textContent = '—';
          el.dataset.state = 'unavailable';
          el.title = tr(
            `Exchange rate unavailable · ${reading?.reasonCode || 'upstream-unreachable'}`,
            `বিনিময় হার অনুপলব্ধ · ${reading?.reasonCode || 'upstream-unreachable'}`,
          );
        }
      } else {
        const shown = reading?.status === 'ok' ? format(reading.value, reading.format, true) : null;
        unit.textContent = unitText(reading?.unit === 'USD' ? 'USD' : reading?.unit);
        if (shown !== null) {
          value.textContent = shown;
          el.dataset.state = 'ok';
          el.title = tr(
            `${label(slot.id)} · ${reading.source} · ${reading.period}`,
            `${label(slot.id)} · ${reading.source} · ${reading.period}`,
          );
        } else {
          value.textContent = '—';
          el.dataset.state = 'unavailable';
          el.title = tr(
            `${label(slot.id)} unavailable · ${reading?.reasonCode || 'national-series-unavailable'}`,
            `${label(slot.id)} অনুপলব্ধ · ${reading?.reasonCode || 'national-series-unavailable'}`,
          );
        }
      }
      // The percent sign belongs to the number, so it is glued on after the
      // unit is known.
      gluePercent(value, unit);
      strip.appendChild(el);
    }
  }

  function render() {
    const strip = $('#atlas-instruments'), desk = $('#atlas-national-data');
    if (strip) renderBand(strip);
    if (!desk) return;

    desk.textContent = '';
    const note = make('p', tr(
      'Bangladesh · national reference data. Annual statistics and the daily exchange rate keep their own reporting dates.',
      'বাংলাদেশ · জাতীয় তথ্যসূত্র। বার্ষিক পরিসংখ্যান ও দৈনিক বিনিময় হারের নিজস্ব তারিখ রয়েছে।',
    ));
    desk.appendChild(note);

    const localClock = make('p', `${clockBasis()}: `);
    localClock.appendChild(make('time', '', 'instrument-clock'));
    desk.appendChild(localClock);

    const rows = make('dl', '');
    const show = (id, reading, isFx = false, into = rows) => {
      const dt = make('dt', isFx
        ? tr('Daily reference FX · BDT per USD', 'দৈনিক তথ্যসূত্রের বিনিময় হার · প্রতি ডলারে টাকা')
        : label(id));
      const dd = make('dd', '');
      dd.dataset.series = id;
      const raw = isFx ? reading?.rate : reading?.value;
      const shown = reading?.status === 'ok' ? format(raw, isFx ? 'rate' : reading.format) : null;
      const unit = isFx ? 'BDT/USD' : reading?.unit;
      dd.appendChild(make('strong', shown === null ? tr('Unavailable', 'অনুপলব্ধ') : `${shown} ${unitText(unit)}`));
      const valid = shown !== null && typeof reading?.period === 'string';
      const period = make('small', valid
        ? `${tr('Period', 'তথ্যকাল')}: ${reading.period} · ${tr('Retrieved', 'সংগৃহীত')}: ${reading.fetchedAt}`
        : `${reading?.reasonCode || 'national-series-unavailable'} · ${data?.timestamp || new Date().toISOString()}`);
      period.setAttribute('data-language-fixed', '');
      dd.appendChild(period);
      const link = make('a', isFx ? tr('Fawaz Ahmed Currency API · CC0', 'ফাওয়াজ আহমেদ কারেন্সি API · CC0') : tr('World Bank WDI ↗', 'বিশ্বব্যাংক WDI ↗'));
      link.href = isFx ? 'https://github.com/fawazahmed0/exchange-api' : `https://data.worldbank.org/indicator/${reading?.indicator || ''}?locations=BD`;
      link.target = '_blank'; link.rel = 'noopener';
      dd.appendChild(link);
      into.append(dt, dd);
    };
    show('daily-fx', data?.currency, true);
    desk.appendChild(rows);
    // Keep every series visible during partial and total outages as well.
    for (const [domain, en, be] of DOMAIN_ORDER) {
      desk.appendChild(make('h4', bn() ? be : en, 'desk-subhead'));
      const group = make('dl', '');
      group.dataset.domain = domain;
      fields.filter(field => field[3] === domain).forEach(([id]) =>
        show(id, data?.macro?.find(reading => reading.id === id), false, group));
      desk.appendChild(group);
    }
    clock();
  }

  async function load() {
    try {
      const res = await fetch('/api/atlas/instruments', { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw Error('national-request-failed');
      const body = await res.json();
      if (!Array.isArray(body.macro) || typeof body.timestamp !== 'string' || !Number.isFinite(Date.parse(body.timestamp))) throw Error('invalid-national-response');
      data = body;
      // A valid response timestamp permits a labeled synchronization offset.
      serverOffsetMs = new Date(body.timestamp).getTime() - Date.now();
    } catch {
      serverOffsetMs = null;
      data = { macro: [], timestamp: new Date().toISOString() };
    }
    render();
  }

  window.AtlasInstruments = {
    format,
    start() {
      if (started) return;
      started = true;
      render();
      load();
      setInterval(clock, 1000);
      setInterval(load, 30 * 60 * 1000);
      window.addEventListener('atlas:language', render);
    },
  };
})();
