// DHKx 3D Atlas Client -- dhaka.nonarkara.org
// Bilingual English/Bengali map engine for Dhaka's urban, environmental and economic layers.

(function () {
  'use strict';

  const ATLAS_BUILD_TAG = "dhaka-atlas-20261027-1793127365-ff3757b";
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
    const maplibregl = window.maplibregl;
    if (!maplibregl || typeof maplibregl.Map !== "function") {
      if (++bootAttempts < 80) setTimeout(initMap, 100);
      else showMapFailure();
      return;
    }

    const styleSpec = {
      version: 8,
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

  function applyLens(lensId) {
    currentLens = lensId;
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
    if (["haze", "rain", "radar"].includes(lensId)) loadLensEvidence(lensId);

    if (activeOverlayLayer && map.getLayer(activeOverlayLayer)) {
      map.removeLayer(activeOverlayLayer);
      map.removeSource(activeOverlayLayer);
      activeOverlayLayer = null;
    }

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

    }
  }

  async function loadLensEvidence(lens) {
    const status = $("#atlas-layer-status");
    status.hidden = false;
    status.textContent = tr("Checking source…", "উৎস যাচাই হচ্ছে…");
    try {
      if (lens === "radar") {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", {signal: AbortSignal.timeout(10000)});
        if (!res.ok) throw new Error("radar-unavailable");
        const data = await res.json();
        if (currentLens !== lens) return;
        const frame = data.radar?.past?.at(-1);
        if (!frame || !data.host?.startsWith("https://")) throw new Error("radar-no-frame");
        addRasterOverlay("rain-radar", `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, 7);
        status.textContent = tr("Radar composite · coverage may be absent over Dhaka · ", "রাডার চিত্র · ঢাকার তথ্য নাও থাকতে পারে · ") + new Date(frame.time * 1000).toISOString();
      } else {
        const res = await fetch(lens === "rain" ? "/api/atlas/rainfall" : "/api/atlas/fires", {signal: AbortSignal.timeout(15000)});
        const data = await res.json();
        if (currentLens !== lens) return;
        if (!res.ok || data.status !== "ok") throw new Error(data.reasonCode || "feed-unavailable");
        status.textContent = tr("Modeled rainfall · next 24 h: ", "মডেলভিত্তিক বৃষ্টি · পরের ২৪ ঘণ্টা: ") + data.catchments.map(p => `${p.name}: ${p.rain_24h_sum_mm?.toFixed(1)} mm`).join(" · ");
      }
    } catch {
      if (currentLens === lens) status.textContent = tr("Evidence unavailable for this lens. No current observation is shown.", "এই স্তরের উপাত্ত অনুপলব্ধ। বর্তমান পর্যবেক্ষণ দেখানো হচ্ছে না।");
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
