// The instrument band — the narrow strip that carries the country's clock, the
// live exchange rate and the national economic readings.
//
// Three rules govern what may appear here:
//
//  1. Every figure arrives from a named upstream with its own period. Nothing
//     is typed in by hand.
//  2. A figure that cannot be read says so. It never shows a zero, and it
//     never shows yesterday's number without its date.
//  3. The clock is anchored to the server, not to the device. A device clock
//     that is wrong would put a wrong time in the one place the city looks to
//     for the time; the offset from the server is computed once and the tick
//     runs from that.
//
// The band is a band: one row, one message. The full set of readings lives in
// the Bangladesh data panel, and this strip is the short version of it.

(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const bn = () => document.documentElement.lang === 'bn';
  const tr = (en, be) => bn() ? be : en;

  // The readings the band can carry, in the order they matter. The full
  // ledger lives in the Bangladesh data panel; this is the short list.
  const fields = [
    ['gdp', 'GDP', 'জিডিপি'],
    ['population', 'Population', 'জনসংখ্যা'],
    ['inflation', 'CPI inflation', 'মূল্যস্ফীতি'],
    ['remittance', 'Remittances', 'প্রবাসী আয়'],
    ['exports', 'Exports', 'রপ্তানি'],
    ['industry', 'Industry share', 'শিল্পখাতের অংশ'],
    ['unemployment', 'Unemployment', 'বেকারত্ব'],
    ['fx-period', 'Official FX annual average', 'সরকারি বার্ষিক গড় বিনিময় হার'],
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
  let serverOffsetMs = 0;

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
    en: { 'USD': 'USD', 'people': 'people', '% GDP': '% of GDP', 'BDT/USD': 'BDT/USD', '%': '%' },
    bn: { 'USD': 'USD', 'people': 'জন', '% GDP': '% জিডিপি', 'BDT/USD': 'টাকা/ডলার', '%': '%' },
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

  /**
   * The country's time, read from the server's clock.
   *
   * Bangladesh keeps a fixed UTC+6 with no daylight saving, so the offset
   * never changes and the reading never needs a timezone database on the
   * client.
   */
  function countryTime() {
    const now = new Date(Date.now() + serverOffsetMs);
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

    // The clock. Always present, always the server's time.
    const clockEl = make('time', '', 'instrument-clock');
    clockEl.setAttribute('role', 'timer');
    clockEl.setAttribute('aria-live', 'off');
    clockEl.title = tr('Bangladesh time · UTC+6', 'বাংলাদেশের সময় · UTC+6');
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
            `Live exchange rate · ${reading.source} · ${reading.period}`,
            `লাভ বিনিময় হার · ${reading.source} · ${reading.period}`,
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
    if (!strip || !desk) return;
    renderBand(strip);

    desk.textContent = '';
    const note = make('p', tr(
      'Bangladesh · national reference data. Annual statistics and the daily exchange rate keep their own reporting dates.',
      'বাংলাদেশ · জাতীয় তথ্যসূত্র। বার্ষিক পরিসংখ্যান ও দৈনিক বিনিময় হারের নিজস্ব তারিখ রয়েছে।',
    ));
    desk.appendChild(note);

    const localClock = make('p', tr('Bangladesh time · UTC+6: ', 'বাংলাদেশের সময় · UTC+6: '));
    localClock.appendChild(make('time', '', 'instrument-clock'));
    desk.appendChild(localClock);

    const rows = make('dl', '');
    const show = (id, reading, isFx = false) => {
      const dt = make('dt', isFx
        ? tr('Daily reference FX · BDT per USD', 'দৈনিক তথ্যসূত্রের বিনিময় হার · প্রতি ডলারে টাকা')
        : label(id));
      const dd = make('dd', '');
      const raw = isFx ? reading?.rate : reading?.value;
      const shown = reading?.status === 'ok' ? format(raw, isFx ? 'rate' : reading.format) : null;
      const unit = isFx ? 'BDT/USD' : reading?.unit;
      const unitText = bn() ? ({ 'USD': 'মার্কিন ডলার', 'people': 'জন', '% GDP': '% জিডিপি', 'BDT/USD': 'টাকা/ডলার' })[unit] || unit || '' : unit || '';
      dd.appendChild(make('strong', shown === null ? tr('Unavailable', 'অনুপলব্ধ') : `${shown} ${unitText}`));
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
      rows.append(dt, dd);
    };
    show('daily-fx', data?.currency, true);
    fields.forEach(([id]) => show(id, data?.macro?.find(r => r.id === id)));
    desk.appendChild(rows);
    clock();
  }

  async function load() {
    try {
      const res = await fetch('/api/atlas/instruments', { signal: AbortSignal.timeout(20000) });
      const body = await res.json();
      if (!Array.isArray(body.macro) || !body.timestamp) throw Error('invalid-national-response');
      data = body;
      // Anchor the clock to the server. The response carries the server's own
      // reading of the time, so the difference between it and this device is
      // the device's error, and correcting for it makes the band the one
      // place in the atlas that is not a matter of opinion.
      serverOffsetMs = new Date(body.timestamp).getTime() - Date.now();
    } catch {
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
