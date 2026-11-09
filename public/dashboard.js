// DHKx Operational Dashboard Logic -- dhaka.nonarkara.org
// Powers the civic dialogs, macroeconomic ledger, river hydrograph meters, and air timeline.

(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const tr = (en, bn) => document.documentElement.lang === "bn" ? bn : en;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function readFeedResponse(response) {
    const data = await response.json();
    if (!response.ok || data.status === 'unavailable') {
      throw Object.assign(new Error('Feed unavailable'), {
        reasonCode: data.reasonCode || `http-${response.status}`,
        timestamp: data.timestamp,
      });
    }
    return data;
  }

  function markFeedReady(container) {
    container.dataset.status = 'ok';
    delete container.dataset.reasonCode;
    container.dataset.checkedAt = new Date().toISOString();
  }

  function renderFeedFailure(container, error, en, bn, retry) {
    const reasonCode = typeof error?.reasonCode === 'string' ? error.reasonCode.slice(0, 200)
      : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'request-timeout' : 'feed-unreachable-or-invalid';
    const timestamp = Number.isFinite(Date.parse(error?.timestamp)) ? error.timestamp : new Date().toISOString();
    container.dataset.status = 'unavailable';
    container.dataset.reasonCode = reasonCode;
    container.dataset.checkedAt = timestamp;
    container.innerHTML = `<p>${tr(en, bn)}</p><p><code>${escapeHtml(reasonCode)}</code> · <time>${escapeHtml(timestamp)}</time></p><button type="button" class="atlas-btn" data-feed-retry>${tr('Retry', 'আবার চেষ্টা')}</button>`;
    container.querySelector('[data-feed-retry]')?.addEventListener('click', event => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = tr('Checking source…', 'উৎস যাচাই হচ্ছে…');
      return retry();
    });
  }

  async function loadDashboardFeeds() {
    const referenceLink = $('#parliament-reference-link');
    if (referenceLink) {
      referenceLink.textContent = tr('Parliament design reference ↗', 'সংসদের নকশার রেফারেন্স ↗');
      referenceLink.href = `/parliament-reference.html?lang=${document.documentElement.lang === 'bn' ? 'bn' : 'en'}`;
    }
    loadEconomy();
    loadRivers();
    loadAirQuality();
    loadWeather();
    loadTransitRegistry();
  }

  // ── The transit desk ────────────────────────────────────────────────────
  // The desk is rendered from the network registry, never from a hand-typed
  // table. A hand-typed table claimed sixteen stations while the registry
  // carried seventeen, and named a Sadarghat terminal the registry does
  // not hold. Every number and every name here now comes from the same
  // source the map draws.
  const TRANSIT_TYPES = {
    rapid_transit: { en: 'Elevated Electric Rail', bn: 'উন্নত বৈদ্যুতিক রেল' },
    expressway: { en: 'Grade-separated Expressway', bn: 'আলাদা স্তরে এক্সপ্রেসওয়ে' },
    metro_station: { en: 'Metro station', bn: 'মেট্রো স্টেশন' },
    bus_terminal: { en: 'Bus terminal', bn: 'বাস টার্মিনাল' },
    railway_station: { en: 'Railway station', bn: 'রেলওয়ে স্টেশন' },
  };

  let transitRequest = 0;
  let transitController;

  async function loadTransitRegistry() {
    const body = $('#transit-registry');
    if (!body) return;
    const list = $('#transit-stations-list');
    const requestId = ++transitRequest;
    const language = document.documentElement.lang;
    transitController?.abort();
    transitController = new AbortController();
    const current = () => requestId === transitRequest && language === document.documentElement.lang && body === $('#transit-registry');
    delete body.dataset.reasonCode;
    delete body.dataset.checkedAt;
    body.dataset.status = 'loading';
    body.innerHTML = `<tr><td colspan="3">${tr('Loading transit registry…', 'পরিবহন তথ্যসূত্র লোড হচ্ছে…')}</td></tr>`;
    if (list) list.hidden = true;
    try {
      const response = await fetch('/api/dhaka/transit', { signal: AbortSignal.any([transitController.signal, AbortSignal.timeout(10000)]) });
      const data = await readFeedResponse(response);
      if (!current()) return;
      const features = Array.isArray(data.transit?.features) ? data.transit.features : [];
      if (!features.length) throw Object.assign(new Error('Empty registry'), { reasonCode: 'transit-registry-empty' });

      const isBn = document.documentElement.lang === 'bn';
      const nameOf = f => escapeHtml(isBn && f.properties?.name_bn ? f.properties.name_bn : (f.properties?.name || ''));
      const of = type => features.filter(f => f.properties?.type === type);
      const stations = of('metro_station');
      const busTerminals = of('bus_terminal');
      const railStations = of('railway_station');
      const num = n => new Intl.NumberFormat(isBn ? 'bn-BD' : 'en-GB').format(n);

      const rows = [];

      const rail = of('rapid_transit')[0];
      if (rail) {
        const p = rail.properties;
        const length = Number.isFinite(p.length_km) ? `${num(p.length_km)} km` : '—';
        rows.push(`<tr>
            <td><strong>${nameOf(rail)}</strong>${p.operator ? `<br><small data-language-fixed style="color:var(--dim)">${escapeHtml(p.operator)}</small>` : ''}</td>
            <td>${tr(TRANSIT_TYPES.rapid_transit.en, TRANSIT_TYPES.rapid_transit.bn)}</td>
            <td>${length} · ${num(stations.length)} ${tr('mapped stations (including extension)', 'মানচিত্রভুক্ত স্টেশন (সম্প্রসারণসহ)')}</td>
          </tr>`);
      }

      const expressway = of('expressway')[0];
      if (expressway) {
        const p = expressway.properties;
        const length = Number.isFinite(p.length_km) ? `${num(p.length_km)} km` : '—';
        rows.push(`<tr>
            <td><strong>${nameOf(expressway)}</strong>${p.operator ? `<br><small data-language-fixed style="color:var(--dim)">${escapeHtml(p.operator)}</small>` : ''}</td>
            <td>${tr(TRANSIT_TYPES.expressway.en, TRANSIT_TYPES.expressway.bn)}</td>
            <td>${length}</td>
          </tr>`);
      }

      if (busTerminals.length) {
        rows.push(`<tr>
            <td><strong>${num(busTerminals.length)} ${tr('Bus terminals', 'বাস টার্মিনাল')}</strong><br><small style="color:var(--dim)">${busTerminals.map(nameOf).join(' · ')}</small></td>
            <td>${tr(TRANSIT_TYPES.bus_terminal.en, TRANSIT_TYPES.bus_terminal.bn)}</td>
            <td>${num(busTerminals.length)}</td>
          </tr>`);
      }

      if (railStations.length) {
        rows.push(`<tr>
            <td><strong>${railStations.map(nameOf).join(' · ')}</strong>${railStations[0].properties?.role_bn ? `<br><small style="color:var(--dim)">${escapeHtml(isBn ? railStations[0].properties.role_bn : (railStations[0].properties.role || ''))}</small>` : ''}</td>
            <td>${tr(TRANSIT_TYPES.railway_station.en, TRANSIT_TYPES.railway_station.bn)}</td>
            <td>${num(railStations.length)}</td>
          </tr>`);
      }

      body.innerHTML = rows.join('');
      markFeedReady(body);

      if (list) {
        const items = $('#transit-stations-items');
        const summary = $('#transit-stations-summary');
        if (summary) summary.textContent = `${tr('Mapped stations · includes extension', 'মানচিত্রভুক্ত স্টেশন · সম্প্রসারণসহ')} (${num(stations.length)})`;
        if (items) {
          items.innerHTML = stations.map(f => {
            const p = f.properties;
            const code = p.code ? ` <code>${escapeHtml(p.code)}</code>` : '';
            return `<li>${nameOf(f)}${code}</li>`;
          }).join('');
        }
        list.hidden = stations.length === 0;
      }
    } catch (err) {
      if (!current()) return;
      body.innerHTML = '<tr><td colspan="3"></td></tr>';
      const cell = body.querySelector('td');
      renderFeedFailure(cell, err, 'Transit registry unavailable.', 'পরিবহন তথ্যসূত্র অনুপলব্ধ।', loadTransitRegistry);
      Object.assign(body.dataset, cell.dataset);
      if (list) list.hidden = true;
    }
  }

  async function loadEconomy() {
    const container = $("#economy-indicators-grid");
    if (!container) return;
    try {
      const res = await fetch("/api/dhaka/economy", { signal: AbortSignal.timeout(15000) });
      const data = await readFeedResponse(res);
      if (!Array.isArray(data.indicators)) throw new Error('Missing indicators');
      const isBn = document.documentElement.lang === "bn";

      markFeedReady(container);
      container.innerHTML = data.indicators.map(ind => `
        <div class="metric-card">
          <span class="metric-category">${ind.category}</span>
          <div class="metric-name">${(isBn && ind.name_bn) ? ind.name_bn : ind.name}</div>
          <div class="metric-value-row">
            <span class="metric-value">${ind.value ?? tr("Unavailable", "অনুপলব্ধ")}</span>
            <span class="metric-unit">${(isBn && ind.unit_bn) ? ind.unit_bn : ind.unit}</span>
          </div>
          <div class="metric-provenance">
            <span class="provenance-dot ${ind.provenance}"></span>
            <span>${ind.source}${ind.period ? ` · ${tr("Period","তথ্যকাল")}: ${ind.period}` : ` · ${tr("No dated bulletin connected","তারিখযুক্ত বুলেটিন সংযুক্ত নেই")}`}</span>
          </div>
          <p style="margin:4px 0 0;font-size:var(--text-micro);color:var(--dim);">${(isBn && ind.note_bn) ? ind.note_bn : ind.note}</p>
        </div>
      `).join("");

      // The corridors. These carry a measured night-time radiance rather than
      // the registry figures they used to carry, which had no source and no
      // date: workforce, export value and daily turnover were typed in and
      // read as data. The satellite cannot count workers, but it can say how
      // much light a corridor leaves on, on a stated night.
      const corridorBox = $("#economy-corridors-grid");
      if (corridorBox) {
        const corridors = Array.isArray(data.corridors) ? data.corridors : [];
        corridorBox.innerHTML = corridors.length ? corridors.map(c => {
          const measured = c.status === "ok" && c.night_radiance_nw !== null;
          const rate = measured
            ? new Intl.NumberFormat(isBn ? "bn-BD" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c.night_radiance_nw)
            : tr("Not measurable", "মাপা যায়নি");
          // The registry carries both scripts, so a Bengali reader is not
          // left reading corridor names in English.
          const name = isBn && c.name_bn ? c.name_bn : c.name;
          const sector = isBn && c.sector_bn ? c.sector_bn : c.sector;
          return `
            <article class="collage-card" data-state="${measured ? "ok" : "unavailable"}">
              <h4>${escapeHtml(name)}</h4>
              <p class="collage-reading">${measured ? `${rate} nW/(cm² sr)` : tr("Not measurable", "মাপা যায়নি")}</p>
              <div class="collage-basis">
                <span>${escapeHtml(sector)}</span>
                ${measured ? `<span>${c.observation_date}</span>` : `<span>${c.reasonCode}</span>`}
                ${c.city_rank ? `<span>${tr(`rank ${c.city_rank} of ${corridors.length}`, `${corridors.length}টির মধ্যে ${c.city_rank} নম্বর`)}</span>` : ''}
              </div>
            </article>`;
        }).join("") : `<p class="collage-unavailable">${tr("No corridor could be measured.", "কোনো করিডোর মাপা যায়নি।")}</p>`;
      }
      // The heading must not claim every corridor was measured. The number
      // that was measured is stated beside it.
      const corridorHead = $("#economy-corridors-head");
      if (corridorHead) {
        const corridors = Array.isArray(data.corridors) ? data.corridors : [];
        const measuredCount = corridors.filter(c => c.status === "ok" && c.night_radiance_nw !== null).length;
        corridorHead.textContent = measuredCount === corridors.length && corridors.length
          ? tr("Industrial corridors · measured night radiance", "শিল্প করিডোর · মাপা রাতের আলোক্ষেত্র")
          : tr(
              `Industrial corridors · ${measuredCount} of ${corridors.length} measured for night radiance`,
              `শিল্প করিডোর · রাতের আলোক্ষেত্রে ${corridors.length}টির মধ্যে ${measuredCount}টি মাপা`,
            );
      }
    } catch (err) {
      renderFeedFailure(container, err, 'Economic indicators feed unavailable.', 'অর্থনৈতিক সূচকের তথ্য অনুপলব্ধ।', loadEconomy);
      const corridorBox = $("#economy-corridors-grid");
      if (corridorBox) corridorBox.innerHTML = `<p class="collage-unavailable">${tr("Corridor signals unavailable.", "করিডোরের সংকেত অনুপলব্ধ।")}</p>`;
      const corridorHead = $("#economy-corridors-head");
      if (corridorHead) corridorHead.textContent = tr("Industrial corridors · unavailable", "শিল্প করিডোর · অনুপলব্ধ");
    }
  }

  const planningDisclosure = () => `<details class="planning-evidence" id="planning-evidence"><summary>${tr("Planning evidence & shelter review", "পরিকল্পনার প্রমাণ ও আশ্রয়কেন্দ্র পর্যালোচনা")}</summary><div id="planning-shelter-status" role="status">${tr("Checking source review…", "উৎসের পর্যালোচনা দেখা হচ্ছে…")}</div></details>`;

  async function loadPlanningEvidence(container) {
    const slot=container.querySelector('#planning-shelter-status');
    if(!slot)return;
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    try {
      const response=await fetch('/api/dhaka/shelters',{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('shelter-review-unavailable');
      const data=await response.json(),review=data.source?.structureReview;
      if(!review||!Number.isInteger(data.registerCount)||!Number.isInteger(data.mappableCount))throw Error('invalid-shelter-review');
      if(!slot.isConnected)return;
      const isBn=document.documentElement.lang==='bn';
      const number=value=>Number.isInteger(value)?new Intl.NumberFormat(isBn?'bn-BD':'en-GB').format(value):tr('Unknown','অজানা');
      const time=Number.isFinite(Date.parse(review.retrievedAt))?new Date(review.retrievedAt).toLocaleString(isBn?'bn-BD':'en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'}):tr('Unknown','অজানা');
      slot.dataset.status='reference';
      delete slot.dataset.reasonCode;slot.dataset.checkedAt=new Date().toISOString();
      slot.innerHTML=`<p><strong>${escape(tr(data.studyBoundary?.name,data.studyBoundary?.name_bn))}</strong> · ${tr('1 km cells; not a DNCC/DSCC boundary or evacuation zone.','১ কিমি সেল; DNCC/DSCC সীমানা বা সরিয়ে নেওয়ার এলাকা নয়।')}</p>
        <p>${tr('Legacy river locations, station codes, thresholds and vertical datum remain unverified. Scenario types describe required evidence, not active flood warnings.','আগের নদীর অবস্থান, স্টেশন কোড, বিপদসীমা ও উচ্চতার ভিত্তি এখনও যাচাইহীন। বন্যার ধরন প্রয়োজনীয় প্রমাণ বোঝায়; সক্রিয় সতর্কবার্তা নয়।')}</p>
        <p>${tr('Imported shelter records','আমদানি করা আশ্রয়কেন্দ্রের রেকর্ড')}: <strong>${number(data.registerCount)}</strong> · ${tr('Published pins','প্রকাশিত চিহ্ন')}: <strong>${number(data.mappableCount)}</strong></p>
        <p>${tr('DDM source snapshot','DDM উৎসের স্ন্যাপশট')}: ${number(review.recordCount)} ${tr('records with','রেকর্ডে')} ${number(review.coordinatePairCount)} ${tr('coordinate pairs;','জোড়া স্থানাঙ্ক;')} ${number(review.withinStudyExtentCount)} ${tr('points inside this study extent, unreviewed. These counts do not establish usable shelters or municipal coverage.','বিন্দু এই অধ্যয়ন এলাকায়, এখনও পর্যালোচনা হয়নি। এই সংখ্যা ব্যবহারযোগ্য আশ্রয়কেন্দ্র বা পৌর এলাকার আওতা প্রতিষ্ঠা করে না।')}</p>
        <p>${tr('Source retrieved','উৎস সংগ্রহ')}: ${escape(time)} · ${tr('Dhaka time. Source update date, location accuracy, readiness and reuse terms remain unverified.','ঢাকার সময়। উৎসের হালনাগাদের তারিখ, অবস্থানের নির্ভুলতা, প্রস্তুতি ও পুনর্ব্যবহারের শর্ত যাচাই হয়নি।')}</p>
        <a href="https://rapid.ddm.gov.bd/service/shelter_info" target="_blank" rel="noopener">${tr('DDM source page','DDM উৎসের পাতা')} ↗</a>`;
    } catch {
      if(!slot.isConnected)return;
      slot.dataset.status='unavailable';slot.dataset.reasonCode='shelter-review-unavailable';slot.dataset.checkedAt=new Date().toISOString();
      slot.innerHTML=`<p>${tr('Shelter source review unavailable. No shelter availability is established.','আশ্রয়কেন্দ্রের উৎসের পর্যালোচনা অনুপলব্ধ। কোনো আশ্রয়কেন্দ্রের প্রাপ্যতা প্রতিষ্ঠিত নয়।')}</p><button type="button" class="atlas-btn" id="planning-review-retry">${tr('Retry source review','আবার উৎসের পর্যালোচনা দেখুন')}</button>`;
      slot.querySelector('#planning-review-retry').onclick=()=>loadPlanningEvidence(container);
    }
  }

  async function loadRivers() {
    const container = $("#rivers-list-container");
    if (!container) return;
    container.innerHTML=`<p>${tr("Flood assessment unavailable. Gauge observations and validated warning thresholds are not connected. Rainfall below is a point forecast, not catchment rainfall or a flood warning.", "বন্যা মূল্যায়ন অনুপলব্ধ। গেজ পর্যবেক্ষণ ও যাচাইকৃত সতর্কসীমা সংযুক্ত নেই। নিচের বৃষ্টি নির্দিষ্ট স্থানের পূর্বাভাস; অববাহিকার বৃষ্টিপাত বা বন্যার সতর্কবার্তা নয়।")}</p>${planningDisclosure()}<div id="river-readings"><p role="status">${tr('Checking rainfall references…','বৃষ্টির তথ্যসূত্র দেখা হচ্ছে…')}</p></div>`;
    const readings=container.querySelector('#river-readings');
    loadPlanningEvidence(container);
    try {
      const res = await fetch("/api/dhaka/rivers", { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!Array.isArray(data.stations)) throw new Error("Invalid river registry");
      if(!readings.isConnected)return;
      const isBn = document.documentElement.lang === "bn";
      const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const date = value => value ? new Date(value).toLocaleString(isBn ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) : tr("Unavailable", "অনুপলব্ধ");
      readings.innerHTML = `
        <div class="river-reference-list">${data.stations.map(st => {
          const rain = st.rainfall || {};
          const available = rain.status === "ok" && Number.isFinite(rain.value);
          const value = available ? `${new Intl.NumberFormat(isBn ? "bn-BD" : "en-GB", { maximumFractionDigits: 1 }).format(rain.value)} mm` : tr("Unavailable", "অনুপলব্ধ");
          return `<div class="river-reference-row"><div>
            <strong>${escape(isBn ? st.name_bn : st.name)}</strong>
            <span>${tr("Gauge reading", "গেজের পাঠ")}: ${tr("Unavailable", "অনুপলব্ধ")}</span>
            <span>${tr("24-hour modeled point rain", "২৪ ঘণ্টার মডেলভিত্তিক স্থানীয় বৃষ্টি")}: ${value}</span>
            ${available ? `<small>${tr("Valid", "প্রযোজ্য সময়")}: ${escape(date(rain.validFrom))} – ${escape(date(rain.validTo))} · ${tr("Dhaka time", "ঢাকার সময়")}</small>` : `<small data-language-fixed>${escape(rain.reasonCode || "rainfall-unavailable")}</small>`}
            ${rain.query ? `<small>${available ? tr("Retrieved", "সংগ্রহ") : tr("Attempted", "চেষ্টার সময়")}: ${escape(date(rain.retrievedAt))} · ${escape(rain.source || "Open-Meteo")}</small>` : `<small>${tr("No linked rainfall query", "বৃষ্টির অনুসন্ধান সংযুক্ত নেই")}</small>`}
            ${rain.query ? `<small>${tr("Query point", "অনুসন্ধানের স্থান")}: ${escape(rain.query.latitude)}, ${escape(rain.query.longitude)} · ${tr("Gauge match unvalidated", "গেজের সঙ্গে মিল যাচাই করা হয়নি")}</small>` : ""}
            <small>${escape(st.station_code)} · ${escape(st.agency)} · ${tr("Unverified registry danger level", "যাচাইহীন তালিকার বিপদসীমা")}: ${escape(st.danger_level_m)} m · ${tr('Vertical datum unverified','উচ্চতার ভিত্তি যাচাইহীন')}</small>
          </div></div>`;
        }).join("")}</div>
        <p><a href="https://ffwc.gov.bd" target="_blank" rel="noopener">BWDB / FFWC ↗</a> · <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo ↗</a></p>
      `;
    } catch (err) {
      if(readings.isConnected)readings.innerHTML = `<p>${tr("River readings and rainfall unavailable. Flood assessment unavailable.", "নদীর পাঠ ও বৃষ্টিপাত অনুপলব্ধ। বন্যা মূল্যায়ন অনুপলব্ধ।")}</p>`;
    }
  }

  function aqiGuidance(aqi) {
    if (typeof aqi !== "number" || !Number.isFinite(aqi)) {
      return `<span style="color:var(--dim)">${tr("No AQI data — cannot determine action.","একিউআই তথ্য নেই — পদক্ষেপ নির্ধারিত করা যায় না।")}</span>`;
    }
    if (aqi <= 50) {
      return `<span style="color:var(--ok)">${tr("Good — no action needed.","ভালো — কোনো পদক্ষেপের প্রয়োজন নেই।")}</span>`;
    }
    if (aqi <= 100) {
      return `<span style="color:var(--amber)">${tr("Moderate — sensitive people reduce prolonged outdoor exertion.","মধ্যম — সংবেদনশীল ব্যক্তিরা দীর্ঘ বাহ্য পরিশ্রম হ্রাস করুন।")}</span>`;
    }
    if (aqi <= 150) {
      return `<span style="color:#f97316">${tr("Unhealthy for Sensitive Groups — sensitive groups reduce outdoor exertion; schools consider limiting outdoor activity.","সংবেদনশীল গোষ্ঠীর জন্য অস্বাস্থ্যকর — বাইরে পরিশ্রম কমান; স্কুলে বাইরের কার্যক্রম সীমিত করার কথা বিবেচনা করুন।")}</span>`;
    }
    if (aqi <= 200) {
      return `<span style="color:var(--warn)">${tr("Unhealthy — everyone reduce prolonged outdoor exertion; consider mask use; restrict construction and brick kiln operations.","অস্বাস্থ্যকর — সবাই দীর্ঘ বাহ্য পরিশ্রম হ্রাস করুন; মাস্ক ব্যবহার বিবেচনা করুন; নির্মাণ ও ইটভাটা কার্যক্রম সীমিত করুন।")}</span>`;
    }
    if (aqi <= 300) {
      return `<span style="color:#8b5cf6">${tr("Very Unhealthy — avoid prolonged outdoor exertion; use masks; schools consider closing; restrict traffic and industrial emissions.","খুব অস্বাস্থ্যকর — দীর্ঘ বাহ্য পরিশ্রম এড়িয়ে চলুন; মাস্ক ব্যবহার করুন; স্কুল বন্ধ করার কথা চিন্তা করুন; যানবাহন ও শিল্প নিঃসরণ সীমিত করুন।")}</span>`;
    }
    return `<span style="color:#7e22ce">${tr("Hazardous — avoid all outdoor exertion; emergency alerts; suspend non-essential outdoor work and traffic.","বিপজ্জনক — সব বাহ্য পরিশ্রম এড়িয়ে চলুন; জরুরি সতর্কবার্তা; অপরিহার্য নয় এমন বাহ্য কাজ ও যানবাহন বন্ধ করুন।")}</span>`;
  }

  async function loadAirQuality() {
    const container = $("#air-timeline-container");
    if (!container) return;
    try {
      const res = await fetch("/api/atlas/air-quality", { signal: AbortSignal.timeout(15000) });
      const data = await readFeedResponse(res);
      const hourly = data.data?.hourly;
      if (!hourly?.pm2_5?.length) throw new Error("Missing hourly PM2.5");

      const samples = hourly.pm2_5.slice(0, 72).map((value, idx) => ({ value, aqi: hourly.us_aqi?.[idx], time: hourly.time?.[idx] }));
      const displayTime = time => {
        // Upstream sends local wall-clock strings with its declared timezone.
        // Do not parse them in the visitor's timezone and silently move the hour.
        const match = typeof time === 'string' && /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(time);
        return match ? `${match[1]} ${match[2]}` : tr('Unavailable', 'অনুপলব্ধ');
      };
      const displayNumber = value => Number.isFinite(value)
        ? new Intl.NumberFormat(document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB', { maximumFractionDigits: 2 }).format(value)
        : tr('Unavailable', 'অনুপলব্ধ');
      const barsHtml = samples.map(({ value: val, aqi, time }) => {
        if (!Number.isFinite(val)) return `<div class="aqi-bar missing" title="${tr("Unavailable", "অনুপলব্ধ")}"></div>`;
        const height = Math.min(100, Math.max(8, (val / 200) * 80));
        const aqiClass = !Number.isFinite(aqi) ? "missing" : aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "sensitive" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very-unhealthy" : "hazardous";
        return `
          <div class="aqi-bar" style="height:${height}px;" data-aqi-class="${aqiClass}" title="${escapeHtml(displayTime(time))} · PM2.5: ${displayNumber(val)} μg/m³"></div>
        `;
      }).join("");
      const rowsHtml = samples.map(({ value, aqi, time }) => `<tr><th scope="row">${escapeHtml(displayTime(time))}</th><td>${displayNumber(value)}</td><td>${displayNumber(aqi)}</td></tr>`).join('');
      const finiteMean = values => {
        const clean = values.filter(Number.isFinite);
        return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
      };
      const firstWindow = finiteMean(samples.slice(0, 24).map(s => s.value));
      const nextWindow = finiteMean(samples.slice(24, 48).map(s => s.value));
      const deltaPct = firstWindow && nextWindow ? ((nextWindow - firstWindow) / firstWindow) * 100 : null;
      const trendArrow = deltaPct === null ? "" : deltaPct > 5 ? "↑" : deltaPct < -5 ? "↓" : "→";
      const trendText = deltaPct === null
        ? tr("Next-24h comparison unavailable", "পরবর্তী ২৪ ঘণ্টার তুলনা অনুপলব্ধ")
        : `${trendArrow} ${displayNumber(Math.abs(deltaPct))}% ${tr("vs first 24h", "প্রথম ২৪ ঘণ্টার তুলনায়")}`;

      markFeedReady(container);
      container.innerHTML = `
        <p>${tr("Model valid time (Asia/Dhaka)", "মডেলের কার্যকর সময় (ঢাকা)")}: ${data.data.current?.time ?? tr("Unavailable", "অনুপলব্ধ")}</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
          <strong>${tr("72-hour modeled PM2.5 · CAMS / Open-Meteo", "৭২ ঘণ্টার মডেলভিত্তিক পিএম২.৫ · CAMS / Open-Meteo")}</strong>
          <span style="font-size:var(--text-micro);color:var(--dim);">Current PM2.5: ${data.data.current?.pm2_5 ?? tr("Unavailable", "অনুপলব্ধ")} μg/m³ · US AQI: ${data.data.current?.us_aqi ?? tr("Unavailable", "অনুপলব্ধ")}</span>
        </div>
        <div class="air-trend-line">
          <span class="air-trend-arrow" aria-hidden="true">${trendArrow}</span>
          <span>${trendText}</span>
        </div>
        <div class="aqi-timeline" aria-hidden="true">${barsHtml}<span class="aqi-guideline" title="${tr("WHO 24h PM2.5 guideline 15 μg/m³", "ডব্লিউএইচও ২৪ ঘণ্টার পিএম২.৫ নির্দেশিকা ১৫ μg/m³")}"></span></div>
        <div class="air-chart-axis">
          <time>${escapeHtml(displayTime(samples[0]?.time))}</time>
          <time>${escapeHtml(displayTime(samples.at(-1)?.time))}</time>
        </div>
        <details class="air-data-table"><summary>${tr('Hourly values and dates', 'ঘণ্টাভিত্তিক মান ও তারিখ')}</summary>
          <table><caption>${tr('Modeled values · Asia/Dhaka · missing values remain unavailable.', 'মডেলভিত্তিক মান · ঢাকা · অনুপস্থিত মান অনুপলব্ধ থাকে।')}</caption>
            <thead><tr><th scope="col">${tr('Valid time', 'কার্যকর সময়')}</th><th scope="col">PM2.5 · μg/m³</th><th scope="col">${tr('US AQI', 'মার্কিন একিউআই')}</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </details>
        <div class="aqi-action-card" style="margin-top:8px;padding:6px 8px;background:var(--bg-raised);border:1px solid var(--line);font-size:var(--text-micro);">
          <strong style="text-transform:uppercase;letter-spacing:0.05em;font-family:var(--font-mono);font-size:var(--text-micro);color:var(--dim);">${tr("Admin action guidance","প্রশাসনিক পদক্ষেপের দিকনির্দেশনা")}</strong>
          <div style="margin-top:4px;">${aqiGuidance(data.data.current?.us_aqi)}</div>
        </div>
      `;
    } catch (err) {
      renderFeedFailure(container, err, 'Air quality timeline feed unavailable.', 'বায়ুমানের সময়রেখার তথ্য অনুপলব্ধ।', loadAirQuality);
    }
  }

  async function loadWeather() {
    const container = $("#weather-detail-container");
    if (!container) return;
    try {
      const res = await fetch("/api/atlas/weather", { signal: AbortSignal.timeout(15000) });
      const data = await readFeedResponse(res);
      const cur = data.data?.current;
      if (!cur) throw new Error("Missing current weather");

      markFeedReady(container);
      container.innerHTML = `
        <p>${tr("Modeled weather · Open-Meteo · Asia/Dhaka", "মডেলভিত্তিক আবহাওয়া · Open-Meteo · ঢাকা")}: ${cur.time}</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;margin-bottom:12px;">
          <div class="metric-card">
            <span class="metric-category">Temperature</span>
            <span class="metric-value">${cur.temperature_2m}°C</span>
            <small style="color:var(--dim)">Feels like ${cur.apparent_temperature}°C</small>
          </div>
          <div class="metric-card">
            <span class="metric-category">Humidity</span>
            <span class="metric-value">${cur.relative_humidity_2m}%</span>
          </div>
          <div class="metric-card">
            <span class="metric-category">Wind Speed</span>
            <span class="metric-value">${cur.wind_speed_10m} <span style="font-size:var(--text-body)">km/h</span></span>
            <small style="color:var(--dim)">Direction: ${cur.wind_direction_10m}°</small>
          </div>
          <div class="metric-card">
            <span class="metric-category">Surface Pressure</span>
            <span class="metric-value">${cur.surface_pressure} <span style="font-size:var(--text-body)">hPa</span></span>
          </div>
        </div>
      `;
    } catch (err) {
      renderFeedFailure(container, err, 'Weather forecast feed unavailable.', 'আবহাওয়ার পূর্বাভাসের তথ্য অনুপলব্ধ।', loadWeather);
    }
  }

  function wireDialogControls() {
    const menu = $('#atlas-menu');
    const summary = menu?.querySelector('summary');
    const menuBody = menu?.querySelector('.atlas-menu-body');
    const fitMenuToViewport = () => {
      if (!menu?.open || !menuBody) return;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      menuBody.style.maxHeight = `${Math.max(0, Math.floor(viewportHeight - menuBody.getBoundingClientRect().top - 8))}px`;
    };
    menu?.addEventListener('toggle', fitMenuToViewport);
    window.addEventListener('resize', fitMenuToViewport);
    window.visualViewport?.addEventListener('resize', fitMenuToViewport);
    window.addEventListener('atlas:language', fitMenuToViewport);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !menu?.open) return;
      menu.open = false;
      summary?.focus();
      event.preventDefault();
    });
    document.addEventListener('pointerdown', event => {
      if (!menu?.open || menu.contains(event.target)) return;
      const focusWasInMenu = menu.contains(document.activeElement);
      menu.open = false;
      if (focusWasInMenu) summary?.focus();
    });
    $$("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-open");
        const modal = document.getElementById(targetId);
        if (modal && typeof modal.showModal === "function") {
          modal._atlasReturnFocus = menu?.contains(btn) ? summary : btn;
          if (menu) menu.open = false;
          modal.showModal();
        }
        // The transit desk reads the network registry when it is opened, so
        // the table it shows is the registry and not a copy of it.
        if (targetId === "transit-dialog") loadTransitRegistry();
      });
    });
    const transitDialog = document.getElementById("transit-dialog");
    if (transitDialog) {
      transitDialog.addEventListener("close", () => {
        transitDialog._atlasReturnFocus?.focus();
        transitDialog._atlasReturnFocus = null;
      });
    }
    $$('dialog').forEach(dialog => dialog.addEventListener('close', () => {
      dialog._atlasReturnFocus?.focus();
      dialog._atlasReturnFocus = null;
    }));

    $$(".modal-close-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const dialog = btn.closest("dialog");
        if (dialog) dialog.close();
      });
    });
  }

  function bootDashboard() {
    wireDialogControls();

    $("#download-geojson-btn")?.addEventListener("click", () => {
      window.location.href = "/api/atlas/export";
    });

    window.addEventListener("atlas:language", loadDashboardFeeds);
    loadDashboardFeeds();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootDashboard);
  } else {
    bootDashboard();
  }
})();
