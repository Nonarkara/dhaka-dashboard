// DHKx 3D Atlas Client -- dhaka.nonarkara.org
// Bilingual English/Bengali map engine for Dhaka's urban, environmental and economic layers.

(function () {
  'use strict';

  const maplibregl = window.maplibregl;
  if (!maplibregl) {
    console.error("MapLibre GL is not loaded.");
    return;
  }

  const ATLAS_BUILD_TAG = "dhaka-atlas-20261027-v1";
  const CITY_CENTER = [90.4125, 23.8103];
  const ESRI_IMAGERY = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const OSM_STREETS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  let map = null;
  let currentLens = "city";
  let currentBasemap = "esri";
  let activeOverlayLayer = null;
  let landmarksData = null;
  let riversData = null;
  let transitData = null;
  let economyData = null;
  let areasData = [];

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const LENS_STORIES = {
    city: {
      title: "Read the city, from skyline to street",
      title_bn: "আকাশরেখা থেকে অলিগলি: ঢাকার প্রতিটি স্তরের পাঠ",
      desc: "3D urban form, landmarks and civic topography on satellite basemap.",
      desc_bn: "উপগ্রহ চিত্রে ত্রিমাত্রিক নগর রূপ, ঐতিহাসিক স্থাপত্য ও নাগরিক ভূসংস্থান।"
    },
    rivers: {
      title: "Five Rivers Ring & Flood Risk",
      title_bn: "পাঁচ নদী ও বন্যা ঝুঁকি",
      desc: "Buriganga, Turag, Balu, Shitalakshya and Dhaleshwari with official BWDB danger levels.",
      desc_bn: "পানি উন্নয়ন বোর্ডের (BWDB) বিপদসীমাসহ বুড়িগঙ্গা, তুরাগ, বালু, শীতলক্ষ্যা ও ধলেশ্বরী নদী।"
    },
    economy: {
      title: "Macroeconomic & Industrial Engine",
      title_bn: "অর্থনৈতিক ইঞ্জিন ও শিল্প বেল্ট",
      desc: "RMG export clusters, Savar DEPZ, Adamjee EPZ, Motijheel financial core and wholesale markets.",
      desc_bn: "তৈরি পোশাক রপ্তানি অঞ্চল, সাভার ডিইপিজেড, আদমজী ইপিজেড, মতিঝিল আর্থিক কেন্দ্র ও পাইকারি আড়ত।"
    },
    transit: {
      title: "Dhaka Metro Rail & Transit Spine",
      title_bn: "মেট্রোরেল ও পরিবহন ব্যবস্থা",
      desc: "MRT Line 6 stations, Dhaka Elevated Expressway, central rail stations and Sadarghat launch terminal.",
      desc_bn: "এমআরটি লাইন ৬ স্টেশন, এলিভেটেড এক্সপ্রেসওয়ে, কেন্দ্রীয় রেলওয়ে ও সদরঘাট নদীবন্দর।"
    },
    air: {
      title: "Air Quality & 72h Timeline",
      title_bn: "বায়ুমান ও ৭২ ঘণ্টার পূর্বাভাস",
      desc: "Multi-station PM2.5, PM10 and US AQI monitoring with CAMS 72-hour forecast timeline.",
      desc_bn: "কোপারনিকাস সিএএমএস মডেলের ৭২ ঘণ্টার পূর্বাভাসসহ বহু-স্টেশনভিত্তিক পিএম২.৫ ও একিউআই।"
    },
    haze: {
      title: "Winter Brick Kilns & Smoke Plumes",
      title_bn: "শীতকালীন ইটভাটা ও ধোঁয়া বিস্তার",
      desc: "NASA FIRMS thermal detections in Savar/Gazipur kiln arcs with prevailing wind transport vectors.",
      desc_bn: "সাভার ও গাজীপুরের ইটভাটা বেল্টে নাসার তাপীয় সনাক্তকরণ এবং ধোঁয়া চলাচলের দিকনির্দেশক।"
    },
    heritage: {
      title: "Mughal & Civic Heritage Monuments",
      title_bn: "ঐতিহাসিক ও নাগরিক স্থাপত্য",
      desc: "Lalbagh Fort, Ahsan Manzil, Louis Kahn Parliament, Curzon Hall and Tara Masjid.",
      desc_bn: "লালবাগ কেল্লা, আহসান মঞ্জিল, লুই কানের সংসদ ভবন, কার্জন হল ও তারা মসজিদ।"
    },
    rain: {
      title: "Catchment Rainfall Forecast · 24h",
      title_bn: "ক্যাচমেন্ট বৃষ্টিপাত পূর্বাভাস · ২৪ ঘণ্টা",
      desc: "High-resolution 24-hour precipitation accumulation across Greater Dhaka river basins.",
      desc_bn: "বৃহত্তর ঢাকার নদী অববাহিকায় পরবর্তী ২৪ ঘণ্টার বৃষ্টিপাত পূর্বাভাস।"
    },
    radar: {
      title: "RainViewer Doppler Radar Loop",
      title_bn: "বৃষ্টির ডপলার রাডার লুপ",
      desc: "Live precipitation Doppler radar mosaic over Bengal Delta.",
      desc_bn: "বাংলাদেশ বদ্বীপের ওপর সরাসরি বৃষ্টিপাতের ডপলার রাডার চিত্র।"
    },
    cloud: {
      title: "Satellite Cloud Reflectance",
      title_bn: "উপগ্রহ মেঘমালা",
      desc: "NASA VIIRS daily true-color cloud and atmospheric reflectance.",
      desc_bn: "নাসার উপগ্রহ থেকে গৃহীত দৈনিক মেঘমালা ও আবহাওয়া দৃশ্য।"
    },
    night: {
      title: "NASA Black Marble Night Lights",
      title_bn: "নাসার ব্ল্যাক মার্বেল রাতের আলো",
      desc: "Daily nighttime radiance from Suomi NPP VIIRS Day/Night band.",
      desc_bn: "সুওমি এনপিপির উপগ্রহ চিত্র থেকে রাতের আলোর দীপ্তি ও বিদ্যুতায়ন।"
    },
    water: {
      title: "Satellite Observed Flood Inundation",
      title_bn: "উপগ্রহ পর্যবেক্ষিত বন্যা প্লাবন",
      desc: "MODIS NRT 250m global surface water and flood inundation detection.",
      desc_bn: "মডিস (MODIS) উপগ্রহ উপাত্তভিত্তিক ভূপৃষ্ঠের পানি ও প্লাবন বিস্তার।"
    }
  };

  function initMap() {
    const styleSpec = {
      version: 8,
      sources: {
        "esri-satellite": {
          type: "raster",
          tiles: [ESRI_IMAGERY],
          tileSize: 256,
          attribution: "Esri, Maxar, Earthstar Geographics"
        },
        "osm-streets": {
          type: "raster",
          tiles: [OSM_STREETS],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors"
        }
      },
      layers: [
        {
          id: "basemap-esri",
          type: "raster",
          source: "esri-satellite",
          minzoom: 0,
          maxzoom: 19,
          layout: { visibility: "visible" }
        },
        {
          id: "basemap-osm",
          type: "raster",
          source: "osm-streets",
          minzoom: 0,
          maxzoom: 19,
          layout: { visibility: "none" }
        }
      ]
    };

    map = new maplibregl.Map({
      container: "atlas-map",
      style: styleSpec,
      center: CITY_CENTER,
      zoom: 12.5,
      pitch: 50,
      bearing: 15,
      maxPitch: 75,
      attributionControl: true
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", async () => {
      $("#atlas-map-loading")?.classList.add("loaded");
      await loadDataLayers();
      wireUIEvents();
      pollCityWatch();
    });
  }

  async function loadDataLayers() {
    try {
      // 1. Landmarks
      const resLandmarks = await fetch("/dhaka-landmarks.geojson");
      if (resLandmarks.ok) {
        landmarksData = await resLandmarks.json();
        map.addSource("landmarks", { type: "geojson", data: landmarksData });

        // 3D Landmark Extrusion Points / Markers
        map.addLayer({
          id: "landmarks-points",
          type: "circle",
          source: "landmarks",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 9],
            "circle-color": "#d9583b",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff"
          }
        });

        map.addLayer({
          id: "landmarks-labels",
          type: "symbol",
          source: "landmarks",
          minzoom: 12,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Universa", "Source Sans 3"],
            "text-size": 11,
            "text-offset": [0, 1.2],
            "text-anchor": "top"
          },
          paint: {
            "text-color": "#f5f0dc",
            "text-halo-color": "#0d171d",
            "text-halo-width": 2
          }
        });
      }

      // 2. Rivers & Khals
      const resRivers = await fetch("/dhaka-rivers.geojson");
      if (resRivers.ok) {
        riversData = await resRivers.json();
        map.addSource("rivers", { type: "geojson", data: riversData });

        // River Lines
        map.addLayer({
          id: "rivers-lines",
          type: "line",
          source: "rivers",
          filter: ["==", "$type", "LineString"],
          paint: {
            "line-color": "#257da4",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 8],
            "line-opacity": 0.85
          }
        });

        // BWDB Gauge Points
        map.addLayer({
          id: "rivers-gauges",
          type: "circle",
          source: "rivers",
          filter: ["==", "type", "gauge"],
          paint: {
            "circle-radius": 7,
            "circle-color": "#257da4",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#f5f0dc"
          }
        });
      }

      // 3. Transit & MRT Line 6
      const resTransit = await fetch("/dhaka-mrt.geojson");
      if (resTransit.ok) {
        transitData = await resTransit.json();
        map.addSource("transit", { type: "geojson", data: transitData });

        // MRT Track
        map.addLayer({
          id: "mrt-track",
          type: "line",
          source: "transit",
          filter: ["==", "id", "mrt-line-6-track"],
          paint: {
            "line-color": "#008751",
            "line-width": 5,
            "line-opacity": 0.95
          }
        });

        // Expressway Track
        map.addLayer({
          id: "expressway-track",
          type: "line",
          source: "transit",
          filter: ["==", "id", "elevated-expressway"],
          paint: {
            "line-color": "#e65100",
            "line-width": 4,
            "line-dasharray": [2, 1]
          }
        });

        // Stations
        map.addLayer({
          id: "transit-stations",
          type: "circle",
          source: "transit",
          filter: ["==", "type", "metro_station"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#ffffff",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#008751"
          }
        });
      }

      // 4. Economy & Industry
      const resEconomy = await fetch("/dhaka-economy.geojson");
      if (resEconomy.ok) {
        economyData = await resEconomy.json();
        map.addSource("economy", { type: "geojson", data: economyData });

        map.addLayer({
          id: "economy-hubs",
          type: "circle",
          source: "economy",
          paint: {
            "circle-radius": 7,
            "circle-color": "#10b981",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff"
          }
        });
      }

      // 5. Curated Areas for Quick Jump
      const resAreas = await fetch("/dhaka-areas.json");
      if (resAreas.ok) {
        areasData = await resAreas.json();
        populateQuickJump(areasData);
      }

      setupClickInspectors();
      applyLens(currentLens);
    } catch (e) {
      console.error("Error loading spatial data layers:", e);
    }
  }

  function setupClickInspectors() {
    map.on("click", "landmarks-points", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("landmark", e.features[0].properties);
    });

    map.on("click", "rivers-gauges", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("gauge", e.features[0].properties);
    });

    map.on("click", "transit-stations", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("station", e.features[0].properties);
    });

    map.on("click", "economy-hubs", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("economy", e.features[0].properties);
    });

    // Pointer cursor
    ["landmarks-points", "rivers-gauges", "transit-stations", "economy-hubs"].forEach(layerId => {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    });
  }

  function showInspectionHUD(type, props) {
    const hud = $("#atlas-observation-hud");
    if (!hud) return;

    const isBn = document.documentElement.lang === "bn";
    const name = (isBn && props.name_bn) ? props.name_bn : props.name;
    const desc = (isBn && props.description_bn) ? props.description_bn : (props.description || props.role || "");

    let rowsHtml = "";
    if (type === "gauge") {
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">River:</span><span class="hud-value">${props.river || "Buriganga"}</span></div>
        <div class="hud-row"><span class="hud-label">Station Code:</span><span class="hud-value">${props.station_id || "SW42"}</span></div>
        <div class="hud-row"><span class="hud-label">Danger Level:</span><span class="hud-value">${props.danger_level_m} m MSL</span></div>
        <div class="hud-row"><span class="hud-label">Current Reading:</span><span class="hud-value" style="color:var(--ok)">${props.current_water_level_m} m MSL</span></div>
        <div class="hud-row"><span class="hud-label">Status:</span><span class="hud-value">${props.status} (${props.trend})</span></div>
      `;
    } else if (type === "landmark") {
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">Year / Era:</span><span class="hud-value">${props.year || "Historic"}</span></div>
        <div class="hud-row"><span class="hud-label">Category:</span><span class="hud-value">${props.category}</span></div>
        <div class="hud-row"><span class="hud-label">Height:</span><span class="hud-value">${props.height_m || "15"} m</span></div>
      `;
    } else if (type === "station") {
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">Line:</span><span class="hud-value">${props.line || "Line 6"}</span></div>
        <div class="hud-row"><span class="hud-label">System:</span><span class="hud-value">Dhaka Metro Rail</span></div>
        <div class="hud-row"><span class="hud-label">Operator:</span><span class="hud-value">DMTCL</span></div>
      `;
    } else if (type === "economy") {
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">Sector:</span><span class="hud-value">${props.sector}</span></div>
        ${props.workforce ? `<div class="hud-row"><span class="hud-label">Workforce:</span><span class="hud-value">${Number(props.workforce).toLocaleString()}</span></div>` : ""}
        ${props.annual_export_usd ? `<div class="hud-row"><span class="hud-label">Annual Export:</span><span class="hud-value">$${(props.annual_export_usd / 1e9).toFixed(1)}B</span></div>` : ""}
      `;
    }

    hud.innerHTML = `
      <div class="hud-header">
        <div>
          <h4 class="hud-title">${name}</h4>
          <span class="hud-badge">${type}</span>
        </div>
        <button class="modal-close-btn" onclick="document.getElementById('atlas-observation-hud').hidden = true;">✕</button>
      </div>
      ${rowsHtml}
      <p style="margin:8px 0 0;font-size:11.5px;color:var(--dim);">${desc}</p>
    `;
    hud.hidden = false;
  }

  function applyLens(lensId) {
    currentLens = lensId;
    $$(".atlas-lenses button").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.lens === lensId ? "true" : "false");
    });

    const isBn = document.documentElement.lang === "bn";
    const story = LENS_STORIES[lensId] || LENS_STORIES.city;
    $("#atlas-lens-title").textContent = isBn ? story.title_bn : story.title;
    $("#atlas-lens-description").textContent = isBn ? story.desc_bn : story.desc;

    // Reset raster overlay if active
    if (activeOverlayLayer && map.getLayer(activeOverlayLayer)) {
      map.removeLayer(activeOverlayLayer);
      map.removeSource(activeOverlayLayer);
      activeOverlayLayer = null;
    }

    // Toggle vector layers
    if (map.getLayer("rivers-lines")) {
      map.setLayoutProperty("rivers-lines", "visibility", (lensId === "rivers" || lensId === "city") ? "visible" : "none");
    }
    if (map.getLayer("rivers-gauges")) {
      map.setLayoutProperty("rivers-gauges", "visibility", (lensId === "rivers" || lensId === "city") ? "visible" : "none");
    }
    if (map.getLayer("mrt-track")) {
      map.setLayoutProperty("mrt-track", "visibility", (lensId === "transit" || lensId === "city") ? "visible" : "none");
    }
    if (map.getLayer("expressway-track")) {
      map.setLayoutProperty("expressway-track", "visibility", (lensId === "transit" || lensId === "city") ? "visible" : "none");
    }
    if (map.getLayer("transit-stations")) {
      map.setLayoutProperty("transit-stations", "visibility", (lensId === "transit" || lensId === "city") ? "visible" : "none");
    }
    if (map.getLayer("economy-hubs")) {
      map.setLayoutProperty("economy-hubs", "visibility", (lensId === "economy" || lensId === "city") ? "visible" : "none");
    }
    if (map.getLayer("landmarks-points")) {
      map.setLayoutProperty("landmarks-points", "visibility", (lensId === "heritage" || lensId === "city") ? "visible" : "none");
    }

    // Handle satellite overlays for specific lenses
    const today = new Date().toISOString().split("T")[0];
    if (lensId === "cloud") {
      addRasterOverlay(
        "nasa-cloud",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${today}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
      );
    } else if (lensId === "night") {
      addRasterOverlay(
        "nasa-night",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_ENCC/default/${today}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`
      );
    } else if (lensId === "water") {
      addRasterOverlay(
        "nasa-water",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Combined_Flood_Water_250m/default/${today}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`
      );
    } else if (lensId === "air") {
      addRasterOverlay(
        "nasa-aerosol",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Aerosol_Optical_Depth_Deep_Blue_Daily/default/${today}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`
      );
    }
  }

  function addRasterOverlay(id, tileUrl) {
    if (map.getSource(id)) return;
    map.addSource(id, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256
    });
    map.addLayer({
      id: id,
      type: "raster",
      source: id,
      paint: { "raster-opacity": 0.75 }
    });
    activeOverlayLayer = id;
  }

  function wireUIEvents() {
    // Lens buttons
    $$(".atlas-lenses button").forEach(btn => {
      btn.addEventListener("click", () => applyLens(btn.dataset.lens));
    });

    // Basemap toggle
    $("#atlas-basemap")?.addEventListener("change", e => {
      currentBasemap = e.target.value;
      map.setLayoutProperty("basemap-esri", "visibility", currentBasemap === "esri" ? "visible" : "none");
      map.setLayoutProperty("basemap-osm", "visibility", currentBasemap === "osm" ? "visible" : "none");
    });

    // 2D / 3D toggle
    $("#atlas-view")?.addEventListener("change", e => {
      const is3D = e.target.value === "3d";
      map.easeTo({
        pitch: is3D ? 50 : 0,
        bearing: is3D ? 15 : 0,
        duration: 1000
      });
    });

    // Watch item clicks open detail dialogs
    $("#atlas-watch-flood")?.addEventListener("click", () => {
      $("#flood-dialog")?.showModal();
    });
    $("#atlas-watch-air")?.addEventListener("click", () => {
      $("#air-dialog")?.showModal();
    });
    $("#atlas-watch-traffic")?.addEventListener("click", () => {
      $("#economy-dialog")?.showModal();
    });

    // Search bar
    const searchInput = $("#atlas-search-input");
    searchInput?.addEventListener("keydown", async e => {
      if (e.key === "Enter" && searchInput.value.trim().length >= 2) {
        performSearch(searchInput.value.trim());
      }
    });

    window.addEventListener("atlas:language", () => {
      applyLens(currentLens);
    });
  }

  async function performSearch(query) {
    try {
      const res = await fetch(`/api/atlas/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const first = data.results[0];
        map.flyTo({
          center: [Number(first.lon), Number(first.lat)],
          zoom: 15,
          pitch: 50,
          duration: 1500
        });
      }
    } catch (err) {
      console.warn("Search error:", err);
    }
  }

  function populateQuickJump(areas) {
    const container = $("#quick-jump-grid");
    if (!container) return;
    const isBn = document.documentElement.lang === "bn";
    container.innerHTML = areas.map(a => `
      <button class="jump-btn" data-lat="${a.lat}" data-lng="${a.lng}" data-zoom="${a.zoom}">
        <span class="jump-btn-cat">${a.category}</span>
        <div class="jump-btn-name">${(isBn && a.name_bn) ? a.name_bn : a.name}</div>
      </button>
    `).join("");

    $$("#quick-jump-grid .jump-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const lat = Number(btn.dataset.lat);
        const lng = Number(btn.dataset.lng);
        const zoom = Number(btn.dataset.zoom) || 15;
        map.flyTo({ center: [lng, lat], zoom, pitch: 45, duration: 1500 });
        $("#quick-jump-dialog")?.close();
      });
    });
  }

  async function pollCityWatch() {
    try {
      const res = await fetch("/api/atlas/watch");
      if (!res.ok) return;
      const data = await res.json();
      const ind = data.indicators;
      if (ind) {
        if ($("#atlas-watch-flood-value")) {
          $("#atlas-watch-flood-value").textContent = ind.floodRisk.status_text;
          $("#atlas-watch-flood").dataset.tier = ind.floodRisk.status;
        }
        if ($("#atlas-watch-air-value")) {
          $("#atlas-watch-air-value").textContent = `US AQI ${ind.airQuality.us_aqi} (${ind.airQuality.category})`;
          $("#atlas-watch-air").dataset.tier = ind.airQuality.status;
        }
        if ($("#atlas-watch-wind-value")) {
          $("#atlas-watch-wind-value").textContent = `${ind.weather.condition} · ${ind.weather.wind_vector}`;
          $("#atlas-watch-wind").dataset.tier = ind.weather.status;
        }
        if ($("#atlas-watch-traffic-value")) {
          $("#atlas-watch-traffic-value").textContent = `RMG: ${ind.economy.rmg_run_rate} · DSEX: ${ind.economy.dsex}`;
          $("#atlas-watch-traffic").dataset.tier = "ok";
        }
      }
    } catch (e) {
      console.warn("Poll city watch failed", e);
    }
  }

  document.addEventListener("DOMContentLoaded", initMap);
})();
