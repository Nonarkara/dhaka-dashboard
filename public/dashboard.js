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
    } catch (err) {
      container.innerHTML = `<p style="color:var(--warn);padding:8px;">Economic indicators feed unavailable.</p>`;
    }
  }

  async function loadRivers() {
    const container = $("#rivers-list-container");
    if (!container) return;
    try {
      const res = await fetch("/api/dhaka/rivers", { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Rivers API unavailable");
      const data = await res.json();
      const isBn = document.documentElement.lang === "bn";

      const tierLabel = (t) => ({ normal: tr("Normal","সাধারণ"), watch: tr("Watch","সতর্ক"), alert: tr("Alert","সতর্ক"), danger: tr("Danger","বিপদ") })[t] || t;
      const tierClass = (t) => `river-tier river-tier-${t}`;

      container.innerHTML = `
        <p>${tr("Modeled flood risk from 24-hour rainfall accumulation plus BWDB danger levels. Live gauge readings are not connected — tiers are a risk proxy, not an official FFWC flood warning.", "২৪ ঘণ্টার বৃষ্টিপাত ও বিউডব্লিউডি বিপদসীমার ওপর ভিত্তি করে মডেলভিত্তিক বন্যা ঝুঁকির স্তর। সরাসরি গেজ পাঠন সংযুক্ত নয় — স্তরগুলি একটি ঝুঁকি প্রক্সি, সরকারি એফএফডাব্লুসি বন্যা সতর্কবার্তা নয়।")}</p>
        <div style="display:flex;gap:8px;margin-bottom:8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">
          <span style="color:var(--ok)">● ${tr("Normal","সাধারণ")}: ${data.summary?.normal ?? 0}</span>
          <span style="color:var(--amber)">● ${tr("Watch","সতর্ক")}: ${data.summary?.watch ?? 0}</span>
          <span style="color:var(--warn)">● ${tr("Alert","সতর্কব군요")}: ${data.summary?.alert ?? 0}</span>
          <span style="color:#dd4027">● ${tr("Danger","বিপদ")}: ${data.summary?.danger ?? 0}</span>
        </div>
        <div class="river-reference-list">${data.stations.map(st => {
          const fr = st.floodRisk || { tier: "normal", reasonCode: null, rain_24h_mm: null, rain_current_mm: null, rainfallStatus: "unavailable", danger_level_m: st.danger_level_m, warning_level_m: st.warning_level_m, note: "" };
          const rainText = fr.rain_24h_mm !== null ? `${fr.rain_24h_mm.toFixed(1)} mm` : tr("Unavailable","অনুপলব্ধ");
          const tierColor = { normal: "var(--ok)", watch: "var(--amber)", alert: "var(--warn)", danger: "#dd4027" }[fr.tier];
          return `
          <div class="river-reference-row">
            <div>
              <strong>${isBn ? st.name_bn : st.name}</strong>
              <span class="river-tier-badge" style="background:${tierColor};color:#000;border-radius:0;padding:1px 6px;font-size:9px;margin-left:6px;">${tierLabel(fr.tier)}</span>
              <span>${tr("Current", "বর্তমান")}: ${tr("Unavailable", "অনুপলব্ধ")}</span>
              <small>${st.station_code} · ${st.agency} · ${tr("Danger", "বিপদসীমা")} ${st.danger_level_m} m · ${tr("24h Rain", "২৪ ঘণ্টা বৃষ্টি")} ${rainText} · ${tr("Rainfall", "বৃষ্টিপাত")} ${fr.rainfallStatus === "ok" ? tr("received","পাওয়া গেছে") : tr("unavailable","অনুপলব্ধ")}</small>
              ${fr.reasonCode ? `<div style="font-size:10px;color:var(--dim);margin-top:2px;">${fr.reasonCode} · ${fr.note || ""}</div>` : ""}
            </div>
          </div>`;
        }).join("")}</div>
        <p><a href="https://ffwc.gov.bd" target="_blank" rel="noopener">BWDB / FFWC ↗</a> · ${tr("Reference datum: m MSL. Observed time: unavailable.", "তথ্যসূত্র একক: m MSL। পর্যবেক্ষণের সময়: অনুপলব্ধ।")}</p>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--warn);padding:8px;">River water level feed unavailable.</p>`;
    }
  }

  function aqiGuidance(aqi, isBn) {
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
      return `<span style="color:#f97316">${tr("Unhealthy for Sensitive Groups — sensitive groups reduce outdoor exertion; schools consider limiting outdoor activity.","সंবেদনশীল গোষ্ঠীর জন্য Assalunhealthy — সংবেদনশীল গোষ্ঠী বাহ্য પરিশ্রম হ্রাস করুন; স্কুল বাহ্য কার্যক্রম সীমিত করার কথা চিন্তা করুন।")}</span>`;
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
          <div style="margin-top:4px;">${aqiGuidance(data.data.current?.us_aqi, isBn)}</div>
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
