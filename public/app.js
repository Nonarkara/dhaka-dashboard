// DHKx 3D Atlas Client -- dhaka.nonarkara.org
// Bilingual English/Bengali map engine for Dhaka's urban, environmental and economic layers.

(function () {
  'use strict';

  const ATLAS_BUILD_TAG = "dhaka-atlas-20261028-1793168305-4da0edf";
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
  let loadingHidden = false;
  let bootAttempts = 0;
  let watchData = null;
  let parliamentSnapshot = null;
  let parliamentSourceReady = false;
  const tr = (en, bn) => document.documentElement.lang === "bn" ? bn : en;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function hideLoading() {
    if (loadingHidden) return;
    loadingHidden = true;
    const el = $("#atlas-map-loading");
    if (el) el.classList.add("loaded");
  }

  const LENS_STORIES = {
    city: {
      title: "Read the city, from skyline to street",
      title_bn: "আকাশরেখা থেকে অলিগলি: ঢাকার প্রতিটি স্তরের পাঠ",
      desc: "Zoom in for building footprints; select a feature for source details.",
      desc_bn: "ভবনের রূপ দেখতে জুম করুন; উৎসের তথ্য পেতে স্থাপনা নির্বাচন করুন।"
    },
    rivers: {
      title: "Northeast River Outlook & Dhaka References",
      title_bn: "উত্তর-পূর্বের নদী পূর্বাভাস ও ঢাকার তথ্যসূত্র",
      desc: "GloFAS daily discharge at northeast model reaches; Dhaka reference gauges have no connected observations. Discharge is not an inundation forecast.",
      desc_bn: "উত্তর-পূর্বের নদীখণ্ডে GloFAS দৈনিক প্রবাহ; ঢাকার তথ্যসূত্র স্টেশনের পর্যবেক্ষণ সংযুক্ত নেই। প্রবাহ প্লাবনের পূর্বাভাস নয়।"
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
      title: "Regional PM2.5 Forecast Playback",
      title_bn: "আঞ্চলিক পিএম২.৫ পূর্বাভাসের চলচিত্র",
      desc: "CAMS global PM2.5 model cells at approximately 45 km, shown in native three-hour steps for the next 48 hours. Not street-level measurements.",
      desc_bn: "প্রায় ৪৫ কিমি সেলে CAMS বৈশ্বিক পিএম২.৫ মডেল; আগামী ৪৮ ঘণ্টার মূল ৩ ঘণ্টা ধাপ। রাস্তার সরাসরি পরিমাপ নয়।"
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
    aerosol: {
      title: "NASA Satellite Aerosol Optical Depth (AOD)",
      title_bn: "নাসা উপগ্রহ এরোসল অপটিক্যাল ডেপথ (AOD)",
      desc: "Daily NASA MODIS MAIAC aerosol optical depth — atmospheric particulate loading and smoke density over the Bengal Basin.",
      desc_bn: "দৈনিক নাসা মডিস মায়াক এরোসল অপটিক্যাল ডেপথ — বাংলাদেশ অববাহিকার বায়ুমণ্ডলীয় কণা ও ধোঁয়ার ঘনত্ব।"
    },
    night: {
      title: "NASA VIIRS Night Lights",
      title_bn: "নাসার ভিআইআইআরএস রাতের আলো",
      desc: "Daily night-time radiance from the Suomi NPP VIIRS Day/Night Band over Greater Dhaka.",
      desc_bn: "সুওমি এনপিপি ভিআইআইআরএস ডে/নাইট ব্যান্ড থেকে বৃহত্তর ঢাকার দৈনিক রাতের দীপ্তি।"
    },
    water: {
      title: "Satellite Observed Flood Inundation",
      title_bn: "উপগ্রহ পর্যবেক্ষিত বন্যা প্লাবন",
      desc: "Daily NASA VIIRS combined flood detection, 1-day window, for the Bengal Delta.",
      desc_bn: "দৈনিক নাসা ভিআইআইআরএস যৌথ বন্যা শনাক্তকরণ, ১ দিনের জানালা — বাংলাদেশ বদ্বীপ।"
    }
  };

  function initMap() {
    const maplibregl = window.maplibregl;
    if (!maplibregl || typeof maplibregl.Map !== "function") {
      if (++bootAttempts < 80) setTimeout(initMap, 100);
      else showMapFailure();
      return;
    }

    const styleSpec = {
      version: 8,
      light: {
        anchor: "viewport",
        color: "#f5f0dc",
        intensity: 0.55,
        position: [1.3, 110, 45]
      },
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        "buildings": { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenStreetMap · OpenFreeMap / OpenMapTiles" },
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

    styleSpec.layers.push({
      id: "city-buildings", type: "fill-extrusion", source: "buildings", "source-layer": "building", minzoom: 14,
      filter: ["!", ["has", "hide_3d"]],
      paint: buildingPaint("render_height", "render_min_height")
    });

    try {
      map = new maplibregl.Map({
        container: "atlas-map",
        style: styleSpec,
        center: CITY_CENTER,
        zoom: 12.5,
        pitch: 50,
        bearing: 15,
        maxPitch: 75,
        minZoom: 9,
        renderWorldCopies: false,
        attributionControl: true
      });

      map.on("move", syncBuildingVisibility);
      map.on("moveend", syncBuildingVisibility);
      map.on("zoomend", syncBuildingVisibility);
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

      // Dismiss overlay when map renders or on error
      map.on("load", async () => {
        hideLoading();
        window.AtlasForecast?.attach(map);
        await Promise.all([loadDataLayers(), loadParliamentBuildings()]);
      });

      map.on("idle", hideLoading);
      map.on("render", () => {
        if (map.loaded()) hideLoading();
      });
      map.on("error", (e) => {
        if (e.sourceId === "parliament-detail") { parliamentSourceReady = false; syncBuildingVisibility(); }
        console.warn("[atlas] map notice:", e);
        const status = $("#atlas-layer-status");
        if (status) { status.hidden = false; status.textContent = tr("A map source is unavailable. Visible reference layers remain usable.", "মানচিত্রের একটি উৎস অনুপলব্ধ। দৃশ্যমান তথ্যসূত্র স্তর ব্যবহারযোগ্য।"); }
      });

      // Hard timeout failsafe so loading overlay NEVER gets stuck
      setTimeout(() => {
        if (!loadingHidden) showMapFailure();
      }, 12000);
    } catch (e) {
      console.error("Map initialization error:", e);
      showMapFailure();
    }
  }

  function showMapFailure() {
    const el = $("#atlas-map-loading");
    if (el) { el.classList.remove("loaded"); el.innerHTML = `<strong>${tr("Map unavailable", "মানচিত্র অনুপলব্ধ")}</strong><p>${tr("Map initialization failed. Reload to retry; civic data remains available from City watch.", "মানচিত্র চালু হয়নি। আবার চেষ্টা করতে রিলোড করুন; নগর পর্যবেক্ষণে তথ্য পাওয়া যাবে।")}</p><button class="atlas-btn" onclick="location.reload()">${tr("Retry", "আবার চেষ্টা")}</button>`; }
  }

  function buildingPaint(heightKey, baseKey) {
    const base = ["max", 0, ["to-number", ["get", baseKey], 0]];
    return {
      "fill-extrusion-color": window.DhakaDesign?.paint || "#b4b0a3",
      "fill-extrusion-height": ["case", [">", ["to-number", ["get", heightKey], 0], base], ["to-number", ["get", heightKey], 0], ["+", base, 6]],
      "fill-extrusion-base": base,
      "fill-extrusion-opacity": 0.9
    };
  }

  function syncBuildingVisibility() {
    if (!map) return;
    const is3D = $("#atlas-view")?.value !== "2d";
    // Never mask batched polygon tiles by ID or unsupported polygon `within`.
    // Switch the whole layer only when the whole viewport fits inside detail coverage.
    let useSnapshot = false;
    if (parliamentSourceReady && parliamentSnapshot && map.getZoom() >= 16) {
      const bounds = map.getBounds();
      const [west, south, east, north] = parliamentSnapshot.bbox;
      const guard = 0.0005; // ~50 m skyline margin beyond the ground viewport.
      useSnapshot = bounds.getWest() > west + guard && bounds.getSouth() > south + guard
        && bounds.getEast() < east - guard && bounds.getNorth() < north - guard;
    }
    for (const [id, visible] of [["city-buildings", is3D && !useSnapshot], ["parliament-buildings", is3D && useSnapshot]]) {
      const visibility = visible ? "visible" : "none";
      if (map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== visibility) map.setLayoutProperty(id, "visibility", visibility);
    }
    const desc = $("#atlas-lens-description");
    if (desc) {
      const story = LENS_STORIES[currentLens] || LENS_STORIES.city;
      const base = tr(story.desc, story.desc_bn);
      const note = is3D ? useSnapshot
        ? tr("3D: dated OSM detail; heights mapped or estimated.", "৩ডি: তারিখযুক্ত OSM বিস্তারিত; উচ্চতা নথিভুক্ত বা আনুমানিক।")
        : tr("3D: OSM blocks; heights mapped or estimated.", "৩ডি: OSM ভবন; উচ্চতা নথিভুক্ত বা আনুমানিক।") : "";
      const text = base + (note ? " " + note : "");
      if (desc.textContent !== text) desc.textContent = text;
    }
  }

  async function loadParliamentBuildings() {
    try {
      const res = await fetch("/data/parliament-buildings.geojson", { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("detail-footprints-unavailable");
      const data = await res.json();
      if (data.type !== "FeatureCollection" || !data.features?.length || data.bbox?.length !== 4
        || !data.features.some(f => f.id === "relation/18085267")) throw new Error("invalid-detail-footprints");
      data.features.forEach(f => { f.properties.use_class = window.DhakaDesign?.classify(f.properties) || "unknown"; });
      parliamentSnapshot = data;
      const onData = event => {
        if (event.sourceId === "parliament-detail" && event.isSourceLoaded) {
          parliamentSourceReady = true;
          map.off("sourcedata", onData);
          syncBuildingVisibility();
        }
      };
      map.on("sourcedata", onData);
      map.addSource("parliament-detail", { type: "geojson", data,
        attribution: `© OpenStreetMap · detail ${data.metadata.retrieved_at.slice(0, 10)} · ODbL` });
      map.addLayer({ id: "parliament-buildings", type: "fill-extrusion", source: "parliament-detail", minzoom: 14,
        layout: { visibility: "none" }, paint: buildingPaint("height_m", "min_height_m") }, "city-buildings");
      // The source can finish before the layer is attached.
      if (map.isSourceLoaded("parliament-detail")) { parliamentSourceReady = true; syncBuildingVisibility(); }
      map.on("click", "parliament-buildings", event => {
        if (event.features?.[0]) showInspectionHUD("building", event.features[0].properties);
      });
    } catch (error) {
      parliamentSourceReady = false;
      syncBuildingVisibility();
      console.warn("Parliament detail unavailable; retaining streamed buildings", error);
    }
  }

  async function loadDataLayers() {
    // 1. Landmarks
    try {
      const resLandmarks = await fetch("/dhaka-landmarks.geojson", { signal: AbortSignal.timeout(10000) });
      if (resLandmarks.ok) {
        landmarksData = await resLandmarks.json();
        if (!map.getSource("landmarks")) {
          map.addSource("landmarks", { type: "geojson", data: landmarksData });

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
              "text-font": ["Noto Sans Regular"],
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
      }
    } catch (e) {
      console.warn("Could not load landmarks layer:", e);
    }

    // 2. Rivers & Khals
    try {
      const resRivers = await fetch("/dhaka-rivers.geojson", { signal: AbortSignal.timeout(10000) });
      if (resRivers.ok) {
        riversData = await resRivers.json();
        if (!map.getSource("rivers")) {
          map.addSource("rivers", { type: "geojson", data: riversData });

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
      }
    } catch (e) {
      console.warn("Could not load rivers layer:", e);
    }

    // 3. Transit & MRT Line 6
    try {
      const resTransit = await fetch("/dhaka-mrt.geojson", { signal: AbortSignal.timeout(10000) });
      if (resTransit.ok) {
        transitData = await resTransit.json();
        if (!map.getSource("transit")) {
          map.addSource("transit", { type: "geojson", data: transitData });

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
      }
    } catch (e) {
      console.warn("Could not load transit layer:", e);
    }

    // 4. Economy & Industry
    try {
      const resEconomy = await fetch("/dhaka-economy.geojson", { signal: AbortSignal.timeout(10000) });
      if (resEconomy.ok) {
        economyData = await resEconomy.json();
        if (!map.getSource("economy")) {
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
      }
    } catch (e) {
      console.warn("Could not load economy layer:", e);
    }

    // 5. Curated Areas for Quick Jump
    try {
      const resAreas = await fetch("/dhaka-areas.json", { signal: AbortSignal.timeout(10000) });
      if (resAreas.ok) {
        areasData = await resAreas.json();
        populateQuickJump(areasData);
        const areaId = new URLSearchParams(window.location.search).get("area");
        const initialArea = areasData.find(area => area.id === areaId);
        if (initialArea && !["air", "rivers"].includes(currentLens)) flyToArea(initialArea, 0);
      }
    } catch (e) {
      console.warn("Could not load areas json:", e);
    }

    setupClickInspectors();
    applyLens(currentLens);
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

    ["landmarks-points", "rivers-gauges", "transit-stations", "economy-hubs"].forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
      }
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
        <div class="hud-row"><span class="hud-label">Current Reading:</span><span class="hud-value" style="color:var(--dim)">${tr("Unavailable · no connected gauge feed", "অনুপলব্ধ · পর্যবেক্ষণ সংযুক্ত নেই")}</span></div>
        <div class="hud-row"><span class="hud-label">Status:</span><span class="hud-value">${tr("Reference station · not a live reading", "তথ্যসূত্র স্টেশন · সরাসরি পর্যবেক্ষণ নয়")}</span></div>
      `;
    } else if (type === "building") {
      const use = ({civic:tr("Civic / community","নাগরিক / সামাজিক"), commerce:tr("Commerce","বাণিজ্য"), homes:tr("Homes","আবাসন"), industry:tr("Industry / utilities","শিল্প / পরিষেবা"), unknown:tr("Use unknown","ব্যবহার অজানা")})[props.use_class] || tr("Use unknown","ব্যবহার অজানা");
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">${tr("Mapped use", "নথিভুক্ত ব্যবহার")}</span><span class="hud-value">${use}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Block height", "ভবনের উচ্চতা")}</span><span class="hud-value">${props.height_m} m</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Height method", "উচ্চতার পদ্ধতি")}</span><span class="hud-value">${props.height_method === "levels-times-3m" ? tr("OSM levels × 3 m (estimate)", "OSM তলা × ৩ মিটার (আনুমানিক)") : props.height_method === "osm-height-tag" ? tr("OSM height tag", "OSM উচ্চতার তথ্য") : tr("6 m estimate; no mapped height", "৬ মিটার আনুমানিক; উচ্চতার তথ্য নেই")}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Snapshot", "উপাত্ত সংগ্রহ")}</span><span class="hud-value">${parliamentSnapshot.metadata.retrieved_at.slice(0, 10)}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Source", "উৎস")}</span><span class="hud-value">${props.osm_id} · ODbL</span></div>
        <p>${tr("Mapped footprint massing; not a surveyed architectural model.", "মানচিত্রভিত্তিক ভবনের রূপ; জরিপকৃত স্থাপত্য মডেল নয়।")}</p>
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
          <span class="hud-badge">${type === "building" ? tr("building", "ভবন") : type}</span>
        </div>
        <button class="modal-close-btn" onclick="document.getElementById('atlas-observation-hud').hidden = true;">✕</button>
      </div>
      ${rowsHtml}
      <p style="margin:8px 0 0;font-size:11.5px;color:var(--dim);">${desc}</p>
    `;
    hud.hidden = false;
  }

  let radarTimer = null;
  let dynamicLayers = [];
  let lensToken = 0;

  // NASA GIBS layer registry.
  // Every entry is validated against the GIBS WMTS capabilities catalogue by
  // scripts/test-environment-contract.mjs: the layer id must exist, the tile
  // matrix set must be one the layer publishes, and the file format must
  // match. GIBS observation latency differs per product, so the observation
  // date is resolved by probing rather than assumed — see resolveGibsObservation.
  const GIBS_LAYERS = {
    cloud: {
      layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
      level: 9, ext: "jpg", maxzoom: 9,
      probe: { z: 9, y: 221, x: 384 },
      label: ["NASA VIIRS True Color · surface reflectance", "নাসা ভিআইআইআরএস ট্রু কালার · ভূপৃষ্ঠের পরিবর্তনশীলতা"]
    },
    aerosol: {
      layer: "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth",
      level: 7, ext: "png", maxzoom: 7,
      probe: { z: 7, y: 55, x: 96 },
      label: ["NASA MODIS MAIAC · aerosol optical depth (AOD)", "নাসা মডিস মায়াক · এরোসল অপটিক্যাল ডেপথ (AOD)"]
    },
    night: {
      layer: "VIIRS_SNPP_DayNightBand",
      level: 7, ext: "png", maxzoom: 7,
      probe: { z: 7, y: 55, x: 96 },
      label: ["NASA VIIRS Day/Night Band · night-time radiance", "নাসা ভিআইআইআরএস ডে/নাইট ব্যান্ড · রাতের দীপ্তি"]
    },
    water: {
      layer: "VIIRS_Combined_Flood_1-Day",
      level: 9, ext: "png", maxzoom: 9,
      probe: { z: 9, y: 221, x: 384 },
      label: ["NASA VIIRS combined flood · 1-day window", "নাসা ভিআইআইআরএস যৌথ বন্যা · ১ দিনের জানালা"]
    }
  };

  const gibsObservationCache = new Map();

  function gibsTileUrl(spec, date) {
    const d = date ? `${date}/` : "";
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${spec.layer}/default/${d}GoogleMapsCompatible_Level${spec.level}/{z}/{y}/{x}.${spec.ext}`;
  }

  function gibsProbeUrl(spec, date) {
    const d = date ? `${date}/` : "";
    const p = spec.probe;
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${spec.layer}/default/${d}GoogleMapsCompatible_Level${spec.level}/${p.z}/${p.y}/${p.x}.${spec.ext}`;
  }

  function gibsContext2d(width, height) {
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) return ctx;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d", { willReadFrequently: true });
  }

  // GIBS publishes a date directory before the observation behind it is
  // ingested, and serves that date as a fully blank placeholder tile: HTTP 200,
  // non-empty, and — for the Suomi NPP Day/Night Band at 2026-10-28 — exactly
  // what its own "latest" path returns. Neither the status code nor the byte
  // count can tell that placeholder from a real raster, so decode the tile and
  // look for actual content. A placeholder is a single uniform colour.
  async function gibsTileHasData(url) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch {
      return false;
    }
    if (!res.ok) return false;
    let blob;
    try {
      blob = await res.blob();
    } catch {
      return true;
    }
    if (!blob.size) return false;
    try {
      const bitmap = await createImageBitmap(blob);
      const ctx = gibsContext2d(bitmap.width, bitmap.height);
      if (!ctx) return true;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      bitmap.close?.();
      let min = 255;
      let max = 0;
      let seen = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (lum < min) min = lum;
        if (lum > max) max = lum;
        seen++;
      }
      if (!seen) return false;
      return max - min > 2;
    } catch {
      // Cannot decode: the bytes are the only evidence available.
      return true;
    }
  }

  // GIBS publishes each product on its own latency (0-3 days), and a date can
  // exist as a blank placeholder before its observation is ingested. Probe
  // candidate dates newest-first and take the first that actually carries an
  // observation over Dhaka.
  async function resolveGibsObservation(spec) {
    const candidates = Array.from({ length: 4 }, (_, back) =>
      new Date(Date.now() - back * 86400000).toISOString().split("T")[0],
    );
    const results = await Promise.all(
      candidates.map(async (date) => {
        const key = `${spec.layer}|${date}`;
        const cached = gibsObservationCache.get(key);
        if (cached !== undefined) return { date, ok: cached };
        const ok = await gibsTileHasData(gibsProbeUrl(spec, date));
        gibsObservationCache.set(key, ok);
        return { date, ok };
      }),
    );
    for (const r of results) {
      if (r.ok) return { date: r.date, dated: true };
    }
    // The undated path serves GIBS's latest observation, which may itself be a
    // placeholder. Prefer it over showing nothing, but say the date is unknown.
    if (await gibsTileHasData(gibsProbeUrl(spec, null))) return { date: null, dated: false };
    return null;
  }

  const LENS_VIEWPORTS = {
    city: { center: [90.4125, 23.8103], zoom: 13, pitch: 50, bearing: 15 },
    heritage: { center: [90.378, 23.762], zoom: 16.5, pitch: 60, bearing: 45 },
    transit: { center: [90.375, 23.785], zoom: 14, pitch: 55, bearing: 25 },
    rivers: { center: [91.35, 24.8], zoom: 8.8, pitch: 35, bearing: -5 },
    economy: { center: [90.36, 23.82], zoom: 12.5, pitch: 45, bearing: 10 },
    air: { center: [90.4, 23.85], zoom: 9.5, pitch: 20, bearing: 0 },
    aerosol: { center: [90.5, 24.0], zoom: 8.5, pitch: 0, bearing: 0 },
    radar: { center: [90.4, 23.8], zoom: 8.8, pitch: 10, bearing: 0 },
    rain: { center: [90.4, 23.8], zoom: 10.5, pitch: 30, bearing: 0 },
    haze: { center: [90.35, 23.85], zoom: 11.5, pitch: 45, bearing: -15 },
    cloud: { center: [90.41, 23.81], zoom: 9, pitch: 0, bearing: 0 },
    night: { center: [90.41, 23.81], zoom: 10.5, pitch: 30, bearing: 0 },
    water: { center: [90.6, 24.2], zoom: 8.5, pitch: 20, bearing: 0 }
  };

  function clearDynamicLayers() {
    if (radarTimer) {
      clearInterval(radarTimer);
      radarTimer = null;
    }
    if (activeOverlayLayer && map?.getLayer(activeOverlayLayer)) {
      map.removeLayer(activeOverlayLayer);
      map.removeSource(activeOverlayLayer);
      activeOverlayLayer = null;
    }
    for (const id of dynamicLayers) {
      if (map?.getLayer(id)) map.removeLayer(id);
      if (map?.getSource(id)) map.removeSource(id);
    }
    dynamicLayers = [];
  }

  function applyLens(lensId) {
    currentLens = lensId;
    const token = ++lensToken;
    if ($("#atlas-lens")) $("#atlas-lens").value = lensId;
    window.AtlasForecast?.activate(lensId);
    $$(".atlas-lenses button").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.lens === lensId ? "true" : "false");
    });

    const isBn = document.documentElement.lang === "bn";
    const story = LENS_STORIES[lensId] || LENS_STORIES.city;
    const titleEl = $("#atlas-lens-title");
    const descEl = $("#atlas-lens-description");
    if (titleEl) titleEl.textContent = isBn ? story.title_bn : story.title;
    if (descEl) descEl.textContent = isBn ? story.desc_bn : story.desc;

    if (!map) return;
    const layerStatus = $("#atlas-layer-status");
    if (layerStatus) { layerStatus.hidden = true; layerStatus.textContent = ""; }

    const is3D = $("#atlas-view")?.value !== "2d";
    const vp = LENS_VIEWPORTS[lensId];
    if (vp && typeof map.flyTo === "function") {
      map.flyTo({
        center: vp.center,
        zoom: vp.zoom,
        pitch: is3D ? vp.pitch : 0,
        bearing: is3D ? vp.bearing : 0,
        essential: true,
        duration: 1600
      });
    }

    clearDynamicLayers();
    if (["haze", "rain", "radar"].includes(lensId)) loadLensEvidence(lensId);

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
    syncBuildingVisibility();
    if (map.getLayer("landmarks-labels")) {
      map.setLayoutProperty("landmarks-labels", "visibility", (lensId === "heritage" || lensId === "city") ? "visible" : "none");
      map.setLayoutProperty("landmarks-labels", "text-field", ["coalesce", ["get", isBn ? "name_bn" : "name"], ["get", "name"]]);
    }
    if (map.getLayer("landmarks-points")) {
      map.setLayoutProperty("landmarks-points", "visibility", (lensId === "heritage" || lensId === "city") ? "visible" : "none");
    }

    if (GIBS_LAYERS[lensId]) {
      applyGibsOverlay(lensId, token);
    }
  }

  async function applyGibsOverlay(lensId, token) {
    const spec = GIBS_LAYERS[lensId];
    if (!spec) return;
    const layerStatus = $("#atlas-layer-status");
    const overlayId = `nasa-${lensId}`;
    // Resolve the observation before painting. GIBS can serve a blank
    // placeholder for a date whose observation has not been ingested yet, and
    // that placeholder is an opaque white tile — painting it would cover the
    // map with white and look like a broken layer. The status strip says
    // "locating" while the probe runs, so nothing is claimed that is not shown.
    if (layerStatus) {
      layerStatus.hidden = false;
      layerStatus.textContent = tr("Locating latest NASA observation…", "নাসার সর্বশেষ পর্যবেক্ষণ খোঁজা হচ্ছে…");
    }
    const obs = await resolveGibsObservation(spec);
    if (token !== lensToken || currentLens !== lensId) return;
    if (!obs) {
      if (layerStatus) {
        layerStatus.hidden = false;
        layerStatus.textContent = tr(
          `Satellite layer unavailable · reasonCode gibs-no-observation · ${spec.layer}`,
          `উপগ্রহ স্তর উপলব্ধ নয় · reasonCode gibs-no-observation · ${spec.layer}`
        );
      }
      return;
    }
    // Pin every tile to one observation date so a mid-session GIBS rollover
    // cannot mix two dates across the raster.
    addRasterOverlay(overlayId, gibsTileUrl(spec, obs.date), spec.maxzoom);
    if (layerStatus) {
      layerStatus.hidden = false;
      const when = obs.dated
        ? tr(`observation ${obs.date}`, `পর্যবেক্ষণ ${obs.date}`)
        : tr("latest available observation (exact date unresolved)", "সর্বশেষ উপলব্ধ পর্যবেক্ষণ (সঠিক তারিখ নিশ্চিত নয়)");
      layerStatus.textContent = `${tr(spec.label[0], spec.label[1])} · ${when}`;
    }
  }

  async function loadLensEvidence(lens) {
    const status = $("#atlas-layer-status");
    if (status) {
      status.hidden = false;
      status.textContent = tr("Checking source…", "উৎস যাচাই হচ্ছে…");
    }
    const isBn = document.documentElement.lang === "bn";
    try {
      if (lens === "radar") {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error("radar-unavailable");
        const data = await res.json();
        if (currentLens !== lens) return;
        const frames = data.radar?.past || [];
        if (!frames.length || !data.host?.startsWith("https://")) throw new Error("radar-no-frame");
        let fIdx = frames.length - 1;
        function showRadarFrame(i) {
          if (currentLens !== "radar" || !map) return;
          const fr = frames[i];
          const tileUrl = `${data.host}${fr.path}/256/{z}/{x}/{y}/2/1_1.png`;
          if (map.getLayer("rain-radar")) map.removeLayer("rain-radar");
          if (map.getSource("rain-radar")) map.removeSource("rain-radar");
          addRasterOverlay("rain-radar", tileUrl, 7);
          const tStr = new Date(fr.time * 1000).toLocaleTimeString(isBn ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
          if (status) status.textContent = `${tr("Doppler radar loop · frame ", "ডপলার রাডার লুপ · ধাপ ")}${i + 1}/${frames.length} · ${tStr} BST`;
        }
        showRadarFrame(fIdx);
        if (frames.length > 1) {
          radarTimer = setInterval(() => {
            if (currentLens !== "radar") { clearInterval(radarTimer); return; }
            fIdx = (fIdx + 1) % frames.length;
            showRadarFrame(fIdx);
          }, 1200);
        }
      } else if (lens === "rain") {
        const res = await fetch("/api/atlas/rainfall", { signal: AbortSignal.timeout(15000) });
        const data = await res.json();
        if (currentLens !== lens) return;
        if (!res.ok || data.status !== "ok" || !data.catchments?.length) throw new Error(data.reasonCode || "feed-unavailable");
        if (status) status.textContent = tr("Modeled rainfall · next 24 h: ", "মডেলভিত্তিক বৃষ্টি · পরের ২৪ ঘণ্টা: ") + data.catchments.map(p => `${p.name}: ${p.rain_24h_sum_mm?.toFixed(1)} mm`).join(" · ");
        const geojson = {
          type: "FeatureCollection",
          features: data.catchments.map(c => {
            const rain = Number(c.rain_24h_sum_mm || 0);
            const color = rain > 25 ? "#dd4027" : (rain > 10 ? "#e2953b" : (rain > 2 ? "#0093a5" : "#547076"));
            const name = isBn ? (c.name_bn || c.name) : c.name;
            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: [c.lng, c.lat] },
              properties: {
                id: c.id,
                name,
                rain_24h_sum_mm: rain,
                current_mm: c.current_mm,
                color,
                label: `${name}\n${rain.toFixed(1)} mm`
              }
            };
          })
        };
        map.addSource("catchment-rain", { type: "geojson", data: geojson });
        map.addLayer({
          id: "catchment-rain-circles",
          type: "circle",
          source: "catchment-rain",
          paint: {
            "circle-radius": 22,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.65,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#f5f0dc"
          }
        }, map.getLayer("parliament-buildings") ? "parliament-buildings" : "city-buildings");
        map.addLayer({
          id: "catchment-rain-labels",
          type: "symbol",
          source: "catchment-rain",
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-offset": [0, 1.6]
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#0d171d",
            "text-halo-width": 2
          }
        });
        dynamicLayers.push("catchment-rain-circles", "catchment-rain-labels", "catchment-rain");
        if (map.on) {
          map.on("click", "catchment-rain-circles", e => {
            if (!e.features?.[0]) return;
            const p = e.features[0].properties;
            const hud = $("#atlas-observation-hud");
            if (!hud) return;
            hud.hidden = false;
            hud.innerHTML = `<h3>${p.name}</h3>
              <div style="margin:4px 0;"><strong>${tr("24h precipitation forecast:","২৪ ঘণ্টার বৃষ্টিপাত পূর্বাভাস:")}</strong> ${Number(p.rain_24h_sum_mm).toFixed(1)} mm</div>
              <div style="font-size:11.5px;color:var(--dim);">${tr("High-resolution precipitation catchment model for Greater Dhaka river drainage.","বৃহত্তর ঢাকার নদী নিষ্কাশনের জন্য উচ্চ-রেজোলিউশন বৃষ্টিপাত পূর্বাভাস মডেল।")}</div>
              <button type="button" class="atlas-btn" style="margin-top:8px;width:100%;" onclick="document.getElementById('atlas-observation-hud').hidden=true">${tr("Close","বন্ধ করুন")}</button>`;
          });
        }
      } else if (lens === "haze") {
        const res = await fetch("/api/atlas/wind", { signal: AbortSignal.timeout(15000) });
        const data = await res.json();
        if (currentLens !== lens) return;
        const wind = data?.data?.current;
        const windSpeed = wind?.wind_speed_10m ? Number(wind.wind_speed_10m).toFixed(1) : null;
        const windDir = wind?.wind_direction_10m !== undefined ? Math.round(Number(wind.wind_direction_10m)) : null;
        const cardinals = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
        const cardinal = windDir !== null ? cardinals[Math.round(windDir / 22.5) % 16] : "";
        if (windSpeed && windDir !== null) {
          if (status) status.textContent = `${tr("Surface wind: ","ভূপৃষ্ঠের বাতাস: ")}${windSpeed} km/h ${tr("from ","দিক: ")}${windDir}° (${cardinal}) · ${tr("Winter plume transport towards central Dhaka","ধোঁয়া কেন্দ্রীয় ঢাকার দিকে প্রবাহিত")}`;
        } else {
          if (status) status.textContent = tr("Brick kiln clusters in Savar, Gazipur & Narayanganj arcs · prevailing winter smoke transport","সাভার, গাজীপুর ও নারায়ণগঞ্জ ইটভাটা অঞ্চল · শীতকালীন ধোঁয়া প্রবাহ");
        }
        const kilnsGeo = {
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "Point", coordinates: [90.260, 23.830] }, properties: { name: isBn ? "সাভার ইটভাটা অঞ্চল" : "Savar Brick Kiln Belt", count: "~180 kilns", tech: "FCBTK / Zigzag", color: "#d96629" } },
            { type: "Feature", geometry: { type: "Point", coordinates: [90.395, 23.930] }, properties: { name: isBn ? "গাজীপুর-টঙ্গী ইটভাটা অঞ্চল" : "Gazipur-Tongi Brick Belt", count: "~240 kilns", tech: "FCBTK / Zigzag", color: "#dd4027" } },
            { type: "Feature", geometry: { type: "Point", coordinates: [90.370, 23.680] }, properties: { name: isBn ? "কেরানীগঞ্জ-বুড়িগঙ্গা ইটভাটা বলয়" : "Keraniganj-Buriganga Arc", count: "~120 kilns", tech: "Zigzag / Traditional", color: "#e2953b" } },
            { type: "Feature", geometry: { type: "Point", coordinates: [90.520, 23.630] }, properties: { name: isBn ? "নারায়ণগঞ্জ-শীতলক্ষ্যা ইটভাটা ক্লাস্টার" : "Narayanganj-Shitalakshya Cluster", count: "~150 kilns", tech: "FCBTK / Zigzag", color: "#e2953b" } }
          ]
        };
        map.addSource("haze-kilns", { type: "geojson", data: kilnsGeo });
        map.addLayer({
          id: "haze-kilns-circles",
          type: "circle",
          source: "haze-kilns",
          paint: {
            "circle-radius": 20,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.7,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#f5f0dc"
          }
        }, map.getLayer("parliament-buildings") ? "parliament-buildings" : "city-buildings");
        map.addLayer({
          id: "haze-kilns-labels",
          type: "symbol",
          source: "haze-kilns",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-offset": [0, 1.5]
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#0d171d",
            "text-halo-width": 2
          }
        });
        dynamicLayers.push("haze-kilns-circles", "haze-kilns-labels", "haze-kilns");
        if (map.on) {
          map.on("click", "haze-kilns-circles", e => {
            if (!e.features?.[0]) return;
            const p = e.features[0].properties;
            const hud = $("#atlas-observation-hud");
            if (!hud) return;
            hud.hidden = false;
            hud.innerHTML = `<h3>${p.name}</h3>
              <div style="margin:4px 0;"><strong>${tr("Operating density:","ভাটার সংখ্যা:")}</strong> ${p.count}</div>
              <div style="margin:4px 0;"><strong>${tr("Kiln technology:","ভাটা প্রযুক্তি:")}</strong> ${p.tech}</div>
              <div style="font-size:11.5px;color:var(--dim);">${tr("Major winter particulate and black carbon emission zone affecting Dhaka urban basin.","শীতকালে ঢাকা মহানগরীর বাতাসের মান অবনমনকারী প্রধান ধোঁয়া নির্গমন বলয়।")}</div>
              <button type="button" class="atlas-btn" style="margin-top:8px;width:100%;" onclick="document.getElementById('atlas-observation-hud').hidden=true">${tr("Close","বন্ধ করুন")}</button>`;
          });
        }
      }
    } catch {
      if (currentLens === lens && status) status.textContent = tr("Evidence unavailable for this lens. No current observation is shown.", "এই স্তরের উপাত্ত অনুপলব্ধ। বর্তমান পর্যবেক্ষণ দেখানো হচ্ছে না।");
    }
  }

  function addRasterOverlay(id, tileUrl, maxzoom = 9) {
    if (!map || map.getSource(id)) return;
    try {
      map.addSource(id, {
        type: "raster",
        tiles: [tileUrl],
        maxzoom,
        tileSize: 256
      });
      map.addLayer({
        id: id,
        type: "raster",
        source: id,
        paint: { "raster-opacity": 0.75 }
      }, map.getLayer("parliament-buildings") ? "parliament-buildings" : "city-buildings");
      activeOverlayLayer = id;
    } catch (e) {
      console.warn("Could not add raster overlay:", id, e);
    }
  }

  function wireUIEvents() {
    $("#atlas-lens")?.addEventListener("change", e => applyLens(e.target.value));
    $$(".atlas-lenses button").forEach(btn => {
      btn.addEventListener("click", () => applyLens(btn.dataset.lens));
    });

    $("#atlas-basemap")?.addEventListener("change", e => {
      currentBasemap = e.target.value;
      if (map) {
        if (map.getLayer("basemap-esri")) map.setLayoutProperty("basemap-esri", "visibility", currentBasemap === "esri" ? "visible" : "none");
        if (map.getLayer("basemap-osm")) map.setLayoutProperty("basemap-osm", "visibility", currentBasemap === "osm" ? "visible" : "none");
      }
    });

    $("#atlas-view")?.addEventListener("change", e => {
      const is3D = e.target.value === "3d";
      if (map) {
        syncBuildingVisibility();
        map.easeTo({
          pitch: is3D ? 50 : 0,
          bearing: is3D ? 15 : 0,
          duration: 1000
        });
      }
    });


    const searchInput = $("#atlas-search-input");
    searchInput?.addEventListener("keydown", async e => {
      if (e.key === "Enter" && searchInput.value.trim().length >= 2) {
        performSearch(searchInput.value.trim());
      }
    });

    window.addEventListener("atlas:language", () => {
      applyLens(currentLens);
      populateQuickJump(areasData);
      renderCityWatch();
    });
  }

  async function performSearch(query) {
    try {
      const res = await fetch(`/api/atlas/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const first = data.results[0];
        if (map) {
          map.flyTo({
            center: [Number(first.lon), Number(first.lat)],
            zoom: 15,
            pitch: 50,
            duration: 1500
          });
        }
      }
    } catch (err) {
      console.warn("Search error:", err);
    }
  }

  function flyToArea(area, duration = 1500) {
    if (!map) return;
    const is3D = $("#atlas-view")?.value !== "2d";
    const zoom = (area.zoom || 15) + (area.id === "parliament" ? Math.max(0, Math.log2(map.getContainer().clientWidth / 768)) : 0);
    map.flyTo({ center: [area.lng, area.lat], zoom,
      pitch: is3D ? (area.pitch ?? 45) : 0, bearing: is3D ? (area.bearing ?? 0) : 0, duration });
  }

  function populateQuickJump(areas) {
    const container = $("#quick-jump-grid");
    if (!container) return;
    const isBn = document.documentElement.lang === "bn";
    container.innerHTML = areas.map(a => `
      <button class="jump-btn" data-area="${a.id}">
        <span class="jump-btn-cat">${a.category}</span>
        <div class="jump-btn-name">${(isBn && a.name_bn) ? a.name_bn : a.name}</div>
      </button>
    `).join("");

    $$("#quick-jump-grid .jump-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const area = areas.find(item => item.id === btn.dataset.area);
        if (area) flyToArea(area);
        $("#quick-jump-dialog")?.close();
      });
    });
  }

  function renderCityWatch() {
    const ind = watchData?.indicators;
    const unknown = tr("Unavailable", "অনুপলব্ধ");
    const modeled = tr("Model", "মডেল");
    const category = {Good:"ভালো", Moderate:"মাঝারি", "Unhealthy for Sensitive Groups":"সংবেদনশীলদের জন্য অস্বাস্থ্যকর", Unhealthy:"অস্বাস্থ্যকর", "Very Unhealthy":"অত্যন্ত অস্বাস্থ্যকর", Hazardous:"বিপজ্জনক"};
    const values = {
      flood: unknown + tr(" · gauge feed", " · নদী পর্যবেক্ষণ"),
      air: Number.isFinite(ind?.airQuality?.us_aqi) ? `${modeled} · AQI ${ind.airQuality.us_aqi} · ${tr(ind.airQuality.category, category[ind.airQuality.category])}` : unknown,
      wind: Number.isFinite(ind?.weather?.wind_speed_10m) ? `${modeled} · ${ind.weather.wind_speed_10m} km/h · ${ind.weather.wind_direction_10m}°` : unknown,
      traffic: unknown + tr(" · dated bulletin", " · তারিখযুক্ত বুলেটিন"),
    };
    for (const [key, value] of Object.entries(values)) {
      const el = $(`#atlas-watch-${key}-value`);
      if (el) el.textContent = value;
      const item = $(`#atlas-watch-${key}`);
      if (item) {
        const feed = ind?.[({flood:"floodRisk",air:"airQuality",wind:"weather",traffic:"economy"})[key]];
        item.dataset.tier = feed?.status || "unavailable";
        item.title = `${feed?.source || ""} · ${feed?.observedAt || feed?.reasonCode || "unavailable"}`;
      }
    }
  }

  async function pollCityWatch() {
    try {
      const res = await fetch("/api/atlas/watch", { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Watch unavailable");
      watchData = await res.json();
    } catch { watchData = null; }
    renderCityWatch();
  }

  function bootAtlas() {
    wireUIEvents();
    pollCityWatch();
    setInterval(pollCityWatch, 5 * 60 * 1000);
    initMap();
  }

  // Safe boot: runs immediately if DOM is ready, or on DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAtlas);
  } else {
    bootAtlas();
  }
})();
