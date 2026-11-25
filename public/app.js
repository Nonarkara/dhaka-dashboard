// DHKx 3D Atlas Client -- dhaka.nonarkara.org
// Bilingual English/Bengali map engine for Dhaka's urban, environmental and economic layers.

(function () {
  'use strict';

  const ATLAS_BUILD_TAG = "dhaka-atlas-20261125-1795597188-b41633e";
  const CITY_CENTER = [90.4125, 23.8103];
  const ESRI_IMAGERY = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const OSM_STREETS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  let map = null;
  let currentLens = "city";
  // Has the map finished drawing what it is showing?
  //
  // MapLibre reports "idle" only when the camera has stopped and every tile
  // it shows has arrived. Before that, the buildings on screen are a
  // fraction of the buildings the map is about to draw. A count read from a
  // loading map is a partial count wearing the clothes of a total, so the
  // walkthrough's number waits for this flag.
  let mapIdle = false;
  let currentBasemap = "esri";
  let activeOverlayLayer = null;
  let landmarksData = null;
  let riversData = null;
  let transitData = null;
  let economyData = null;
  let areasData = [];
  let loadingHidden = false;
  let styleReady = false;            // style JSON parsed; tiles may still be arriving
  let bootAttempts = 0;
  let watchData = null;
  let parliamentSnapshot = null;
  let parliamentSourceReady = false;
  let cityHeightReady = false;
  let cityHeightSummary = null;
  let parliamentPending = null;
  let parliamentError = null;
  let lastRequestedArea = null;
  const PARLIAMENT_BOUNDS = [90.369,23.752,90.388,23.773]; // captured source extent, not an administrative boundary
  const inspectionLayers = new Set();
  const hoverLayers = new Set();
  let openingAreaIntent = true;
  const referenceFailures = new Map();
  const referencePending = new Map();
  let solarTimer = null;
  let watchTimer = null;
  let watchPending = null;
  let watchController = null;
  let watchRevision = 0;
  let watchScheduleToken = 0;
  let watchCheckedAt = 0;
  let searchController = null;
  let searchRevision = 0;
  const tr = (en, bn) => document.documentElement.lang === "bn" ? bn : en;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /**
   * The lens named in the address, when it names one the atlas has.
   *
   * A lens is a view, and a view worth reading is worth linking to. An
   * unknown name is ignored rather than half-applied.
   */
  function lensFromUrl() {
    const id = new URLSearchParams(window.location.search).get("lens");
    return id && Object.prototype.hasOwnProperty.call(LENS_STORIES, id) ? id : null;
  }

  /** Keep the address in step with the lens, so the view can be shared. */
  function lensInUrl(lensId) {
    try {
      const url = new URL(window.location.href);
      if (lensId === "city") url.searchParams.delete("lens");
      else url.searchParams.set("lens", lensId);
      window.history.replaceState(null, "", url);
    } catch {
      /* the address bar is not a place the atlas can fail */
    }
  }

  function hideLoading() {
    if (loadingHidden) return;
    loadingHidden = true;
    const el = $("#atlas-map-loading");
    if (el) el.classList.add("loaded");
  }

  const LENS_STORIES = {
    people: {
      title: "Population model & mapped facilities",
      title_bn: "জনসংখ্যা মডেল ও মানচিত্রভুক্ত প্রতিষ্ঠান",
      desc: "WorldPop 2025 estimates in 1 km² cells, with dated OSM school and healthcare objects. Not capacity or service coverage.",
      desc_bn: "১ বর্গকিমি সেলে WorldPop ২০২৫ অনুমান এবং তারিখসহ OSM স্কুল ও স্বাস্থ্যসেবার বস্তু। ধারণক্ষমতা বা সেবার আওতা নয়।"
    },
    city: {
      title: "Read the city, from skyline to street",
      title_bn: "আকাশরেখা থেকে অলিগলি: ঢাকার প্রতিটি স্তরের পাঠ",
      desc: "Zoom in for the building massing and footprints; select a feature for source details.",
      desc_bn: "ভবনের গঠন ও রূপ দেখতে জুম করুন; উৎসের তথ্য পেতে স্থাপনা নির্বাচন করুন।"
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
      title: "Point Rainfall Forecast · 24h",
      title_bn: "স্থানভিত্তিক বৃষ্টিপাত পূর্বাভাস · ২৪ ঘণ্টা",
      desc: "Modeled 24-hour precipitation totals at five query points. Not catchment averages or flood warnings.",
      desc_bn: "পাঁচটি অনুসন্ধানের স্থানে মডেলভিত্তিক ২৪ ঘণ্টার বৃষ্টিপাত। অববাহিকার গড় বা বন্যার সতর্কবার্তা নয়।"
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
      desc: "Daily night-time radiance from the NOAA-20 VIIRS Day/Night Band over Greater Dhaka.",
      desc_bn: "নোয়া-২০ ভিআইআইআরএস ডে/নাইট ব্যান্ড থেকে বৃহত্তর ঢাকার দৈনিক রাতের দীপ্তি।"
    },
    water: {
      title: "Satellite Observed Flood Inundation",
      title_bn: "উপগ্রহ পর্যবেক্ষিত বন্যা প্লাবন",
      desc: "Daily NASA VIIRS combined flood detection, 1-day window, for the Bengal Delta.",
      desc_bn: "দৈনিক নাসা ভিআইআইআরএস যৌথ বন্যা শনাক্তকরণ, ১ দিনের জানালা — বাংলাদেশ বদ্বীপ।"
    },
    walk: {
      // The name of the lens is the same in the picker, in the story and in
      // the paper, and it is the cautious one: a low-angle map. The camera
      // is a projection-model estimate, not a surveyed street position, so
      // the lens does not call itself a street view. What it does say is in
      // the panel, where the reader can check it.
      title: "Low-angle map",
      title_bn: "নিচু কোণের মানচিত্র",
      desc: "Manual low-angle map exploration. Published/source-tag heights only; unknown heights stay flat. Partial skyline coverage, not a survey, walking route or proof of street access.",
      desc_bn: "নিচু কোণের মানচিত্র হাতে নিয়ন্ত্রণ করে দেখুন। শুধু প্রকাশিত/উৎসে নথিভুক্ত উচ্চতা; অজানা সমতল। আংশিক ভবন-তথ্য, জরিপ বা হাঁটার পথ নয়।"
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
        // The sun, not a lamp. The position is replaced with the real solar
        // bearing over Dhaka as soon as the map is up, so the walls are lit
        // from where the sun actually is.
        anchor: "map",
        color: "#f5f0dc",
        intensity: 0.55,
        position: [1.4, 100, 55]
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
          // The ground beyond the imagery. At a street-level pitch the map
          // plane ends at the horizon, and MapLibre's default black leaves a
          // hole in the page. This is the atlas's own ground tone instead —
          // flat, and it follows the theme.
          id: "atlas-ground",
          type: "background",
          paint: { "background-color": "#0d171d" }
        },
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

    // The street fabric uses the existing attributed OpenMapTiles source.
    // Transport is a line network in the source, not surveyed road widths.
    styleSpec.layers.push(
      {id:"fabric-water", type:"fill", source:"buildings", "source-layer":"water",
        layout:{visibility:"none"}, paint:{"fill-color":FABRIC_COLOURS.dark.water}},
      {id:"fabric-streets", type:"line", source:"buildings", "source-layer":"transportation", minzoom:12,
        layout:{visibility:"none", "line-cap":"round", "line-join":"round"},
        filter:["all", ["match", ["get","class"], ["motorway","trunk","primary","secondary","tertiary","minor","service","path","track"], true, false],
          ["!=", ["get","brunnel"], "tunnel"]],
        paint:{"line-color":FABRIC_COLOURS.dark.street,
          "line-width":["interpolate", ["linear"], ["zoom"], 12, 0.5, 18, ["match", ["get","class"], ["motorway","trunk","primary"], 3, 1]]}}
    );

    styleSpec.layers.push({id:"city-footprints",type:"fill",source:"buildings","source-layer":"building",minzoom:14,
      paint:{"fill-color":window.DhakaDesign?.paint || "#b4b0a3","fill-opacity":0.65}});
    styleSpec.layers.push({
      id: "city-buildings", type: "fill-extrusion", source: "buildings", "source-layer": "building", minzoom: 14,
      filter: ["!", ["has", "hide_3d"]],
      // Streamed render_height mixes defaults/level estimates with tags.
      // Only the separate source-traceable height overlay may extrude.
      paint: {
        ...buildingPaint("source_height_unavailable", "source_base_unavailable"),
        "fill-extrusion-opacity": 1
      }
    });
    // The street-level massing, drawn from the same provider height at the
    // scale where a reader walks it. The clamp in buildingPaint applies here
    // too: a corrupt tag must not become a hundred-kilometre tower, and a
    // height below one metre leaves the footprint flat.
    styleSpec.layers.push({
      id: "walk-massing", type: "fill-extrusion", source: "buildings", "source-layer": "building", minzoom: 16,
      filter: ["!", ["has", "hide_3d"]],
      layout: { visibility: "none" },
      paint: {
        ...buildingPaint("source_height_unavailable", "source_base_unavailable"),
        "fill-extrusion-opacity": 1
      }
    });

    try {
      map = new maplibregl.Map({
        container: "atlas-map",
        style: styleSpec,
        center: [90.4075, 23.7703],
        zoom: 16.5,
        pitch: 50,
        bearing: 15,
        maxPitch: 85,
        minZoom: 9,
        renderWorldCopies: false,
        attributionControl: true
      });

      for (const event of ['dragstart','zoomstart','rotatestart','pitchstart']) map.on(event, e => { if (e?.originalEvent) { cancelCameraWork(); stopMapMotion(); } });
      map.getCanvas?.().addEventListener?.('pointerdown', stopMapMotion);
      // The atlas exposes its map so that the layout audit can measure the
      // real camera and the real source features instead of guessing at
      // them. A surface nobody can inspect cannot be audited.
      window.AtlasMap = {
        instance: map,
        get camera() {
          return {
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
            center: map.getCenter(),
          };
        },
        // The sun's own reading, so the audit can check the light against
        // the sky rather than take the claim on trust.
        sun() { return sunOverDhaka(new Date()); },
        // Whether the map has finished drawing what it is showing. The
        // audit waits for this before it measures a surface.
        get idle() { return mapIdle; },
      };
      map.getCanvas?.().addEventListener?.('wheel', () => { cancelCameraWork(); stopMapMotion(); }, {passive:true});
      map.getCanvas?.().addEventListener?.('keydown', event => {
        cancelCameraWork();
        if (currentLens === 'walk' && /^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/i.test(event.key || '')) return;
        stopMapMotion();
      });
      map.on("move", syncBuildingVisibility);
      map.on("moveend", syncBuildingVisibility);
      map.on("zoomend", syncBuildingVisibility);
      // The walkthrough counts what the screen actually holds, and offers
      // the street scene for exactly where the reader is standing. Both
      // are re-read when the map settles, not when a request was made.
      //
      // A walk moves the camera on every frame, and counting the buildings
      // in view means querying the loaded source features. Doing that on
      // every frame of a walk would cost more than the reading is worth,
      // so the panel is refreshed on a short timer instead: the number on
      // screen is always a measured one, never a stale zero.
      let walkPanelTimer = null;
      const scheduleWalkPanel = () => {
        if (currentLens !== "walk" || walkPanelTimer) return;
        walkPanelTimer = setTimeout(() => {
          walkPanelTimer = null;
          renderWalkPanel();
        }, 200);
      };
      // The map's own word for "the camera has stopped and the tiles it
      // shows have arrived". A building count taken before that is a
      // fraction of the view, so the count waits for this.
      map.on("idle", () => { mapIdle = true; scheduleWalkPanel(); });
      // One handler per event: the camera has moved, so the screen is no
      // longer the settled one the count was read from.
      for (const event of ['dragstart','zoomstart','rotatestart','pitchstart']) {
        map.on(event, e => { mapIdle = false; if (e?.originalEvent) { cancelCameraWork(); stopMapMotion(); } });
      }
      map.on("movestart", () => { mapIdle = false; });
      map.on("moveend", scheduleWalkPanel);
      // The walkthrough needs both the map and the district list, so it is
    // attached once both exist.
    window.AtlasWalk?.attach(map, areasData);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      // Attribution is a source instrument with its own row, including wrapped phone credits.
      if (typeof ResizeObserver !== "undefined") {
        const credit=document.querySelector('.maplibregl-ctrl-attrib');
        const wrap=document.querySelector('.atlas-map-wrap');
        if (credit && wrap) {
          const watch=document.querySelector('#atlas-watch');
          const reserve=()=>{
            wrap.style.setProperty('--map-credit-height',`${Math.ceil(credit.getBoundingClientRect().height)}px`);
            wrap.style.setProperty('--map-watch-height',`${Math.ceil(watch?.getBoundingClientRect().height || 0)}px`);
          };
          const observer=new ResizeObserver(reserve); observer.observe(credit); if(watch)observer.observe(watch); reserve();
        }
      }


      // Local evidence starts at style readiness, independently of slow imagery.
      map.on("load", hideLoading);
      map.once("style.load", () => {
        styleReady = true;
        window.AtlasForecast?.attach(map);
        window.AtlasPeople?.attach(map);
        applyLens(currentLens);
        wireBuildingInspection();
        applyGroundColour();
        scheduleSolar();
        loadCityHeights();
        loadDataLayers();
        maybeLoadParliament();
        const el = $("#atlas-map-loading"); if (el) el.style.pointerEvents = "none";
      });
      map.on("render", () => {
        if (styleReady) hideLoading();
      });
      map.on("error", (e) => {
        if (e.sourceId === "parliament-detail") { parliamentSourceReady = false; syncBuildingVisibility(); }
        console.warn("[atlas] map notice:", e);
        const status = $("#atlas-layer-status");
        if (status) { status.hidden = false; status.textContent = tr("A map source is unavailable. Visible reference layers remain usable.", "মানচিত্রের একটি উৎস অনুপলব্ধ। দৃশ্যমান তথ্যসূত্র স্তর ব্যবহারযোগ্য।"); }
      });

      // Failsafe only for a style that never loaded; slow tiles are not a failure.
      setTimeout(() => {
        if (!loadingHidden && !styleReady) showMapFailure();
      }, 12000);
    } catch (e) {
      console.error("Map initialization error:", e);
      showMapFailure();
    }
  }

  // Dhaka, and the sun over it.
  //
  // The solar position is computed from the absolute instant, which already
  // carries universal time — a clock in the browser is not a local wall
  // clock, and shifting it again would put the sun in the wrong sky.
  // Bangladesh keeps one civil offset all year (UTC+6, no daylight saving),
  // so a reader's "noon" is always six hours away from universal noon.
  const DHAKA_LAT = 23.7449;
  const DHAKA_LNG = 90.4072;

  /**
   * The sun's bearing and height over Dhaka.
   *
   * The NOAA low-precision solar position: good to a fraction of a degree,
   * which is enough to say which faces are lit and not enough to call it an
   * ephemeris. Returns null when the computation cannot be trusted.
   */
  function sunOverDhaka(date) {
    // Any clock that can report a time will do; the caller may hand over a
    // Date from another realm.
    const time = typeof date?.getTime === "function" ? date.getTime() : NaN;
    if (!Number.isFinite(time)) return null;
    const rad = Math.PI / 180;
    const n = time / 86400000 + 2440587.5 - 2451545.0;
    const meanLongitude = (280.460 + 0.9856474 * n) % 360;
    const meanAnomaly = (357.528 + 0.9856003 * n) % 360;
    const eclipticLongitude = (meanLongitude
      + 1.915 * Math.sin(meanAnomaly * rad)
      + 0.020 * Math.sin(2 * meanAnomaly * rad)) * rad;
    const obliquity = (23.439 - 0.0000004 * n) * rad;
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
    const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
    // Greenwich mean sidereal time, in hours, then the local hour angle.
    const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24;
    const localSidereal = (gmstHours + DHAKA_LNG / 15) * 15 * rad;
    let hourAngle = localSidereal - rightAscension;
    hourAngle = ((hourAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const lat = DHAKA_LAT * rad;
    const altitude = Math.asin(Math.sin(lat) * Math.sin(declination)
      + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle));
    const cosAzimuth = (Math.sin(declination) - Math.sin(altitude) * Math.sin(lat))
      / (Math.cos(altitude) * Math.cos(lat));
    if (!Number.isFinite(cosAzimuth)) return null;
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));
    if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
    const altitudeDeg = altitude / rad;
    const azimuthDeg = azimuth / rad;
    if (!Number.isFinite(altitudeDeg) || !Number.isFinite(azimuthDeg)) return null;
    return { altitudeDeg, azimuthDeg };
  }

  /**
   * Light the city from the sun that is actually over it.
   *
   * MapLibre's light takes a bearing in degrees clockwise from north — when
   * the light is anchored to the map — and a polar angle measured from
   * straight above. A sun 40° high is a polar angle of 50°. The tint warms
   * as the sun drops toward the horizon, and once the sun is down the light
   * goes cool and dim, because that is what the hour looks like.
   */
  function applySolarLight() {
    if (!map || typeof map.setLight !== "function") return null;
    const sun = sunOverDhaka(new Date());
    if (!sun) return null;
    const aboveHorizon = sun.altitudeDeg > -0.833; // the sun's own radius at the horizon
    const polar = Math.max(6, Math.min(90, 90 - sun.altitudeDeg));
    const lowSun = aboveHorizon && sun.altitudeDeg < 12;
    try {
      map.setLight({
        anchor: "map",
        position: [1.4, sun.azimuthDeg, polar],
        color: aboveHorizon ? (lowSun ? "#f7dcae" : "#f5f0dc") : "#9fb4d8",
        intensity: aboveHorizon ? (lowSun ? 0.42 : 0.55) : 0.28
      });
    } catch {
      // The style may not be ready yet. The next tick will try again.
      return null;
    }
    return { ...sun, aboveHorizon };
  }

  /**
   * The ground beyond the imagery, in the theme's own colour.
   *
   * The map's style cannot read a CSS variable, so the three themes name
   * their ground here — the same values the stylesheet uses — and the map
   * is told when the theme changes.
   */
  const THEME_GROUND = { dark: "#0d171d", light: "#fcf8ed", contrast: "#050a0d" };
  const FABRIC_COLOURS = {
    dark: {water:"#335b67", street:"#9c967c", edge:"#6d6d5f"},
    light: {water:"#a9c9cd", street:"#6c6350", edge:"#777362"},
    contrast: {water:"#326276", street:"#f1dec0", edge:"#e3dac7"}
  };
  function syncBasemap() {
    if (!map) return;
    for (const [id, selection] of [["basemap-esri", "esri"], ["basemap-osm", "osm"], ["fabric-water", "fabric"], ["fabric-streets", "fabric"]]) {
      if (!map.getLayer(id)) continue;
      const visibility = selection === currentBasemap ? "visible" : "none";
      if (map.getLayoutProperty(id, "visibility") !== visibility) map.setLayoutProperty(id, "visibility", visibility);
    }
    const note = $("#atlas-fabric-note");
    if (note) note.hidden = currentBasemap !== "fabric";
    if (map.getLayer("fabric-courtyards")) map.setPaintProperty("fabric-courtyards", "fill-color",
      THEME_GROUND[document.documentElement.dataset.theme] || THEME_GROUND.dark);
    const theme = document.documentElement.dataset.theme || "dark";
    const colours = FABRIC_COLOURS[theme] || FABRIC_COLOURS.dark;
    for (const [id, key, colour] of [["fabric-water", "fill", colours.water], ["fabric-streets", "line", colours.street]]) {
      if (map.getLayer(id)) {
        map.setPaintProperty(id, key + "-color", colour);
        map.setPaintProperty(id, key + "-opacity", currentLens === "night" ? 0.18 : 1);
      }
    }
    for (const id of ["city-footprints", "parliament-footprints"]) {
      if (map.getLayer(id)) map.setPaintProperty(id, "fill-outline-color",
        currentBasemap === "fabric" ? colours.edge : window.DhakaDesign?.paint || "#b4b0a3");
    }
  }

  function applyGroundColour() {
    if (!map || typeof map.setPaintProperty !== "function") return;
    if (!map.getLayer("atlas-ground")) return;
    const theme = document.documentElement.dataset.theme || "dark";
    map.setPaintProperty("atlas-ground", "background-color", THEME_GROUND[theme] || THEME_GROUND.dark);
    syncBasemap();
  }

  function showMapFailure() {
    const el = $("#atlas-map-loading");
    if (el) { el.classList.remove("loaded"); el.innerHTML = `<strong>${tr("Map unavailable", "মানচিত্র অনুপলব্ধ")}</strong><p>${tr("Map initialization failed. Reload to retry; civic data remains available from City watch.", "মানচিত্র চালু হয়নি। আবার চেষ্টা করতে রিলোড করুন; নগর পর্যবেক্ষণে তথ্য পাওয়া যাবে।")}</p><button class="atlas-btn" onclick="location.reload()">${tr("Retry", "আবার চেষ্টা")}</button>`; }
  }

  // A height outside this range is a bad tag, not a tall building. The
  // atlas clamps it rather than extruding a hundred-kilometre tower.
  const MAX_HEIGHT_M = 500;
  const MIN_HEIGHT_M = 1;

  function buildingPaint(heightKey, baseKey) {
    const raw = ["to-number", ["get", heightKey], 0];
    const height = ["case", [">", raw, MAX_HEIGHT_M], MAX_HEIGHT_M, ["case", ["<", raw, MIN_HEIGHT_M], 0, raw]];
    const rawBase = ["max", 0, ["to-number", ["get", baseKey], 0]];
    const base = ["case", [">", rawBase, MAX_HEIGHT_M], MAX_HEIGHT_M, rawBase];
    return {
      "fill-extrusion-color": window.DhakaDesign?.paint || "#b4b0a3",
      "fill-extrusion-height": ["case", [">", height, base], height, 0],
      "fill-extrusion-base": ["case", [">", height, base], base, 0],
      "fill-extrusion-opacity": 0.9
    };
  }

  function nearParliament() {
    if (!map || map.getZoom() < 14) return false;
    const b = map.getBounds(), [w,s,e,n] = PARLIAMENT_BOUNDS;
    return b.getWest() < e && b.getEast() > w && b.getSouth() < n && b.getNorth() > s;
  }

  function detailFailure() {
    const status = $("#atlas-layer-status");
    if (!status) return;
    status.hidden = false;
    status.textContent = tr("Parliament detail unavailable · detail-footprints-unavailable. Streamed footprints remain.", "সংসদের বিস্তারিত অনুপলব্ধ · detail-footprints-unavailable। মূল সীমারেখা রয়ে গেছে।");
    if (status.appendChild && typeof document.createElement === "function") {
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "atlas-btn";
      retry.textContent = tr("Retry detail", "বিস্তারিত আবার আনুন");
      retry.addEventListener("click", () => loadParliamentBuildings({retry:true})); status.appendChild(retry);
    }
  }

  function maybeLoadParliament() {
    if (!styleReady || !map || parliamentSnapshot) return;
    if (currentLens !== "heritage" && lastRequestedArea !== "parliament" && !nearParliament()) return;
    if (parliamentError) { detailFailure(); return; }
    loadParliamentBuildings();
  }

  function syncBuildingVisibility() {
    if (!map) return;
    maybeLoadParliament();
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
    // Source footprints remain visible in both views; only tagged heights extrude.
    const parliamentVisible = is3D && useSnapshot;
    if (map.getLayer("fabric-courtyards")) {
      const visibility = useSnapshot && currentBasemap === "fabric" ? "visible" : "none";
      if (map.getLayoutProperty("fabric-courtyards", "visibility") !== visibility) {
        map.setLayoutProperty("fabric-courtyards", "visibility", visibility);
      }
    }
    // Flat source footprints stay visible while exploring at low pitch.
    // The street lens draws its own massing, so the city's layer steps aside
    // there: two extrusions of the same footprint at the same height fight
    // each other and the walls shimmer.
    const cityVisible = is3D && !useSnapshot && currentLens !== "walk";
    for (const [id, visible] of [["city-height-buildings", is3D && cityHeightReady && !useSnapshot], ["walk-massing", is3D && !useSnapshot && currentLens === "walk"], ["city-buildings", cityVisible], ["city-footprints", !useSnapshot], ["parliament-buildings", parliamentVisible], ["parliament-footprints", useSnapshot]]) {
      const visibility = visible ? "visible" : "none";
      if (map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== visibility) map.setLayoutProperty(id, "visibility", visibility);
    }
    const desc = $("#atlas-lens-description");
    if (desc) {
      const story = LENS_STORIES[currentLens] || LENS_STORIES.city;
      const base = tr(story.desc, story.desc_bn);
      // The note states what the 3D view is actually standing on. The street
      // lens already says it in its own story, so it is not repeated there.
      const note = !is3D ? "" : useSnapshot
        ? tr("3D: explicit OSM heights only; unknown heights stay flat.", "৩ডি: শুধু OSM-এ নথিভুক্ত উচ্চতা; অজানা উচ্চতা সমতল থাকে।")
        : currentLens === "walk" ? ""
        : tr("3D: published/source-tag heights only; unknown heights stay flat. Partial skyline coverage, not a survey.",
             "৩ডি: শুধু প্রকাশিত/উৎসে নথিভুক্ত উচ্চতা; অজানা উচ্চতা সমতল। আংশিক ভবন-তথ্য, জরিপ নয়।");
      const text = base + (note ? " " + note : "");
      if (desc.textContent !== text) desc.textContent = text;
    }
  }

  function renderSkylineCoverage() {
    const node=$("#atlas-skyline-coverage-summary"); if(!node)return;
    if(!cityHeightReady || !cityHeightSummary){node.textContent=tr("Source-height inventory unavailable · city-heights-unavailable. Unknown heights stay flat.","উচ্চতার তথ্য অনুপলব্ধ · city-heights-unavailable। অজানা উচ্চতা সমতল থাকে।");return;}
    const count=walkNumber(cityHeightSummary.count),areas=walkNumber(cityHeightSummary.areas);
    node.textContent=tr(`${count} source-height footprints in ${areas} capture areas. Partial coverage; not a survey. Captured ${cityHeightSummary.capturedAt.slice(0,10)}.`,`${areas}টি সংগৃহীত এলাকায় ${count}টি উৎসের উচ্চতাসহ সীমারেখা। আংশিক তথ্য; জরিপ নয়। সংগ্রহ ${cityHeightSummary.capturedAt.slice(0,10)}।`);
  }

  async function loadCityHeights() {
    try {
      const response = await fetch("/data/city-height-buildings.geojson", {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error("city-heights-unavailable");
      const data = await response.json();
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features) || !data.features.length ||
          data.features.some(f => !f.geometry || !Number.isFinite(f.properties?.height_m) || f.properties.height_m <= 0 || f.properties.height_m > MAX_HEIGHT_M || !/^https:\/\//.test(f.properties.source_url || ""))) throw new Error("city-heights-invalid");
      for (const feature of data.features) {
        feature.properties.retrieved_at = data.metadata.retrieved_at;
        feature.properties.use_class = window.DhakaDesign?.classify(feature.properties) || "unknown";
      }
      map.addSource("city-heights", {type: "geojson", data});
      map.addLayer({id:"city-height-buildings",type:"fill-extrusion",source:"city-heights",minzoom:14,
        paint:{...buildingPaint("height_m", "min_height_m"),"fill-extrusion-opacity":1}},"city-buildings");
      cityHeightReady = true;
      cityHeightSummary = {count:data.features.length,areas:data.metadata.inputs?.length || null,capturedAt:data.metadata.retrieved_at};
      renderSkylineCoverage();
      map.on("click","city-height-buildings", event => {if(event.features?.[0]) showInspectionHUD("building",event.features[0].properties);});
      syncBuildingVisibility();
    } catch (error) {
      cityHeightReady = false;
      renderSkylineCoverage();
      syncBuildingVisibility();
      console.warn("Source-height skyline unavailable; unknown footprints remain flat",error);
    }
  }

  function loadParliamentBuildings({retry = false} = {}) {
    if (parliamentSnapshot && map.getSource("parliament-detail")) return Promise.resolve();
    if (parliamentPending) return parliamentPending;
    if (parliamentError && !retry) return Promise.resolve();
    parliamentError = null;
    let onData = null;
    const task = (async () => {
    try {
      const res = await fetch("/data/parliament-buildings.geojson", { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("detail-footprints-unavailable");
      const data = await res.json();
      if (data.type !== "FeatureCollection" || !data.features?.length || data.bbox?.length !== 4
        || !data.features.some(f => f.id === "relation/18085267")) throw new Error("invalid-detail-footprints");
      data.features.forEach(f => { f.properties.use_class = window.DhakaDesign?.classify(f.properties) || "unknown"; });
      onData = event => {
        if (event.sourceId !== "parliament-detail" || !event.isSourceLoaded || !parliamentSnapshot) return;
        // Metadata can load before any tile contains a footprint. Do not
        // switch away from the streamed map until local features are present.
        if (!map.querySourceFeatures("parliament-detail").length) return;
        parliamentSourceReady = true;
        map.off("sourcedata", onData);
        syncBuildingVisibility();
      };
      map.on("sourcedata", onData);
      map.addSource("parliament-detail", { type: "geojson", data,
        attribution: `© OpenStreetMap · detail ${data.metadata.retrieved_at.slice(0, 10)} · ODbL` });
      // A transparent layer primes source tiles while visible footprints
      // still come from the streamed basemap.
      map.addLayer({id:"parliament-detail-prime", type:"fill", source:"parliament-detail",
        minzoom:16, paint:{"fill-opacity":0}}, "city-buildings");
      map.addLayer({id:"parliament-footprints",type:"fill",source:"parliament-detail",minzoom:14,layout:{visibility:"none"},
        paint:{"fill-color":window.DhakaDesign?.paint || "#b4b0a3","fill-opacity":0.65}},"city-buildings");
      map.addLayer({ id: "parliament-buildings", type: "fill-extrusion", source: "parliament-detail", minzoom: 14,
        layout: { visibility: "none" }, paint: buildingPaint("height_m", "min_height_m") }, "city-buildings");
      // The generalized water tile covers the entire Assembly outline. Show
      // the exact captured holes as unclassified openings in fabric view.
      const assembly = data.features.find(f => f.id === "relation/18085267").geometry;
      const polygons = assembly.type === "MultiPolygon" ? assembly.coordinates : [assembly.coordinates];
      const openings = polygons.flatMap(polygon => polygon.slice(1));
      map.addSource("fabric-openings", {type:"geojson", data:{type:"FeatureCollection",
        features:openings.map(ring => ({type:"Feature", properties:{}, geometry:{type:"Polygon", coordinates:[ring]}}))
      }});
      map.addLayer({id:"fabric-courtyards", type:"fill", source:"fabric-openings",
        layout:{visibility:"none"}, paint:{"fill-color":THEME_GROUND[document.documentElement.dataset.theme] || THEME_GROUND.dark}},
        "parliament-footprints");
      parliamentSnapshot = data;
      syncBasemap();
      // The source can finish before the layer is attached.
      onData({sourceId:"parliament-detail", isSourceLoaded:map.isSourceLoaded("parliament-detail")});
      map.on("click", "parliament-footprints", event => {
        if (event.features?.[0]) showInspectionHUD("building", event.features[0].properties);
      });
    } catch (error) {
      if (onData) map.off("sourcedata", onData);
      for (const id of ["parliament-buildings","parliament-footprints","fabric-courtyards","parliament-detail-prime"]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("fabric-openings")) map.removeSource("fabric-openings");
      if (map.getSource("parliament-detail")) map.removeSource("parliament-detail");
      parliamentSnapshot = null;
      parliamentSourceReady = false;
      parliamentError = "detail-footprints-unavailable";
      detailFailure();
      syncBuildingVisibility();
      console.warn("Parliament detail unavailable; retaining streamed buildings", error);
    }
    })();
    parliamentPending = task;
    task.finally(() => { if (parliamentPending === task) parliamentPending = null; });
    return task;
  }

  /**
   * Make the streamed city inspectable.
   *
   * Every building in the atlas comes from the map provider, and most of
   * them carry no height at all. A reader who clicks one has to be told
   * what the provider did and did not give — otherwise the massing reads
   * as surveyed architecture when it is not.
   */
  function inspectMapCentre(event) {
    const status = $("#atlas-centre-inspection-status");
    if (!map || !styleReady) {
      if (status) status.textContent = tr("Map is still loading.", "মানচিত্র এখনো লোড হচ্ছে।");
      return;
    }
    const center = map.getCenter();
    const point = map.project(center);
    const layers = ["parliament-buildings", "parliament-footprints", "city-height-buildings", "city-footprints"]
      .filter(id => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
    const [feature] = layers.length ? map.queryRenderedFeatures(point, {layers}) : [];
    if (!feature) {
      if (status) status.textContent = tr("No building visible at the centre. Move or zoom the map and try again.", "কেন্দ্রে কোনো ভবন দেখা যাচ্ছে না। মানচিত্র সরিয়ে বা জুম করে আবার চেষ্টা করুন।");
      return;
    }
    if (status) status.textContent = "";
    showInspectionHUD(feature.layer.id === "city-footprints" ? "streamed-building" : "building", feature.properties, center, event.currentTarget);
  }

  function wireBuildingInspection() {
    for (const layerId of ["city-footprints", "city-buildings", "walk-massing"]) {
      if (!map.getLayer(layerId)) continue;
      map.on("click", layerId, event => {
        const feature = event.features?.[0];
        if (!feature) return;
        // A source-backed tower owns its inspection over the flat tile beneath.
        if (event.point && map.getLayer("city-height-buildings") && map.queryRenderedFeatures(event.point,{layers:["city-height-buildings"]}).length) return;
        showInspectionHUD("streamed-building", { ...feature.properties }, event.lngLat);
      });
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    }
  }

  // The inherited procedural sketch lives at /parliament-reference.html.
  // It has no traceable dimensions and must never replace mapped geometry.

  function renderReferenceStatus() {
    const status = $("#atlas-reference-status");
    if (!status) return;
    status.hidden = referenceFailures.size === 0;
    status.textContent = "";
    const labels = {landmarks:tr("Landmarks","স্থাপনা"),rivers:tr("Rivers","নদী"),transit:tr("Transit","পরিবহন"),economy:tr("Economy","অর্থনীতি"),areas:tr("Districts","এলাকা")};
    for (const [kind, failure] of referenceFailures) {
      const text = `${labels[kind]} · reference-${kind}-unavailable · ${failure}`;
      if (!status.appendChild || typeof document.createElement !== "function") { status.textContent += text; continue; }
      const row=document.createElement("span"); row.textContent=text+" ";
      const retry=document.createElement("button"); retry.type="button"; retry.className="atlas-btn";
      retry.textContent=tr("Retry","আবার চেষ্টা"); retry.addEventListener("click",()=>loadDataLayers(kind)); row.appendChild(retry);status.appendChild(row);
    }
  }

  function loadReference(kind, work, only) {
    if (only && only !== kind) return Promise.resolve();
    if (referencePending.has(kind)) return referencePending.get(kind);
    const task=work().finally(()=>{referencePending.delete(kind);renderReferenceStatus();});
    referencePending.set(kind,task); return task;
  }

  async function loadDataLayers(only = null) {
    return Promise.allSettled([
    loadReference("landmarks", async () => {
    // 1. Landmarks
    try {
      const resLandmarks = await fetch("/dhaka-landmarks.geojson", { signal: AbortSignal.timeout(10000) });
      if (!resLandmarks.ok) throw new Error("reference-source-unavailable");
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
              "circle-color": [
                "match",
                ["get", "category"],
                "civic", "#d96629",
                "finance", "#0093a5",
                "transit", "#0093a5",
                "heritage", "#c5a56e",
                "hydrology", "#257da4",
                "#d96629"
              ],
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
      referenceFailures.delete("landmarks");
    } catch (e) {
      referenceFailures.set("landmarks", new Date().toISOString());
      console.warn("Could not load landmarks layer:", e);
    }
    renderReferenceStatus();
    setupClickInspectors();
    syncReferenceLayers();
    syncBuildingVisibility();
    }, only),
    loadReference("rivers", async () => {
    // 2. Rivers & Khals
    try {
      const resRivers = await fetch("/dhaka-rivers.geojson", { signal: AbortSignal.timeout(10000) });
      if (!resRivers.ok) throw new Error("reference-source-unavailable");
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
      referenceFailures.delete("rivers");
    } catch (e) {
      referenceFailures.set("rivers", new Date().toISOString());
      console.warn("Could not load rivers layer:", e);
    }
    renderReferenceStatus();
    setupClickInspectors();
    syncReferenceLayers();
    syncBuildingVisibility();
    }, only),
    loadReference("transit", async () => {
    // 3. Transit & MRT Line 6
    try {
      const resTransit = await fetch("/dhaka-mrt.geojson", { signal: AbortSignal.timeout(10000) });
      if (!resTransit.ok) throw new Error("reference-source-unavailable");
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
      referenceFailures.delete("transit");
    } catch (e) {
      referenceFailures.set("transit", new Date().toISOString());
      console.warn("Could not load transit layer:", e);
    }
    renderReferenceStatus();
    setupClickInspectors();
    syncReferenceLayers();
    syncBuildingVisibility();
    }, only),
    loadReference("economy", async () => {
    // 4. Economy & Industry
    try {
      const resEconomy = await fetch("/dhaka-economy.geojson", { signal: AbortSignal.timeout(10000) });
      if (!resEconomy.ok) throw new Error("reference-source-unavailable");
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
      referenceFailures.delete("economy");
    } catch (e) {
      referenceFailures.set("economy", new Date().toISOString());
      console.warn("Could not load economy layer:", e);
    }
    renderReferenceStatus();
    setupClickInspectors();
    syncReferenceLayers();
    syncBuildingVisibility();
    }, only),
    loadReference("areas", async () => {
    // 5. Curated Areas for Quick Jump
    try {
      const resAreas = await fetch("/dhaka-areas.json", { signal: AbortSignal.timeout(10000) });
      if (!resAreas.ok) throw new Error("reference-source-unavailable");
      if (resAreas.ok) {
        areasData = await resAreas.json();
        populateQuickJump(areasData);
        // The walkthrough needs the district list, which arrives after the map.
        window.AtlasWalk?.attach(map, areasData);
        const areaId = new URLSearchParams(window.location.search).get("area");
        const initialArea = areasData.find(area => area.id === areaId);
        if (initialArea && currentLens === "city" && openingAreaIntent && !lastRequestedArea) flyToArea(initialArea, 0);
        openingAreaIntent = false;
      }
      referenceFailures.delete("areas");
    } catch (e) {
      referenceFailures.set("areas", new Date().toISOString());
      console.warn("Could not load areas json:", e);
    }
    renderReferenceStatus();
    setupClickInspectors();
    syncReferenceLayers();
    syncBuildingVisibility();
    }, only)
    ]);
  }

  function setupClickInspectors() {
    if (map.getLayer("landmarks-points") && !inspectionLayers.has("landmarks-points")) { inspectionLayers.add("landmarks-points"); map.on("click", "landmarks-points", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("landmark", e.features[0].properties);
    }); }

    if (map.getLayer("rivers-gauges") && !inspectionLayers.has("rivers-gauges")) { inspectionLayers.add("rivers-gauges"); map.on("click", "rivers-gauges", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("gauge", e.features[0].properties);
    }); }

    if (map.getLayer("transit-stations") && !inspectionLayers.has("transit-stations")) { inspectionLayers.add("transit-stations"); map.on("click", "transit-stations", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("station", e.features[0].properties);
    }); }

    if (map.getLayer("economy-hubs") && !inspectionLayers.has("economy-hubs")) { inspectionLayers.add("economy-hubs"); map.on("click", "economy-hubs", e => {
      if (!e.features || !e.features[0]) return;
      showInspectionHUD("economy", e.features[0].properties);
    }); }

    ["landmarks-points", "rivers-gauges", "transit-stations", "economy-hubs"].forEach(layerId => {
      if (map.getLayer(layerId) && !hoverLayers.has(layerId)) {
        hoverLayers.add(layerId);
        map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
      }
    });
  }

  function showInspectionHUD(type, props, lngLat, opener) {
    // Map tags are public external data, not trusted HTML.
    props = Object.fromEntries(Object.entries(props).map(([key,value]) => [key, typeof value === 'string' ? value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : value]));
    const hud = $("#atlas-observation-hud");
    if (!hud) return;
    if (hud.dataset) hud.dataset.owner = "feature";
    hud.classList.remove('people-inspection');

    const isBn = document.documentElement.lang === "bn";
    const name = (isBn && props.name_bn) ? props.name_bn : props.name;
    const desc = (isBn && props.description_bn) ? props.description_bn : (props.description || props.role || "");

    let rowsHtml = "";
    if (type === "gauge") {
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">${tr('River','নদী')}:</span><span class="hud-value">${props.river || tr('Unknown','অজানা')}</span></div>
        <div class="hud-row"><span class="hud-label">${tr('Reference code','তথ্যসূত্র কোড')}:</span><span class="hud-value">${props.station_id || tr('Unknown','অজানা')}</span></div>
        <div class="hud-row"><span class="hud-label">${tr('Unverified threshold','যাচাইহীন বিপদসীমা')}:</span><span class="hud-value">${Number.isFinite(props.danger_level_m) ? props.danger_level_m+' m' : tr('Unknown','অজানা')}</span></div>
        <p>${tr('Location, code match, threshold and vertical datum are unverified. Provider link is not evidence of a surveyed gauge location.','অবস্থান, কোডের মিল, বিপদসীমা ও উচ্চতার ভিত্তি যাচাই হয়নি। উৎসের লিংক দিয়ে গেজের জরিপকৃত অবস্থান প্রতিষ্ঠা হয় না।')}</p>
        <div class="hud-row"><span class="hud-label">${tr('Current reading','বর্তমান পাঠ')}:</span><span class="hud-value" style="color:var(--dim)">${tr("Unavailable · no connected gauge feed", "অনুপলব্ধ · পর্যবেক্ষণ সংযুক্ত নেই")}</span></div>
        <div class="hud-row"><span class="hud-label">${tr('Status','অবস্থা')}:</span><span class="hud-value">${tr("Reference station · not a live reading", "তথ্যসূত্র স্টেশন · সরাসরি পর্যবেক্ষণ নয়")}</span></div>
      `;
    } else if (type === "building") {
      const levels = props.floors ?? props.levels;
      const sourceId = /^(way|relation)\/\d+$/.test(props.osm_id || "") ? props.osm_id : null;
      const use = ({apartments:tr("Apartments","অ্যাপার্টমেন্ট"), retail:tr("Retail / markets","খুচরা / বাজার"), mosque:tr("Religious use","ধর্মীয় ব্যবহার"), education:tr("Education","শিক্ষা"), healthcare:tr("Healthcare","স্বাস্থ্যসেবা"), civic:tr("Civic / community","নাগরিক / সামাজিক"), commerce:tr("Commerce","বাণিজ্য"), homes:tr("Homes","আবাসন"), industry:tr("Industry / utilities","শিল্প / পরিষেবা"), unknown:tr("Use unknown","ব্যবহার অজানা")})[props.use_class] || tr("Use unknown","ব্যবহার অজানা");
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">${tr("Mapped use", "নথিভুক্ত ব্যবহার")}</span><span class="hud-value">${use}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Block height", "ভবনের উচ্চতা")}</span><span class="hud-value">${Number.isFinite(props.height_m) ? props.height_m+" m" : tr("Unknown · flat footprint","অজানা · সমতল সীমারেখা")}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Height method", "উচ্চতার পদ্ধতি")}</span><span class="hud-value">${props.height_method === "published-project-height" ? tr("Published project height; OSM value differs", "প্রকল্পের প্রকাশিত উচ্চতা; OSM মান ভিন্ন") : props.height_method === "osm-height-tag" ? tr("OSM height tag · not surveyed", "OSM উচ্চতার তথ্য · জরিপ নয়") : tr("No source height; levels are not metres", "উৎসে উচ্চতা নেই; তলার সংখ্যা মিটার নয়")}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Snapshot", "উপাত্ত সংগ্রহ")}</span><span class="hud-value">${(props.retrieved_at || parliamentSnapshot?.metadata.retrieved_at || "").slice(0, 10)}</span></div>
        ${Number.isFinite(levels) && levels > 0 ? `<div class="hud-row"><span class="hud-label">${tr("Reported storeys", "উৎসে নথিভুক্ত তলা")}</span><span class="hud-value">${new Intl.NumberFormat(isBn ? "bn-BD" : "en").format(levels)}</span></div>` : ""}
        <div class="hud-row"><span class="hud-label">${tr("Footprint source", "সীমারেখার উৎস")}</span><span class="hud-value">${sourceId ? `<a href="https://www.openstreetmap.org/${sourceId}" target="_blank" rel="noopener noreferrer">${sourceId}</a>` : "OpenStreetMap"} · ODbL</span></div>

        ${/^https:\/\//.test(props.height_source_url || "") ? `<p><a href="${props.height_source_url}" target="_blank" rel="noopener noreferrer">${tr("Height source", "উচ্চতার উৎস")}</a>${props.osm_height_m != null ? ` · OSM: ${props.osm_height_m} m` : ""}</p>` : ""}
        <p>${tr("Mapped footprint massing; not a surveyed architectural model.", "মানচিত্রভিত্তিক ভবনের রূপ; জরিপকৃত স্থাপত্য মডেল নয়।")}</p>
      `;
    } else if (type === "streamed-building") {
      // The provider's own numbers, said plainly. A massing drawn from a
      // computed height must never read as a measured building.
      const providerHeight = Number(props.render_height || 0);
      const providerBase = Number(props.render_min_height || 0);
      const hasHeight = Number.isFinite(providerHeight) && providerHeight >= 1;
      const coordinates = lngLat
        ? `${lngLat.lng.toFixed(5)}, ${lngLat.lat.toFixed(5)}`
        : tr("Unknown", "অজানা");
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">${tr("Unused provider value", "অব্যবহৃত সরবরাহকারীর মান")}</span><span class="hud-value">${hasHeight ? `${providerHeight} m` : tr("None · flat footprint", "নেই · সমতল সীমারেখা")}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Height method", "উচ্চতার পদ্ধতি")}</span><span class="hud-value">${hasHeight
          ? tr("Computed provider value; not used for extrusion", "সরবরাহকারীর গণনাকৃত মান; ভবনের উচ্চতায় ব্যবহৃত নয়")
          : tr("No height in the source", "উৎসে উচ্চতা নেই")}</span></div>
        ${hasHeight && providerBase > 0 ? `<div class="hud-row"><span class="hud-label">${tr("Provider base", "সরবরাহকারীর ভিত্তি")}</span><span class="hud-value">${providerBase} m</span></div>` : ""}
        <div class="hud-row"><span class="hud-label">${tr("Footprint source", "সীমারেখার উৎস")}</span><span class="hud-value">${tr("OpenStreetMap ODbL · OpenFreeMap", "OpenStreetMap ODbL · OpenFreeMap")}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Coordinates", "স্থানাঙ্ক")}</span><span class="hud-value">${coordinates}</span></div>
        <p>${tr("This streamed footprint stays flat without an explicit source height. Source-backed heights, where available, form a separate layer.", "উৎসের নির্দিষ্ট উচ্চতা ছাড়া এই সীমারেখা সমতল থাকে। উৎসসমর্থিত উচ্চতা থাকলে তা আলাদা স্তরে দেখানো হয়।")}</p>
      `;
    } else if (type === "landmark") {
      rowsHtml = `
        <div class="hud-row"><span class="hud-label">Year / Era:</span><span class="hud-value">${props.year || "Historic"}</span></div>
        <div class="hud-row"><span class="hud-label">Category:</span><span class="hud-value">${props.category}</span></div>
        <div class="hud-row"><span class="hud-label">${tr("Unverified registry height:","যাচাইহীন তালিকার উচ্চতা:")}</span><span class="hud-value">${Number.isFinite(props.height_m) ? props.height_m+" m" : tr("Unknown","অজানা")}</span></div>
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

    // A streamed building carries no name of its own. The panel must not
    // print "undefined" or leak an internal type name to the reader.
    const title = name || (type === "streamed-building" ? tr("Building", "ভবন") : tr("Feature", "বৈশিষ্ট্য"));
    const badge = (type === "building" || type === "streamed-building")
      ? tr("building", "ভবন")
      : type;
    hud.innerHTML = `
      <div class="hud-header">
        <div>
          <h4 class="hud-title">${title}</h4>
          <span class="hud-badge">${badge}</span>
        </div>
        <button type="button" class="modal-close-btn" aria-label="${tr("Close feature details", "বৈশিষ্ট্যের তথ্য বন্ধ করুন")}">✕</button>
      </div>
      ${rowsHtml}
      <p style="margin:8px 0 0;font-size:var(--text-micro);color:var(--dim);">${desc}</p>
    `;
    const close = hud.querySelector?.(".modal-close-btn");
    if (close) close.onclick = () => { hud.hidden = true; opener?.focus(); };
    hud.onkeydown = event => {
      if (!opener || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      hud.hidden = true;
      opener.focus();
    };
    hud.hidden = false;
    if (opener) close?.focus();
  }

  let radarTimer = null;
  let radarToggle = null;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  function pauseRadar() {
    clearInterval(radarTimer);
    radarTimer = null;
    if (radarToggle) { radarToggle.textContent = tr('Play radar','রাডার চালান'); radarToggle.disabled = reducedMotion(); }
  }
  function stopMapMotion() { pauseRadar(); window.AtlasForecast?.pause(); window.AtlasWalk?.stop(); map?.stop?.(); }

  let dynamicLayers = [];
  let dynamicClickHandlers = [];
  function onDynamicClick(id, handler) {
    map.on("click", id, handler);
    dynamicClickHandlers.push({id, handler});
  }
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
      layer: "VIIRS_NOAA20_DayNightBand",
      level: 7, ext: "png", maxzoom: 7,
      probe: { z: 7, y: 55, x: 96 },
      label: ["NASA VIIRS Day/Night Band (NOAA-20) · night-time radiance", "নাসা ভিআইআইআরএস ডে/নাইট ব্যান্ড (নোয়া-২০) · রাতের দীপ্তি"],
      // Night radiance over a daylight basemap reads as fog. The raster is
      // opaque enough to carry the image on its own, and the basemap is dimmed
      // for this lens so the lit city stands against a dark ground.
      opacity: 0.95
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
  // non-empty, and — for the VIIRS Day/Night Band at 2026-10-28 — exactly
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
      return false;
    }
    if (!blob.size) return false;
    try {
      const bitmap = await createImageBitmap(blob);
      const ctx = gibsContext2d(bitmap.width, bitmap.height);
      if (!ctx) { bitmap.close?.(); return false; }
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
      // Bytes alone cannot establish a usable observation.
      return false;
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
    people: { center: [90.40, 23.78], zoom: 11.8, pitch: 35, bearing: 0 },
    city: { center: [90.4075, 23.7703], zoom: 16.5, pitch: 55, bearing: -25 },
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
    water: { center: [90.6, 24.2], zoom: 8.5, pitch: 20, bearing: 0 },
    // Eye level. MapLibre caps the pitch at 85°, which is as close to a
    // standing pedestrian as a map camera gets: the street runs to the
    // horizon and the walls close in on both sides.
    walk: { center: [90.4072, 23.7118], zoom: 18.4, pitch: 85, bearing: 205 }
  };

  function clearDynamicLayers() {
    for (const {id, handler} of dynamicClickHandlers) map?.off("click", id, handler);
    dynamicClickHandlers = [];
    pauseRadar();
    radarToggle = null;
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

  // Low-angle map exploration preserves source footprints and manual controls.
  // Authored bookmarks do not establish street position, access or walkability.
  // The credited external link opens the map target, not a geolocated reader.
  const SCOUT_BASE = "https://tools.oyasumi-gamedev.com/rokehan/";

  function walkNumber(n) {
    return new Intl.NumberFormat(document.documentElement.lang === "bn" ? "bn-BD" : "en-GB", { maximumFractionDigits: 0 }).format(n);
  }

  function streetScoutUrl() {
    if (!map) return SCOUT_BASE;
    const c = map.getCenter();
    let nearest = null;
    let nearestD = Infinity;
    for (const a of areasData || []) {
      const d = (a.lat - c.lat) ** 2 + (a.lng - c.lng) ** 2;
      if (d < nearestD) { nearestD = d; nearest = a; }
    }
    const isBn = document.documentElement.lang === "bn";
    const name = nearest ? (isBn && nearest.name_bn ? nearest.name_bn : nearest.name) : "Dhaka";
    const params = new URLSearchParams({
      ll: `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`,
      s: "100",
      far: "1",
      tod: "day",
      n: name
    });
    return `${SCOUT_BASE}#${params.toString()}`;
  }

  /**
   * The buildings the screen actually holds.
   *
   * Returns null while the map is still settling — the camera is moving,
   * or the tiles it is about to draw have not arrived. A reading taken
   * then would be a fraction of the view, and a fraction printed as a
   * total is the one reading this instrument must never publish.
   */
  function measureStreetLevel() {
    if (!map || typeof map.queryRenderedFeatures !== "function") return null;
    if (!mapIdle) return null;
    if (typeof map.areTilesLoaded === "function" && !map.areTilesLoaded()) return null;
    if (typeof map.isSourceLoaded === "function" && !map.isSourceLoaded("buildings")) return null;
    const layers=["city-footprints","parliament-footprints"].filter(id=>map.getLayer(id) && map.getLayoutProperty(id,"visibility")!=="none");
    if (!layers.length) return null;
    try {
      const features=map.queryRenderedFeatures({layers});
      const ids=new Set(); let unidentified=0; let withProviderHeight=0;
      for (const feature of features || []) {
        if (feature.properties?.hide_3d) continue;
        const id=feature.id ?? feature.properties?.osm_id ?? feature.properties?.['@id'];
        if (typeof id!=="string" && typeof id!=="number") { unidentified++; continue; }
        const key=`${feature.source || ""}/${feature.sourceLayer || ""}/${id}`;
        // One building is one building: the same footprint can arrive in
        // more than one tile.
        if (ids.has(key)) continue;
        ids.add(key);
        // How many of the buildings in view stand on a provider-computed
        // height rather than a surveyed one.
        if (Number(feature.properties?.render_height || 0) > 0) withProviderHeight++;
      }
      // This is a partial, identified footprint count, not a building census.
      return {total:ids.size, unidentified, withProviderHeight};
    } catch { return null; }
  }

  /**
   * The count on screen.
   *
   * Two readings that agree, taken half a second apart, mean the map has
   * stopped changing: the tiles it shows have arrived and the camera has
   * settled. Until then the panel says the street is being read, because
   * the honest state of a loading map is not a number — it is no number.
   */
  let walkSampleKey = null;
  let walkSampleAt = 0;

  /**
   * Keep the count current while the walkthrough is open.
   *
   * The camera can walk while the panel is up, and a number that froze
   * while the city moved is a stale reading. The cadence is a short chain
   * of timeouts rather than an interval, so it stops the moment the lens
   * changes and never outlives the panel it serves.
   */
  let walkCountTimer = null;
  function scheduleWalkCount() {
    if (walkCountTimer) return;
    walkCountTimer = setTimeout(() => {
      walkCountTimer = null;
      if (currentLens !== "walk") return;
      refreshWalkCount();
      scheduleWalkCount();
    }, 500);
  }
  function refreshWalkCount() {
    const reading = measureStreetLevel();
    const key = reading ? `${reading.total}/${reading.unidentified}/${reading.withProviderHeight}` : "pending";
    const now = Date.now();
    const stable = key !== "pending" && key === walkSampleKey && (now - walkSampleAt) >= 500;
    walkSampleKey = key;
    walkSampleAt = now;
    paintWalkCount(stable ? reading : null);
  }

  function paintWalkCount(reading) {
    const countsEl = $("#atlas-walk-counts");
    if (!countsEl) return;
    if (!reading) {
      // The map has not finished drawing. The reader is told the count is
      // being read, not handed a smaller number.
      countsEl.textContent = tr("Reading the street…", "রাস্তা পড়া হচ্ছে…");
      return;
    }
    const counted = reading.total > 0;
    if (!counted) {
      countsEl.textContent = tr("Building count unavailable.","ভবনের সংখ্যা অনুপলব্ধ।");
      return;
    }
    // The number and the words agree with each other. "1 buildings in view"
    // is the kind of line that makes a reader stop trusting the number.
    const total = walkNumber(reading.total);
    const unidentified = walkNumber(reading.unidentified);
    countsEl.textContent = tr(
      `${total} unique identified rendered footprints${reading.unidentified ? ` · ${unidentified} unidentified fragments excluded` : ""}; not a census`,
      `${total}টি স্বতন্ত্র শনাক্তকৃত দৃশ্যমান সীমারেখা${reading.unidentified ? ` · ${unidentified}টি অশনাক্ত অংশ বাদ` : ""}; ভবনশুমারি নয়`);

  }

  function renderWalkPanel() {
    const panel = $("#atlas-walk");
    if (!panel) return;
    const isWalk = currentLens === "walk";
    panel.hidden = !isWalk;
    if (!isWalk) return;
    const isBn = document.documentElement.lang === "bn";

    // The count is owned by the settled-reading rule, not by this render:
    // a reading that is not stable yet is published as "being read", never
    // as a smaller number.
    refreshWalkCount();

    const summary = $("#atlas-walk-summary");
    if (summary) summary.textContent = isBn ? "কীভাবে মাপা হয়েছে" : "How this is measured";

    const note = $("#atlas-walk-note");
    if (note) note.textContent = tr("Source heights only; unknown flat. Not a walking route.","শুধু উৎসের উচ্চতা; অজানা সমতল। হাঁটার পথ নয়।");
    const ground = $("#atlas-walk-ground");
    if (ground) ground.textContent = tr(
      "The ground is the map's flat plane; the atlas carries no elevation model. These viewpoints are not a walking route and do not establish street access.",
      "মাটি মানচিত্রের সমতল; মানচিত্রে উচ্চতার মডেল নেই। এই দৃশ্যগুলো হাঁটার পথ নয় এবং রাস্তায় প্রবেশযোগ্যতা প্রমাণ করে না।");
    const legend = $("#atlas-walk-legend-text");
    if (legend) legend.textContent = tr("Published/source-tag heights; partial coverage, not surveyed","প্রকাশিত/উৎসের উচ্চতা; আংশিক তথ্য, জরিপ নয়");

    const scout = $("#atlas-walk-scout");
    if (scout) {
      scout.href = streetScoutUrl();
      scout.textContent = isBn ? "রাস্তার দৃশ্য রেন্ডার খুলুন ↗" : "Open the street scene render ↗";
    }

    const credit = $("#atlas-walk-credit");
    if (credit) credit.textContent = isBn
      ? "রাস্তার দৃশ্য রেন্ডার: Location Scout (oyasumi-gamedev.com) · OpenStreetMap / OpenFreeMap। এর জ্যামিতি ও প্রবেশের অনুমান আলাদা। নতুন ট্যাবে খোলে।"
      : "Street scene render by Location Scout (oyasumi-gamedev.com) · OpenStreetMap / OpenFreeMap. Its geometry and access assumptions are separate. Opens in a new tab.";
  }

  function syncReferenceLayers() {
    if (!map) return;
    const isBn = document.documentElement.lang === "bn";
    if (map.getLayer("rivers-lines")) {
      map.setLayoutProperty("rivers-lines", "visibility", (currentLens === "rivers" || currentLens === "city") ? "visible" : "none");
    }
    if (map.getLayer("rivers-gauges")) {
      map.setLayoutProperty("rivers-gauges", "visibility", (currentLens === "rivers" || currentLens === "city") ? "visible" : "none");
    }
    if (map.getLayer("mrt-track")) {
      map.setLayoutProperty("mrt-track", "visibility", (currentLens === "transit" || currentLens === "city") ? "visible" : "none");
    }
    if (map.getLayer("expressway-track")) {
      map.setLayoutProperty("expressway-track", "visibility", (currentLens === "transit" || currentLens === "city") ? "visible" : "none");
    }
    if (map.getLayer("transit-stations")) {
      map.setLayoutProperty("transit-stations", "visibility", (currentLens === "transit" || currentLens === "city") ? "visible" : "none");
    }
    if (map.getLayer("economy-hubs")) {
      map.setLayoutProperty("economy-hubs", "visibility", (currentLens === "economy" || currentLens === "city") ? "visible" : "none");
    }
    if (map.getLayer("landmarks-labels")) {
      map.setLayoutProperty("landmarks-labels", "visibility", (currentLens === "heritage" || currentLens === "city") ? "visible" : "none");
      map.setLayoutProperty("landmarks-labels", "text-field", ["coalesce", ["get", isBn ? "name_bn" : "name"], ["get", "name"]]);
    }
    if (map.getLayer("landmarks-points")) {
      map.setLayoutProperty("landmarks-points", "visibility", (currentLens === "heritage" || currentLens === "city") ? "visible" : "none");
    }
  }

  function applyLens(lensId, { moveCamera = lensId !== currentLens } = {}) {
    // A lens the atlas does not have — a stale bookmark, a renamed view —
    // must land on a real lens rather than on a map with nothing drawn.
    const wanted = LENS_STORIES[lensId] ? lensId : "city";
    lensId = wanted;
    stopMapMotion();
    if (lensId !== currentLens) cancelCameraWork();
    currentLens = lensId;
    const token = ++lensToken;
    if ($("#atlas-lens")) $("#atlas-lens").value = lensId;
    lensInUrl(lensId);
    window.AtlasForecast?.activate(lensId);
    window.AtlasWalk?.activate(lensId);
    if (lensId === "walk") scheduleWalkCount();

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
    // The walkthrough owns its own camera: a street-level viewpoint is a
    // function of the zoom and the window, so the lens table's fixed
    // viewport would undo it.
    if (moveCamera && !["air", "rivers", "walk"].includes(lensId) && vp && typeof map.flyTo === "function") {
      map.flyTo({
        center: vp.center,
        zoom: vp.zoom,
        pitch: is3D ? vp.pitch : 0,
        bearing: is3D ? vp.bearing : 0,
        essential: false,
        duration: 250
      });
    }

    clearDynamicLayers();
    window.AtlasPeople?.activate(lensId);
    if (["haze", "rain", "radar"].includes(lensId)) loadLensEvidence(lensId);

    syncReferenceLayers();
    // The street-level massing belongs to the walkthrough and street lens.
    // Every other lens must see the city as the atlas draws it.
    if (map.getLayer("walk-massing")) {
      map.setLayoutProperty("walk-massing", "visibility", lensId === "walk" ? "visible" : "none");
    }
    renderWalkPanel();
    // Night-time radiance only reads as night over a dark ground. Dim the
    // daylight basemap for that lens and restore it for every other one.
    for (const basemapId of ["basemap-esri", "basemap-osm"]) {
      if (map.getLayer(basemapId)) {
        map.setPaintProperty(basemapId, "raster-opacity", lensId === "night" ? 0.18 : 1);
      }
    }
    syncBasemap();
    syncBuildingVisibility();

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
    addRasterOverlay(overlayId, gibsTileUrl(spec, obs.date), spec.maxzoom, spec.opacity ?? 0.75);
    if (layerStatus) {
      layerStatus.hidden = false;
      const when = obs.dated
        ? tr(`observation ${obs.date}`, `পর্যবেক্ষণ ${obs.date}`)
        : tr("latest available observation (exact date unresolved)", "সর্বশেষ উপলব্ধ পর্যবেক্ষণ (সঠিক তারিখ নিশ্চিত নয়)");
      layerStatus.textContent = `${tr(spec.label[0], spec.label[1])} · ${when}`;
    }
  }

  async function loadLensEvidence(lens, requestToken = lensToken) {
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
        if (currentLens !== lens || requestToken !== lensToken) return;
        const frames = data.radar?.past || [];
        if (!frames.length || !data.host?.startsWith("https://")) throw new Error("radar-no-frame");
        let fIdx = frames.length - 1;
        function showRadarFrame(i) {
          if (currentLens !== "radar" || requestToken !== lensToken || !map) return;
          const fr = frames[i];
          const tileUrl = `${data.host}${fr.path}/256/{z}/{x}/{y}/2/1_1.png`;
          if (map.getLayer("rain-radar")) map.removeLayer("rain-radar");
          if (map.getSource("rain-radar")) map.removeSource("rain-radar");
          addRasterOverlay("rain-radar", tileUrl, 7);
          const tStr = new Date(fr.time * 1000).toLocaleTimeString(isBn ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
          if (status) {
            const label = status.querySelector?.('output');
            if (label) label.textContent = `${tr("Radar frame ", "রাডার ধাপ ")}${i + 1}/${frames.length} · ${tStr} BST`;
          }
        }
        if (status) {
          status.innerHTML = `<output></output> <button id="radar-play" class="atlas-btn" type="button">${tr('Play radar','রাডার চালান')}</button>`;
          radarToggle = status.querySelector?.('#radar-play');
          if (radarToggle) radarToggle.onclick = () => {
            if (radarTimer) { pauseRadar(); return; }
            if (document.hidden || reducedMotion() || frames.length < 2) return;
            radarToggle.textContent = tr('Pause radar','রাডার থামান');
            radarTimer = setInterval(() => {
              if (currentLens !== 'radar' || document.hidden || reducedMotion()) { pauseRadar(); return; }
              fIdx = (fIdx + 1) % frames.length;
              showRadarFrame(fIdx);
            }, 1200);
          };
          if (radarToggle && reducedMotion()) {
            radarToggle.disabled = true;
            radarToggle.title = tr('Animation disabled by reduced-motion preference','কম গতির পছন্দ অনুযায়ী অ্যানিমেশন বন্ধ');
          }
        }
        showRadarFrame(fIdx);
      } else if (lens === "rain") {
        const res = await fetch("/api/atlas/rainfall", { signal: AbortSignal.timeout(15000) });
        const data = await res.json();
        if (currentLens !== lens || requestToken !== lensToken) return;
        if (!res.ok || data.status !== "ok" || !data.catchments?.length) throw new Error(data.reasonCode || "feed-unavailable");
        if (status) status.textContent = tr("Modeled rainfall · next 24 h: ", "মডেলভিত্তিক বৃষ্টি · পরের ২৪ ঘণ্টা: ") + data.catchments.map(p => `${isBn ? p.name_bn || p.name : p.name}: ${p.rain_24h_sum_mm?.toFixed(1)} mm`).join(" · ");
        const geojson = {
          type: "FeatureCollection",
          features: data.catchments.filter(c => c.status === "ok" && Number.isFinite(c.rain_24h_sum_mm)).map(c => {
            const rain = c.rain_24h_sum_mm;
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
                validFrom: c.validFrom, validTo: c.validTo, retrievedAt: c.retrievedAt,
                source: c.source, latitude: c.lat, longitude: c.lng,
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
          onDynamicClick("catchment-rain-circles", e => {
            if (!e.features?.[0]) return;
            const p = e.features[0].properties;
            const hud = $("#atlas-observation-hud");
            if (!hud) return;
            hud.hidden = false;
            const text = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
            hud.innerHTML = `<h3>${text(p.name)}</h3>
              <div style="margin:4px 0;"><strong>${tr("24h precipitation forecast:","২৪ ঘণ্টার বৃষ্টিপাত পূর্বাভাস:")}</strong> ${Number(p.rain_24h_sum_mm).toFixed(1)} mm</div>
              <div style="font-size:var(--text-micro);color:var(--dim);">${tr("Query-point model total; not a catchment average or flood warning.","অনুসন্ধানের স্থানের মডেলের মোট; অববাহিকার গড় বা বন্যার সতর্কবার্তা নয়।")}</div>
              <p>${tr('Valid interval (UTC)','প্রযোজ্য সময় (UTC)')}: ${text(p.validFrom)} – ${text(p.validTo)}</p>
              <p>${tr('Source / retrieved','উৎস / সংগৃহীত')}: ${text(p.source)} · ${text(p.retrievedAt)}</p>
              <p>${tr('Query coordinates','অনুসন্ধানের স্থানাঙ্ক')}: ${text(p.latitude)}, ${text(p.longitude)}</p>
              <button type="button" class="atlas-btn" style="margin-top:8px;width:100%;" onclick="document.getElementById('atlas-observation-hud').hidden=true">${tr("Close","বন্ধ করুন")}</button>`;
          });
        }
      } else if (lens === "haze") {
        const res = await fetch("/api/atlas/wind", { signal: AbortSignal.timeout(15000) });
        const data = await res.json();
        if (currentLens !== lens || requestToken !== lensToken) return;
        const wind = data?.data?.current;
        const windSpeed = Number.isFinite(wind?.wind_speed_10m) ? Number(wind.wind_speed_10m).toFixed(1) : null;
        const windDir = Number.isFinite(wind?.wind_direction_10m) ? Math.round(wind.wind_direction_10m) : null;
        const cardinals = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
        const cardinal = windDir !== null ? cardinals[Math.round(windDir / 22.5) % 16] : "";
        if (windSpeed && windDir !== null) {
          if (status) status.textContent = `${tr("Surface wind: ","ভূপৃষ্ঠের বাতাস: ")}${windSpeed} km/h ${tr("from ","দিক: ")}${windDir}° (${cardinal}) · ${tr("Modeled surface wind only; smoke transport is not established","কেবল মডেলভিত্তিক ভূপৃষ্ঠের বাতাস; ধোঁয়া পরিবহন নির্ধারিত নয়")}`;
        } else {
          if (status) status.textContent = tr("Reference kiln regions; wind data unavailable","ইটভাটার আঞ্চলিক তথ্যসূত্র; বাতাসের উপাত্ত অনুপলব্ধ");
        }
        // GSH law (27 Oct 2026): Prefer no pin over a wrong pin. Brick kiln
        // locations are unverified reference regions with no verified
        // coordinates — no pins are drawn until a source (OSM hit, GPS,
        // official station id, or recorded hand pin) exists with a source URL
        // and timestamp. Surface wind status above remains the only haze-layer
        // output.
      }
    } catch {
      if (currentLens === lens && requestToken === lensToken && status) status.textContent = tr("Evidence unavailable for this lens. No current observation is shown.", "এই স্তরের উপাত্ত অনুপলব্ধ। বর্তমান পর্যবেক্ষণ দেখানো হচ্ছে না।");
    }
  }

  function addRasterOverlay(id, tileUrl, maxzoom = 9, opacity = 0.75) {
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
        paint: { "raster-opacity": opacity }
      }, map.getLayer("parliament-buildings") ? "parliament-buildings" : "city-buildings");
      activeOverlayLayer = id;
    } catch (e) {
      console.warn("Could not add raster overlay:", id, e);
    }
  }

  function wireUIEvents() {
    document.addEventListener?.('visibilitychange', () => {
      if (document.hidden) { stopMapMotion(); pauseBackground(); }
      else { scheduleWatch(); scheduleSolar(); }
    });
    window.addEventListener('pagehide', () => { stopMapMotion(); pauseBackground(); });
    window.addEventListener('pageshow', () => { if (!document.hidden) { scheduleWatch(); scheduleSolar(); } });
    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', stopMapMotion);
    $("#atlas-lens")?.addEventListener("change", e => applyLens(e.target.value));
    $("#atlas-centre-inspection")?.addEventListener("click", inspectMapCentre);

    $("#atlas-basemap")?.addEventListener("change", e => {
      currentBasemap = e.target.value;
      syncBasemap();
      syncBuildingVisibility();
    });

    $("#atlas-view")?.addEventListener("change", e => {
      const is3D = e.target.value === "3d";
      if (map) {
        syncBuildingVisibility();
        map.easeTo({
          pitch: is3D ? 50 : 0,
          bearing: is3D ? 15 : 0,
          duration: 250
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
      renderSkylineCoverage();
      renderReferenceStatus();
    });

    // The map's ground follows the theme, so the page is one surface.
    window.addEventListener("atlas:theme", () => {
      applyGroundColour();
    });
  }

  function cancelCameraWork() {
    openingAreaIntent = false;
    searchRevision++; searchController?.abort(); searchController = null;
  }

  async function performSearch(query) {
    openingAreaIntent = false;
    searchController?.abort(); const controller = new AbortController(); searchController = controller;
    const revision = ++searchRevision;
    try {
      const res = await fetch(`/api/atlas/search?q=${encodeURIComponent(query)}`, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])});
      if (!res.ok) return;
      const data = await res.json();
      if (revision !== searchRevision || controller.signal.aborted || document.hidden) return;
      if (data.results && data.results.length > 0) {
        const first = data.results[0];
        const lon = Number(first.lon), lat = Number(first.lat);
        if (map && Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
          map.flyTo({
            center: [lon, lat],
            zoom: 15,
            pitch: 50,
            duration: 250
          });
        }
      }
    } catch (err) {
      console.warn("Search error:", err);
    }
  }

  function flyToArea(area, duration = 250) {
    if (!map) return;
    cancelCameraWork();
    lastRequestedArea = area.id;
    if (area.id === "parliament" && styleReady) loadParliamentBuildings();
    const is3D = $("#atlas-view")?.value !== "2d";
    const width = map.getContainer().clientWidth;
    const zoom = (area.zoom || 15) + (area.id === "parliament" ? Math.max(0, Math.log2(width / 768)) : 0);
    // Leave the Assembly above the phone's watch readings, including enlarged text.
    const campusOffset = area.id === "parliament" && currentBasemap === "fabric" && width <= 768
      ? {offset:[0, -104]} : {};
    map.flyTo({ center: [area.lng, area.lat], zoom, ...campusOffset,
      pitch: is3D ? (area.pitch ?? 45) : 0, bearing: is3D ? (area.bearing ?? 0) : 0, duration: reducedMotion() ? 0 : duration });
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
    const unknown = tr("n/a", "অনুপলব্ধ"); // say it is unavailable; the tap opens the desk with the reason
    const category = {Good:"ভালো", Moderate:"মাঝারি", "Unhealthy for Sensitive Groups":"সংবেদনশীলদের জন্য অস্বাস্থ্যকর", Unhealthy:"অস্বাস্থ্যকর", "Very Unhealthy":"অত্যন্ত অস্বাস্থ্যকর", Hazardous:"বিপজ্জনক"};
    const values = {
      flood: { value: unknown, tier: "unavailable", title: tr("No calibrated flood assessment · BWDB / FFWC gauge feed not connected","ক্যালিব্রেট করা বন্যা মূল্যায়ন নেই · বিউডব্লিউডি / এফএফডাব্লুসি গেজ পাঠন সংযুক্ত নয়") },
      air: { value: unknown, tier: "unavailable", title: tr("Air quality data unavailable","বায়ুমান তথ্য অনুপলব্ধ") },
      wind: { value: unknown, tier: "unavailable", title: tr("Wind data unavailable","বাতাসের তথ্য অনুপলব্ধ") },
      traffic: { value: unknown, tier: "unavailable", title: tr("Economic data unavailable · no dated bulletin","অর্থনৈতিক তথ্য অনুপলব্ধ · কোনো তারিখযুক্ত বুলেটিন নেই") },
    };
    const num = n => new Intl.NumberFormat(document.documentElement.lang === "bn" ? "bn-BD" : "en-GB", { maximumFractionDigits: 1 }).format(n);
    const model = tr("model", "মডেল");
    let windTo = null;
    if (ind) {
      const aq = ind.airQuality;
      if (Number.isFinite(aq?.us_aqi)) {
        const cat = tr(aq.category || "", category[aq.category] || aq.category || "");
        values.air = { value: `AQI ${num(aq.us_aqi)} · ${model} · ${cat}`, tier: ["ok", "warning", "danger"].includes(aq.status) ? aq.status : "neutral", title: `${tr("Modelled, not a station reading", "মডেল অনুমান, স্টেশনের পরিমাপ নয়")} · ${cat} · ${aq.source || ""} · ${aq.observedAt || ""}` };
      }
      const w = ind.weather;
      if (Number.isFinite(w?.wind_speed_10m)) {
        // No validated wind hazard threshold exists, so wind is never coloured as "ok".
        const from = Number.isFinite(w.wind_direction_10m) ? w.wind_direction_10m : null;
        if (from !== null) windTo = (from + 180) % 360;
        values.wind = { value: `${num(w.wind_speed_10m)} ${tr("km/h", "কিমি/ঘ")} · ${model}`, tier: "neutral", title: `${tr("Modelled wind at 10 m", "১০ মিটারে মডেল বাতাস")}${from !== null ? ` · ${tr("from", "দিক থেকে")} ${num(from)}°` : ""} · ${w.observedAt || ""}` };
      }
      if (ind.floodRisk && ind.floodRisk.status !== "unavailable") {
        values.flood = { value: ind.floodRisk.tier || "—", tier: ind.floodRisk.status, title: `${ind.floodRisk.source || ""} · ${ind.floodRisk.reasonCode || ""}` };
      }
      if (ind.economy && ind.economy.status !== "unavailable") {
        values.traffic = { value: ind.economy.status, tier: ind.economy.status, title: `${ind.economy.source || ""} · ${ind.economy.reasonCode || ""}` };
      }
    }
    for (const [key, v] of Object.entries(values)) {
      const el = $(`#atlas-watch-${key}-value`);
      if (el) el.textContent = v.value;
      const item = $(`#atlas-watch-${key}`);
      if (item) {
        item.dataset.tier = v.tier;
        item.title = v.title;
        item.setAttribute("data-language-fixed", "");
        const labels = {flood:tr("Flood","বন্যা"),air:tr("Air","বায়ু"),wind:tr("Wind","বাতাস"),traffic:tr("Economy","অর্থনীতি")};
        const label = labels[key];
        const labelNode = item.querySelector(".watch-label");
        if (labelNode) labelNode.textContent = label;
        item.setAttribute("aria-label", `${label}: ${v.value} · ${v.title}`);
      }
    }
    // Arrow points where the wind blows to; hidden when direction is unknown.
    const arrow = $("#atlas-watch-wind-symbol");
    if (arrow) {
      arrow.style.visibility = windTo === null ? "hidden" : "visible";
      arrow.style.transform = windTo === null ? "" : `rotate(${windTo}deg)`;
    }
  }

  function scheduleSolar() {
    clearTimeout(solarTimer); solarTimer = null;
    if (document.hidden || !styleReady) return;
    applySolarLight();
    solarTimer = setTimeout(scheduleSolar, 60000);
  }

  function pollCityWatch() {
    if (document.hidden) return Promise.resolve();
    if (watchPending) return watchPending;
    const revision = watchRevision;
    const controller = new AbortController(); watchController = controller;
    const task = (async () => {
      try {
        const res = await fetch("/api/atlas/watch", {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])});
        if (!res.ok) throw new Error("Watch unavailable");
        const body = await res.json();
        if (revision !== watchRevision || document.hidden) return;
        watchData = body; watchCheckedAt = Date.now();
      } catch {
        if (revision !== watchRevision || document.hidden) return;
        watchData = null;
      }
      renderCityWatch();
    })();
    watchPending = task;
    task.finally(() => { if (watchPending === task) { watchPending = null; watchController = null; } });
    return task;
  }

  function scheduleWatch() {
    clearTimeout(watchTimer); watchTimer = null;
    const scheduleToken = ++watchScheduleToken;
    if (document.hidden) return;
    const age = Date.now() - watchCheckedAt;
    if (age >= 5 * 60000) {
      watchData = null; renderCityWatch();
      const revision = watchRevision;
      pollCityWatch().finally(() => {
        if (!document.hidden && revision === watchRevision && scheduleToken === watchScheduleToken) watchTimer = setTimeout(scheduleWatch, 5 * 60000);
      });
    } else watchTimer = setTimeout(scheduleWatch, Math.max(1000,5 * 60000 - age));
  }

  function pauseBackground() {
    clearTimeout(watchTimer); watchTimer = null;
    clearTimeout(solarTimer); solarTimer = null;
    watchRevision++; watchScheduleToken++; watchController?.abort(); watchController = null; watchPending = null;
    searchRevision++; searchController?.abort(); searchController = null;
  }

  function bootAtlas() {
    // A linked lens is chosen before the map exists, so the first render is
    // already the view the reader asked for.
    currentLens = lensFromUrl() || "city";
    const requestedBasemap = new URLSearchParams(window.location.search).get("basemap");
    if (["esri", "osm", "fabric"].includes(requestedBasemap)) currentBasemap = requestedBasemap;
    const basemap = $("#atlas-basemap");
    if (basemap) basemap.value = currentBasemap;


    window.addEventListener('atlas:sampling', event => {
      const bbox = event.detail?.bbox;
      if (!map || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) return;
      const [west,south,east,north] = bbox;
      const data = {type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]}};
      if (map.getSource('sample-footprint')) map.getSource('sample-footprint').setData(data);
      else {
        map.addSource('sample-footprint',{type:'geojson',data});
        map.addLayer({id:'sample-footprint',type:'line',source:'sample-footprint',paint:{'line-color':'#d9583b','line-width':3,'line-dasharray':[2,1]}});
      }
      map.fitBounds([[west,south],[east,north]], {padding:60,maxZoom:16,duration:250});
    });

    wireUIEvents();
    scheduleWatch();
    window.AtlasInstruments?.start();
    window.AtlasWalk?.start();
    window.AtlasCollage?.start();
    initMap();
  }

  // Safe boot: runs immediately if DOM is ready, or on DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAtlas);
  } else {
    bootAtlas();
  }
})();
