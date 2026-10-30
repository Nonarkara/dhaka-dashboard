// DHKx Operational Dashboard Logic -- dhaka.nonarkara.org
// Powers the civic dialogs, macroeconomic ledger, river hydrograph meters, and air timeline.

(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const tr = (en, bn) => document.documentElement.lang === "bn" ? bn : en;

  async function loadDashboardFeeds() {
    loadEconomy();
    loadRivers();
    loadAirQuality();
    loadWeather();
  }

  async function loadEconomy() {
    const container = $("#economy-indicators-grid");
    if (!container) return;
    try {
      const res = await fetch("/api/dhaka/economy", { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Economy API unavailable");
      const data = await res.json();
      const isBn = document.documentElement.lang === "bn";

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
          <p style="margin:4px 0 0;font-size:11px;color:var(--dim);">${(isBn && ind.note_bn) ? ind.note_bn : ind.note}</p>
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
          return `
            <article class="collage-card" data-state="${measured ? "ok" : "unavailable"}">
              <h4>${c.name}</h4>
              <p class="collage-reading">${measured ? `${rate} nW/(cm² sr)` : tr("Not measurable", "মাপা যায়নি")}</p>
              <div class="collage-basis">
                <span>${c.sector}</span>
                ${measured ? `<span>${c.observation_date}</span>` : `<span>${c.reasonCode}</span>`}
                ${c.city_rank ? `<span>${tr(`rank ${c.city_rank} of ${corridors.length}`, `${corridors.length}টির মধ্যে ${c.city_rank} নম্বর`)}</span>` : ''}
              </div>
            </article>`;
        }).join("") : `<p class="collage-unavailable">${tr("No corridor could be measured.", "কোনো করিডোর মাপা যায়নি।")}</p>`;
      }
    } catch (err) {
      container.innerHTML = `<p style="color:var(--warn);padding:8px;">Economic indicators feed unavailable.</p>`;
      const corridorBox = $("#economy-corridors-grid");
      if (corridorBox) corridorBox.innerHTML = `<p class="collage-unavailable">${tr("Corridor signals unavailable.", "করিডোরের সংকেত অনুপলব্ধ।")}</p>`;
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
      if (!res.ok) throw new Error("Air Quality API unavailable");
      const data = await res.json();
      const hourly = data.data?.hourly;
      if (!hourly?.pm2_5?.length) throw new Error("Missing hourly PM2.5");

      const barsHtml = hourly.pm2_5.slice(0, 72).map((val, idx) => {
        if (!Number.isFinite(val)) return `<div class="aqi-bar missing" title="${tr("Unavailable", "অনুপলব্ধ")}"></div>`;
        const height = Math.min(100, Math.max(8, (val / 200) * 80));
        const aqi = hourly.us_aqi?.[idx];
        const aqiClass = !Number.isFinite(aqi) ? "missing" : aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "sensitive" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very-unhealthy" : "hazardous";

        const hourStr = hourly.time?.[idx]?.split("T")?.[1] || "";
        return `
          <div class="aqi-bar" style="height:${height}px;" data-aqi-class="${aqiClass}" title="Hour: ${hourStr} · PM2.5: ${val} μg/m³"></div>
        `;
      }).join("");

      container.innerHTML = `
        <p>${tr("Model valid time (Asia/Dhaka)", "মডেলের কার্যকর সময় (ঢাকা)")}: ${data.data.current?.time ?? tr("Unavailable", "অনুপলব্ধ")}</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
          <strong>${tr("72-hour modeled PM2.5 · CAMS / Open-Meteo", "৭২ ঘণ্টার মডেলভিত্তিক পিএম২.৫ · CAMS / Open-Meteo")}</strong>
          <span style="font-size:11px;color:var(--dim);">Current PM2.5: ${data.data.current?.pm2_5 ?? tr("Unavailable", "অনুপলব্ধ")} μg/m³ · US AQI: ${data.data.current?.us_aqi ?? tr("Unavailable", "অনুপলব্ধ")}</span>
        </div>
        <div class="aqi-timeline">${barsHtml}</div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--dim);">
          <span>NOW</span>
          <span>+24 HOURS</span>
          <span>+48 HOURS</span>
          <span>+72 HOURS</span>
        </div>
        <div class="aqi-action-card" style="margin-top:8px;padding:6px 8px;background:var(--bg-raised);border:1px solid var(--line);font-size:11px;">
          <strong style="text-transform:uppercase;letter-spacing:0.05em;font-family:var(--font-mono);font-size:10px;color:var(--dim);">${tr("Admin action guidance","প্রশাসনিক পদক্ষেপের দিকনির্দেশনা")}</strong>
          <div style="margin-top:4px;">${aqiGuidance(data.data.current?.us_aqi)}</div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--warn);padding:8px;">Air quality timeline feed unavailable.</p>`;
    }
  }

  async function loadWeather() {
    const container = $("#weather-detail-container");
    if (!container) return;
    try {
      const res = await fetch("/api/atlas/weather", { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Weather API unavailable");
      const data = await res.json();
      const cur = data.data?.current;
      if (!cur) throw new Error("Missing current weather");

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
            <span class="metric-value">${cur.wind_speed_10m} <span style="font-size:12px">km/h</span></span>
            <small style="color:var(--dim)">Direction: ${cur.wind_direction_10m}°</small>
          </div>
          <div class="metric-card">
            <span class="metric-category">Surface Pressure</span>
            <span class="metric-value">${cur.surface_pressure} <span style="font-size:12px">hPa</span></span>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--warn);padding:8px;">Weather forecast feed unavailable.</p>`;
    }
  }

  function bootDashboard() {
    $$("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-open");
        const modal = document.getElementById(targetId);
        if (modal && typeof modal.showModal === "function") {
          const menu = document.getElementById("atlas-menu");
          if (menu) menu.open = false;
          modal.showModal();
        }
      });
    });

    $$(".modal-close-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const dialog = btn.closest("dialog");
        if (dialog) dialog.close();
      });
    });

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
