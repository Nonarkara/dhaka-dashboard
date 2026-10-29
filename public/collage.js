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
    if (m.observationDate) return m.observationDate;
    return tr('no observation', 'পর্যবেক্ষণ নেই');
  }

  function renderDistricts(list) {
    list.innerHTML = '';
    for (const d of collage.districts) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'collage-district';
      button.dataset.id = d.id;
      button.setAttribute('aria-pressed', String(d.id === selected));
      const name = document.createElement('strong');
      name.textContent = bn() ? d.name_bn : d.name;
      const note = document.createElement('small');
      note.textContent = d.headline_bn && bn() ? d.headline_bn : d.headline;
      button.append(name, note);
      button.addEventListener('click', () => {
        selected = d.id;
        render();
      });
      list.appendChild(button);
    }
  }

  function renderDomains(panel, district) {
    panel.innerHTML = '';
    if (!district) {
      panel.innerHTML = `<p class="collage-empty">${tr('Pick a district to read its signals.', 'সংকেত পড়তে একটি এলাকা বেছে নিন।')}</p>`;
      return;
    }
    const heading = document.createElement('div');
    heading.className = 'collage-district-head';
    heading.innerHTML = `<strong>${esc(bn() ? district.name_bn : district.name)}</strong>
      <span>${esc(bn() ? district.headline_bn : district.headline)}</span>`;
    panel.appendChild(heading);

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
          <small>${esc(reading?.reasonCode || 'no-measured-signal-in-domain')}</small>`;
        grid.appendChild(card);
        continue;
      }
      const basis = reading.basis;
      card.dataset.state = 'ok';
      card.innerHTML = `
        <h4>${esc(bn() ? domain.label_bn : domain.label)}</h4>
        <p class="collage-reading">${esc(bn() ? reading.reading_bn : reading.reading)}</p>
        <div class="collage-basis">
          <span>${esc(bn() ? basis.label_bn : basis.label)}</span>
          <span>${esc(display(basis))}</span>
          <span>${esc(when(basis))}</span>
          ${basis.rank ? `<span>${basis.tied
            ? tr(`tied ${basis.rank} of ${basis.of}`, `${basis.of}টির মধ্যে যৌথ ${basis.rank} নম্বর`)
            : tr(`rank ${basis.rank} of ${basis.of}`, `${basis.of}টির মধ্যে ${basis.rank} নম্বর`)}</span>` : ''}
        </div>`;
      grid.appendChild(card);
    }
    panel.appendChild(grid);

    const foot = document.createElement('p');
    foot.className = 'collage-foot';
    foot.textContent = tr(
      `${collage.measured} of ${collage.total} measurements available · measured ${new Date(collage.timestamp).toISOString().slice(0, 10)} · NASA GIBS`,
      `${collage.total}টির মধ্যে ${collage.measured}টি পরিমাপ পাওয়া গেছে · ${new Date(collage.timestamp).toISOString().slice(0, 10)} · NASA GIBS`,
    );
    panel.appendChild(foot);
  }

  function render() {
    const list = $('#collage-districts');
    const panel = $('#collage-domains');
    if (!list || !panel) return;
    if (!collage) {
      list.innerHTML = '';
      panel.innerHTML = `<p class="collage-empty">${tr('Satellite signals are being measured…', 'উপগ্রহ সংকেত পরিমাপ করা হচ্ছে…')}</p>`;
      return;
    }
    if (collage.status === 'unavailable') {
      list.innerHTML = '';
      panel.innerHTML = `<p class="collage-unavailable">${tr('No signal could be measured.', 'কোনো সংকেত পরিমাপ করা যায়নি।')}</p>`;
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
    } catch {
      collage = null;
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
      window.addEventListener('atlas:language', render);
    },
    load,
  };
})();
