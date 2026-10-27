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
            <span>${ind.source} · ${tr("No dated bulletin connected", "তারিখযুক্ত বুলেটিন সংযুক্ত নেই")}</span>
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

      container.innerHTML = `
        <p>${tr("Reference stations only. Current levels and trends are unavailable; no observation feed is connected. Thresholds below are unverified registry values, not a flood warning service.", "শুধু স্টেশনের তথ্যসূত্র। পর্যবেক্ষণ সংযুক্ত না থাকায় বর্তমান পানির স্তর ও প্রবণতা অনুপলব্ধ। নিচের সীমা যাচাইহীন নিবন্ধিত মান; এটি বন্যা সতর্কীকরণ সেবা নয়।")}</p>
        <div class="river-reference-list">${data.stations.map(st => `
          <div class="river-reference-row">
            <strong>${isBn ? st.name_bn : st.name}</strong>
            <span>${tr("Current", "বর্তমান")}: ${tr("Unavailable", "অনুপলব্ধ")}</span>
            <small>${st.station_code} · ${st.agency} · ${tr("Danger", "বিপদসীমা")} ${st.danger_level_m} m · ${tr("Warning", "সতর্কসীমা")} ${st.warning_level_m} m · ${tr("Peak", "সর্বোচ্চ")} ${st.highest_flood_level_m} m (${st.highest_flood_year})</small>
          </div>`).join("")}</div>
        <p><a href="https://ffwc.gov.bd" target="_blank" rel="noopener">BWDB / FFWC ↗</a> · ${tr("Reference datum: m MSL. Observed time: unavailable.", "তথ্যসূত্র একক: m MSL। পর্যবেক্ষণের সময়: অনুপলব্ধ।")}</p>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--warn);padding:8px;">River water level feed unavailable.</p>`;
    }
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
