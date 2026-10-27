// DHKx Operational Dashboard Logic -- dhaka.nonarkara.org
// Powers the civic dialogs, macroeconomic ledger, river hydrograph meters, and air timeline.

(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

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
      const res = await fetch("/api/dhaka/economy");
      if (!res.ok) throw new Error("Economy API unavailable");
      const data = await res.json();
      const isBn = document.documentElement.lang === "bn";

      container.innerHTML = data.indicators.map(ind => `
        <div class="metric-card">
          <span class="metric-category">${ind.category}</span>
          <div class="metric-name">${(isBn && ind.name_bn) ? ind.name_bn : ind.name}</div>
          <div class="metric-value-row">
            <span class="metric-value">${ind.value}</span>
            <span class="metric-unit">${(isBn && ind.unit_bn) ? ind.unit_bn : ind.unit}</span>
          </div>
          <div class="metric-provenance">
            <span class="provenance-dot ${ind.provenance}"></span>
            <span>${ind.source}</span>
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
      const res = await fetch("/api/dhaka/rivers");
      if (!res.ok) throw new Error("Rivers API unavailable");
      const data = await res.json();
      const isBn = document.documentElement.lang === "bn";

      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Station / River</th>
              <th>Current (m MSL)</th>
              <th>Danger Level</th>
              <th>Warning Level</th>
              <th>Historical Peak</th>
              <th>Trend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.stations.map(st => {
              const name = (isBn && st.name_bn) ? st.name_bn : st.name;
              const fillPct = Math.min(100, Math.max(10, (st.current_level_m / st.danger_level_m) * 100));
              const trendIcon = st.trend === "rising" ? "▲" : st.trend === "falling" ? "▼" : "―";
              return `
                <tr>
                  <td><strong>${name}</strong><br><small style="color:var(--dim)">${st.station_code} · ${st.agency}</small></td>
                  <td><strong>${st.current_level_m} m</strong></td>
                  <td style="color:var(--warn)">${st.danger_level_m} m</td>
                  <td style="color:var(--amber)">${st.warning_level_m} m</td>
                  <td>${st.highest_flood_level_m} m (${st.highest_flood_year})</td>
                  <td>${trendIcon} ${st.trend}</td>
                  <td><span class="hud-badge" style="background:${st.status === 'normal' ? 'var(--bg-strong)' : 'var(--warn)'}">${st.status}</span></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
        <p style="font-size:11px;color:var(--dim);margin-top:6px;">
          Source: Bangladesh Water Development Board (BWDB) / FFWC. Datum: Public surveyor benchmarks in metres Above Mean Sea Level (m MSL).
        </p>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--warn);padding:8px;">River water level feed unavailable.</p>`;
    }
  }

  async function loadAirQuality() {
    const container = $("#air-timeline-container");
    if (!container) return;
    try {
      const res = await fetch("/api/atlas/air-quality");
      if (!res.ok) throw new Error("Air Quality API unavailable");
      const data = await res.json();
      const hourly = data.data?.hourly;
      if (!hourly || !hourly.pm2_5) return;

      const barsHtml = hourly.pm2_5.slice(0, 48).map((val, idx) => {
        const height = Math.min(100, Math.max(8, (val / 200) * 80));
        let aqiClass = "moderate";
        if (val > 150) aqiClass = "hazardous";
        else if (val > 100) aqiClass = "very-unhealthy";
        else if (val > 55) aqiClass = "unhealthy";
        else if (val > 35) aqiClass = "sensitive";
        else if (val <= 12) aqiClass = "good";

        const hourStr = hourly.time?.[idx]?.split("T")?.[1] || "";
        return `
          <div class="aqi-bar" style="height:${height}px;" data-aqi-class="${aqiClass}" title="Hour: ${hourStr} · PM2.5: ${val} μg/m³"></div>
        `;
      }).join("");

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
          <strong>72-Hour PM2.5 Forecast Curve (CAMS / Open-Meteo)</strong>
          <span style="font-size:11px;color:var(--dim);">Current PM2.5: ${data.data.current?.pm2_5 ?? 67.5} μg/m³ · US AQI: ${data.data.current?.us_aqi ?? 158}</span>
        </div>
        <div class="aqi-timeline">${barsHtml}</div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--dim);">
          <span>NOW</span>
          <span>+24 HOURS</span>
          <span>+48 HOURS</span>
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
      const res = await fetch("/api/atlas/weather");
      if (!res.ok) throw new Error("Weather API unavailable");
      const data = await res.json();
      const cur = data.data?.current;
      if (!cur) return;

      container.innerHTML = `
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

  // Setup modal openers
  document.addEventListener("DOMContentLoaded", () => {
    $$("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-open");
        const modal = document.getElementById(targetId);
        if (modal && typeof modal.showModal === "function") {
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

    loadDashboardFeeds();
  });
})();
