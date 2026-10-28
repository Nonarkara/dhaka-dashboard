import { getInstruments } from "./instruments.js";
import { getOutlook } from "./outlook.js";
import { BUILD_ID, ATLAS_VERSION } from "./build-id.js";
import { checkRateLimit } from "./rate-limit.js";
import type { RateLimitEnv } from "./rate-limit.js";
import { inspectGibsTile, workerInflate } from "./gibs-png.js";
import { GIBS_CATALOGUE_CAPTURED, GIBS_CATALOGUE_LATEST } from "./gibs-catalogue.js";
import { MACRO_INDICATORS, RIVER_STATIONS, AIR_STATIONS } from "./dhaka-data.js";

export interface Env extends RateLimitEnv {
  ASSETS: Fetcher;
}

const CITY_BBOX = {
  minLat: 23.60,
  maxLat: 23.95,
  minLon: 90.25,
  maxLon: 90.55,
} as const;

const CITY_CENTER = {
  lat: 23.8103,
  lng: 90.4125,
} as const;

const RATE_LIMIT_CONFIG = {
  limit: 600,
  windowSeconds: 60,
  scope: "dhaka-api",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("access-control-allow-headers", "Range, Content-Type, Accept");
  headers.set("strict-transport-security", "max-age=31536000");
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Memory caches with timestamp for upstream providers to prevent rate limit burns
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const memoryCache = new Map<string, CacheEntry<unknown>>();

async function fetchWithCache<T>(
  cacheKey: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; fromCache: boolean; error?: string }> {
  const cached = memoryCache.get(cacheKey) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (cached && now - cached.timestamp < ttlMs) {
    return { data: cached.data, fromCache: true };
  }
  try {
    const data = await fetcher();
    memoryCache.set(cacheKey, { data, timestamp: now });
    return { data, fromCache: false };
  } catch (err: unknown) {
    // Expired model output must not masquerade as a current reading.
    return { data: fallback, fromCache: false, error: String(err) };
  }
}

// ── NASA GIBS layer registry ───────────────────────────────────────────────
// Layer id, tile matrix set and file format are validated against the GIBS
// WMTS capabilities catalogue by scripts/test-environment-contract.mjs.
// Never add a layer here without confirming it exists in that catalogue, and
// never claim an observation date that was not actually fetched.
interface GibsLayerSpec {
  id: string;
  name: string;
  provider: string;
  tileLevel: number;
  format: "png" | "jpg";
  probe: { z: number; y: number; x: number };
}

interface GibsLayerReport {
  id: string;
  name: string;
  provider: string;
  kind: "gibs-raster" | "json-endpoint";
  template: string | null;
  endpoint: string | null;
  tile_level: number | null;
  format: string | null;
  status: "ok" | "unavailable";
  latest_date: string | null;
  reasonCode: string | null;
}

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

const GIBS_LAYERS: GibsLayerSpec[] = [
  {
    id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    name: "VIIRS True Color Surface Reflectance",
    provider: "NASA GIBS / NOAA-20",
    tileLevel: 9,
    format: "jpg",
    probe: { z: 9, y: 221, x: 384 },
  },
  {
    id: "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth",
    name: "MAIAC Aerosol Optical Depth",
    provider: "NASA GIBS / MODIS Terra + Aqua",
    tileLevel: 7,
    format: "png",
    probe: { z: 7, y: 55, x: 96 },
  },
  {
    id: "VIIRS_SNPP_DayNightBand",
    name: "VIIRS Day/Night Band Night-Time Radiance",
    provider: "NASA GIBS / Suomi NPP",
    tileLevel: 7,
    format: "png",
    probe: { z: 7, y: 55, x: 96 },
  },
  {
    id: "VIIRS_Combined_Flood_1-Day",
    name: "Combined Flood Detection (1-day window)",
    provider: "NASA GIBS / VIIRS NOAA-20 + NOAA-21",
    tileLevel: 9,
    format: "png",
    probe: { z: 9, y: 221, x: 384 },
  },
];

function gibsTemplate(spec: GibsLayerSpec, date: string | null): string {
  const t = date ? `${date}/` : "";
  return `${GIBS_BASE}/${spec.id}/default/${t}GoogleMapsCompatible_Level${spec.tileLevel}/{z}/{y}/{x}.${spec.format}`;
}

async function gibsTileAvailable(spec: GibsLayerSpec, date: string | null): Promise<boolean> {
  const p = spec.probe;
  const t = date ? `${date}/` : "";
  const url = `${GIBS_BASE}/${spec.id}/default/${t}GoogleMapsCompatible_Level${spec.tileLevel}/${p.z}/${p.y}/${p.x}.${spec.format}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    if (spec.format === "jpg") {
      // JPEG carries no alpha and the Worker has no JPEG decoder. GIBS serves
      // JPEG layers as 404 rather than as placeholder tiles, so a delivered
      // JPEG means the observation exists.
      return Number(res.headers.get("content-length") || 0) > 0;
    }
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return false;
    const verdict = await inspectGibsTile(buf, workerInflate);
    return verdict.hasData;
  } catch {
    return false;
  }
}

// GIBS publishes each product on its own latency, so the newest observation is
// discovered by probing candidate dates rather than assumed. A layer with no
// observation reports unavailable with a reason code — never a blank raster
// presented as data.
async function resolveGibsLayer(spec: GibsLayerSpec): Promise<GibsLayerReport> {
  // Candidates newest-first: the last four days, plus the date the GIBS
  // capabilities catalogue recorded for this layer, in case publication is
  // slower than the four-day window. Every candidate is decoded before it is
  // accepted — GIBS serves a blank placeholder for a date whose observation
  // has not been ingested yet, and that placeholder is HTTP 200 and
  // non-empty, so a status or byte check would accept it as data.
  const candidates = Array.from({ length: 4 }, (_, back) =>
    new Date(Date.now() - back * 86400000).toISOString().split("T")[0],
  );
  const catalogueDate = GIBS_CATALOGUE_LATEST[spec.id];
  if (catalogueDate && !candidates.includes(catalogueDate)) candidates.push(catalogueDate);
  const results = await Promise.all(
    candidates.map(async (date) => ({ date, ok: await gibsTileAvailable(spec, date) })),
  );
  for (const r of results) {
    if (r.ok) {
      return {
        id: spec.id,
        name: spec.name,
        provider: spec.provider,
        kind: "gibs-raster",
        template: gibsTemplate(spec, r.date),
        endpoint: null,
        tile_level: spec.tileLevel,
        format: spec.format,
        status: "ok",
        latest_date: r.date,
        reasonCode: null,
      };
    }
  }
  const undated = await gibsTileAvailable(spec, null);
  return {
    id: spec.id,
    name: spec.name,
    provider: spec.provider,
    kind: "gibs-raster",
    template: gibsTemplate(spec, null),
    endpoint: null,
    tile_level: spec.tileLevel,
    format: spec.format,
    status: undated ? "ok" : "unavailable",
    latest_date: null,
    reasonCode: undated ? "gibs-date-unresolved" : "gibs-no-observation",
  };
}

// RainViewer serves a live composite; the newest observation is the last
// published frame, so the date is read from the payload rather than assumed.
async function resolveRadarLayer(): Promise<GibsLayerReport> {
  const endpoint = "https://api.rainviewer.com/public/weather-maps.json";
  const base: GibsLayerReport = {
    id: "rainviewer-radar",
    name: "Doppler Weather Radar Composite",
    provider: "RainViewer",
    kind: "json-endpoint",
    template: null,
    endpoint,
    tile_level: null,
    format: null,
    status: "unavailable",
    latest_date: null,
    reasonCode: "upstream-unreachable",
  };
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ...base, reasonCode: `upstream-status-${res.status}` };
    const payload = (await res.json()) as { radar?: { past?: { time?: number }[] } };
    const frames = payload.radar?.past ?? [];
    const newest = frames.length ? frames[frames.length - 1].time : undefined;
    if (!newest) return { ...base, reasonCode: "radar-no-frame" };
    return {
      ...base,
      status: "ok",
      latest_date: new Date(newest * 1000).toISOString().split("T")[0],
      reasonCode: null,
    };
  } catch {
    return base;
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-allow-headers": "Range, Content-Type, Accept",
        },
      });
    }

    // Rate limit API routes
    if (url.pathname.startsWith("/api/")) {
      const verdict = await checkRateLimit(request, env, RATE_LIMIT_CONFIG);
      if (!verdict.allowed) {
        return jsonResponse(
          {
            status: "unavailable",
            reasonCode: "rate-limited",
            message: `Rate limit of ${RATE_LIMIT_CONFIG.limit} requests per minute exceeded.`,
            retryAfter: verdict.retryAfter,
            mode: verdict.mode,
            timestamp: new Date().toISOString(),
          },
          {
            status: 429,
            headers: { "retry-after": String(verdict.retryAfter) },
          },
        );
      }
    }

    // ── /api/health ──────────────────────────────────────────────────────────
    if (url.pathname === "/api/health") {
      return jsonResponse({
        status: "ok",
        city: "Dhaka",
        country: "Bangladesh",
        domain: "dhaka.nonarkara.org",
        version: ATLAS_VERSION,
        buildId: BUILD_ID,
        timestamp: new Date().toISOString(),
        provenance: "measured",
      });
    }

    // ── /api/atlas/areas ─────────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/areas") {
      const areasUrl = new URL("/dhaka-areas.json", request.url);
      const res = await env.ASSETS.fetch(areasUrl.toString());
      if (res.ok) {
        const areas = await res.json();
        return jsonResponse({
          status: "ok",
          city: "Dhaka",
          areas,
          count: Array.isArray(areas) ? areas.length : 0,
          provenance: "reference",
        });
      }
      return jsonResponse(
        { status: "unavailable", reasonCode: "assets-missing", provenance: "unavailable" },
        { status: 503 },
      );
    }

    // ── /api/atlas/districts ─────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/districts") {
      return jsonResponse({
        status: "ok",
        city: "Dhaka",
        corporations: [
          {
            id: "dncc",
            name: "Dhaka North City Corporation (DNCC)",
            name_bn: "ঢাকা উত্তর সিটি কর্পোরেশন",
            wards: 54,
            zones: 10,
            area_sq_km: 196.22,
          },
          {
            id: "dscc",
            name: "Dhaka South City Corporation (DSCC)",
            name_bn: "ঢাকা দক্ষিণ সিটি কর্পোরেশন",
            wards: 75,
            zones: 10,
            area_sq_km: 109.25,
          },
        ],
        divisions: [
          { id: "old-dhaka", name: "Old Dhaka", thanas: ["Kotwali", "Lalbagh", "Sutrapur", "Bangshal", "Chawkbazar"] },
          { id: "central-dhaka", name: "Central Commercial", thanas: ["Motijheel", "Paltan", "Ramna", "Shahbagh", "Tejgaon"] },
          { id: "north-dhaka", name: "Northern Metropolis", thanas: ["Gulshan", "Banani", "Uttara", "Mirpur", "Cantonment"] },
          { id: "industrial-belt", name: "Industrial Periphery", thanas: ["Savar", "Ashulia", "Gazipur Sadar", "Keraniganj", "Narayanganj Sadar"] },
        ],
        provenance: "reference",
      });
    }

    // ── /api/atlas/at-this-point ─────────────────────────────────────────────
    if (url.pathname === "/api/atlas/at-this-point") {
      const latParam = Number.parseFloat(url.searchParams.get("lat") || "");
      const lngParam = Number.parseFloat(url.searchParams.get("lng") || "");
      if (!Number.isFinite(latParam) || !Number.isFinite(lngParam)) {
        return jsonResponse(
          { status: "unavailable", reasonCode: "invalid-coordinates", message: "lat and lng must be valid numbers" },
          { status: 400 },
        );
      }

      let nearestAir = AIR_STATIONS[0];
      let minAirDist = haversineDistanceKm(latParam, lngParam, nearestAir.lat, nearestAir.lng);
      for (const st of AIR_STATIONS) {
        const d = haversineDistanceKm(latParam, lngParam, st.lat, st.lng);
        if (d < minAirDist) {
          minAirDist = d;
          nearestAir = st;
        }
      }

      let nearestRiver = RIVER_STATIONS[0];
      let minRiverDist = haversineDistanceKm(latParam, lngParam, nearestRiver.lat, nearestRiver.lng);
      for (const st of RIVER_STATIONS) {
        const d = haversineDistanceKm(latParam, lngParam, st.lat, st.lng);
        if (d < minRiverDist) {
          minRiverDist = d;
          nearestRiver = st;
        }
      }

      return jsonResponse({
        status: "ok",
        query: { lat: latParam, lng: lngParam },
        insideBbox:
          latParam >= CITY_BBOX.minLat &&
          latParam <= CITY_BBOX.maxLat &&
          lngParam >= CITY_BBOX.minLon &&
          lngParam <= CITY_BBOX.maxLon,
        nearestAirStation: {
          ...nearestAir,
          distance_km: Number(minAirDist.toFixed(2)),
        },
        nearestRiverStation: {
          ...nearestRiver,
          distance_km: Number(minRiverDist.toFixed(2)),
        },
        provenance: "reference",
      });
    }

    // ── /api/atlas/weather ───────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/weather") {
      const cacheKey = "weather:dhaka";
      const { data, error } = await fetchWithCache(
        cacheKey,
        15 * 60 * 1000, // 15 mins
        async () => {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${CITY_CENTER.lat}&longitude=${CITY_CENTER.lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,precipitation_probability,rain&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FDhaka&forecast_days=3`,
            { signal: AbortSignal.timeout(10000), headers: { "user-agent": "dhaka-3d-atlas/1.0 (dhaka.nonarkara.org)" } },
          );
          if (!res.ok) throw new Error(`Open-Meteo returned status ${res.status}`);
          const payload = await res.json() as { current?: Record<string, unknown> };
          if (!payload.current || typeof payload.current.time !== "string") throw new Error("invalid-model-payload");
          return payload;
        },
        null,
      );

      if (!data) {
        return jsonResponse(
          {
            status: "unavailable",
            reasonCode: "upstream-unreachable",
            message: "Open-Meteo weather endpoint could not be reached.",
            error,
            timestamp: new Date().toISOString(),
            provenance: "unavailable",
          },
          { status: 503 },
        );
      }

      return jsonResponse({
        status: "ok",
        city: "Dhaka",
        source: "Open-Meteo Weather API",
        source_url: "https://open-meteo.com/en/docs",
        provenance: "modeled",
        data,
      });
    }

    // ── /api/atlas/air-quality ───────────────────────────────────────────────
    if (url.pathname === "/api/atlas/air-quality") {
      const cacheKey = "air-quality:dhaka";
      const { data, error } = await fetchWithCache(
        cacheKey,
        20 * 60 * 1000, // 20 mins
        async () => {
          const res = await fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${CITY_CENTER.lat}&longitude=${CITY_CENTER.lng}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi&hourly=pm2_5,pm10,us_aqi&timezone=Asia%2FDhaka&forecast_hours=72`,
            { signal: AbortSignal.timeout(10000), headers: { "user-agent": "dhaka-3d-atlas/1.0 (dhaka.nonarkara.org)" } },
          );
          if (!res.ok) throw new Error(`Open-Meteo Air API returned ${res.status}`);
          const payload = await res.json() as { current?: Record<string, unknown> };
          if (!payload.current || typeof payload.current.time !== "string") throw new Error("invalid-model-payload");
          return payload;
        },
        null,
      );

      if (!data) {
        return jsonResponse(
          {
            status: "unavailable",
            reasonCode: "upstream-unreachable",
            message: "Air quality model service unreachable.",
            error,
            timestamp: new Date().toISOString(),
            provenance: "unavailable",
          },
          { status: 503 },
        );
      }

      return jsonResponse({
        status: "ok",
        city: "Dhaka",
        source: "Copernicus Atmosphere Monitoring Service (CAMS) / Open-Meteo",
        source_url: "https://air-quality-api.open-meteo.com",
        provenance: "modeled",
        stations: AIR_STATIONS,
        data,
      });
    }

    // ── /api/atlas/rainfall ──────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/rainfall") {
      const cacheKey = "rainfall:catchments";
      const { data, error } = await fetchWithCache(
        cacheKey,
        20 * 60 * 1000,
        async () => {
          const points = [
            { id: "buriganga", name: "Buriganga Catchment", lat: 23.7001, lng: 90.4150 },
            { id: "turag", name: "Turag Basin", lat: 23.7980, lng: 90.3420 },
            { id: "balu", name: "Balu Corridor", lat: 23.7140, lng: 90.5050 },
            { id: "tongi", name: "Tongi North", lat: 23.8890, lng: 90.4010 },
            { id: "savar", name: "Savar West", lat: 23.8583, lng: 90.2667 },
          ];
          const results = await Promise.all(
            points.map(async (p) => {
              try {
                const r = await fetch(
                  `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=precipitation,rain&hourly=precipitation,rain&forecast_hours=24&timezone=Asia%2FDhaka`,
                  { signal: AbortSignal.timeout(10000), headers: { "user-agent": "dhaka-3d-atlas/1.0" } },
                );
                if (!r.ok) throw new Error(`upstream-http-${r.status}`);
                const j = (await r.json()) as { current?: { precipitation?: number }; hourly?: { precipitation?: number[] } };
                if (!Number.isFinite(j.current?.precipitation) || !j.hourly?.precipitation?.length || !j.hourly.precipitation.every(Number.isFinite)) throw new Error("invalid-rainfall-payload");
                return {
                  ...p,
                  status: "ok",
                  current_mm: j.current!.precipitation,
                  rain_24h_sum_mm: j.hourly!.precipitation!.reduce((a: number, b: number) => a + b, 0),
                };
              } catch {
                return { ...p, status: "unavailable", reasonCode: "upstream-or-invalid-rainfall", timestamp: new Date().toISOString(), current_mm: null, rain_24h_sum_mm: null };
              }
            }),
          );
          return results;
        },
        [],
      );

      return jsonResponse({
        status: data.length && data.every(p => p.status === "ok") ? "ok" : "unavailable",
        timestamp: new Date().toISOString(),
        reasonCode: data.length && data.every(p => p.status === "ok") ? null : "rainfall-incomplete",
        city: "Dhaka",
        source: "Open-Meteo High-Resolution Precipitation Models",
        provenance: "modeled",
        catchments: data,
        error: error || null,
      });
    }

    // ── /api/atlas/fires ─────────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/fires") {
      return jsonResponse({
        status: "unavailable", provenance: "unavailable",
        reasonCode: "firms-feed-not-configured", timestamp: new Date().toISOString(),
        source: "NASA FIRMS", source_url: "https://firms.modaps.eosdis.nasa.gov",
        brick_kiln_hotspots_detected: null,
        note: "No authenticated FIRMS retrieval is configured. Thermal anomalies alone cannot identify brick kilns.",
      }, { status: 503 });
    }

    // ── /api/atlas/wind ──────────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/wind") {
      const cacheKey = "wind:dhaka-grid";
      const { data } = await fetchWithCache(
        cacheKey,
        30 * 60 * 1000,
        async () => {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${CITY_CENTER.lat}&longitude=${CITY_CENTER.lng}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=wind_speed_10m,wind_direction_10m&timezone=Asia%2FDhaka&forecast_hours=12`,
            { signal: AbortSignal.timeout(10000), headers: { "user-agent": "dhaka-3d-atlas/1.0" } },
          );
          if (!res.ok) throw new Error("Wind fetch failed");
          const payload = await res.json() as { current?: Record<string, unknown> };
          if (!payload.current || typeof payload.current.time !== "string") throw new Error("invalid-model-payload");
          return payload;
        },
        null,
      );

      return jsonResponse({
        status: data ? "ok" : "unavailable",
        provenance: data ? "modeled" : "unavailable",
        reasonCode: data ? null : "upstream-unreachable",
        timestamp: new Date().toISOString(),
        source: "Open-Meteo · surface wind at 10 m (no 925 hPa field)",
        data,
      }, { status: data ? 200 : 503 });
    }

    // National statistics: values retain their reporting periods and source age.
    if (url.pathname === "/api/atlas/instruments") {
      const data=await getInstruments();
      return jsonResponse(data,{status:data.status==='unavailable'?503:200,headers:{'cache-control':'no-store'}});
    }

    // ── /api/atlas/environment ───────────────────────────────────────────────
    if (url.pathname === "/api/atlas/environment") {
      const { data, error } = await fetchWithCache<GibsLayerReport[]>(
        "gibs:environment",
        30 * 60 * 1000,
        async () => {
          const gibs = await Promise.all(GIBS_LAYERS.map((spec) => resolveGibsLayer(spec)));
          const radar = await resolveRadarLayer();
          return [...gibs, radar];
        },
        [],
      );

      const anyOk = data.some((l) => l.status === "ok");
      return jsonResponse(
        {
          status: anyOk ? "ok" : "unavailable",
          reasonCode: anyOk ? null : error ? "upstream-unreachable" : "gibs-no-observation",
          city: "Dhaka",
          provenance: "measured",
          date: new Date().toISOString().split("T")[0],
          source: "NASA GIBS WMTS · epsg3857/best · observation date resolved per layer by decoding the tile",
          catalogue_captured: GIBS_CATALOGUE_CAPTURED,
          layers: data,
        },
        { status: anyOk ? 200 : 503 },
      );
    }

    // ── /api/atlas/earthquake ────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/earthquake") {
      const cacheKey = "earthquake:bengal";
      interface UsgsResponse { features?: unknown[] }
      const { data, error } = await fetchWithCache<UsgsResponse | null>(
        cacheKey,
        30 * 60 * 1000,
        async () => {
          const res = await fetch(
            "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=3.0&minlatitude=20.5&maxlatitude=27.0&minlongitude=88.0&maxlongitude=93.0&limit=5",
            { signal: AbortSignal.timeout(10000), headers: { "user-agent": "dhaka-3d-atlas/1.0" } },
          );
          if (!res.ok) throw new Error("USGS query failed");
          return (await res.json()) as UsgsResponse;
        },
        null,
      );

      return jsonResponse({
        status: data ? "ok" : "unavailable",
        timestamp: new Date().toISOString(),
        reasonCode: data ? null : "upstream-unreachable",
        region: "Bengal Basin & Dauki Fault Seismic Zone",
        provenance: "measured",
        source: "USGS Earthquake Hazards Program",
        source_url: "https://earthquake.usgs.gov",
        events: data?.features ?? null,
        error: error || null,
      });
    }

    // ── /api/atlas/search ────────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/search") {
      const q = url.searchParams.get("q")?.trim();
      if (!q) {
        return jsonResponse(
          { status: "unavailable", reasonCode: "empty-query", message: "Parameter q is required" },
          { status: 400 },
        );
      }
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          q + ", Dhaka, Bangladesh",
        )}&format=json&viewbox=${CITY_BBOX.minLon},${CITY_BBOX.maxLat},${CITY_BBOX.maxLon},${CITY_BBOX.minLat}&bounded=1&limit=5`;
        const res = await fetch(nominatimUrl, {
          headers: { "user-agent": "DhakaAtlasBot/1.0 (dhaka.nonarkara.org; research)" },
        });
        if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
        const places = await res.json();
        return jsonResponse({
          status: "ok",
          query: q,
          provenance: "reference",
          results: places,
        });
      } catch (err: unknown) {
        return jsonResponse(
          { status: "unavailable", reasonCode: "geocoder-failure", error: String(err) },
          { status: 503 },
        );
      }
    }

    // ── /api/atlas/export ────────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/export") {
      const landmarksUrl = new URL("/dhaka-landmarks.geojson", request.url);
      const res = await env.ASSETS.fetch(landmarksUrl.toString());
      if (res.ok) {
        const geojson = await res.json();
        return jsonResponse(geojson, {
          headers: {
            "content-disposition": 'attachment; filename="dhaka-atlas-export.geojson"',
          },
        });
      }
      return jsonResponse({ status: "unavailable", reasonCode: "export-missing" }, { status: 503 });
    }

    // ── /api/atlas/watch ─────────────────────────────────────────────────────
    if (url.pathname === "/api/atlas/watch") {
      const read = async (path: string) => {
        const response = await worker.fetch(new Request(new URL(path, request.url), { headers: request.headers }), env);
        return await response.json() as { status: string; provenance: string; reasonCode?: string; source?: string; data?: { current?: { time?: string; us_aqi?: number; wind_speed_10m?: number; wind_direction_10m?: number } } };
      };
      const [air, weather] = await Promise.all([read("/api/atlas/air-quality"), read("/api/atlas/weather")]);
      const aqi = air.data?.current?.us_aqi;
      const wind = weather.data?.current;
      const missing = (source: string, reasonCode: string) => ({
        status: "unavailable", provenance: "unavailable", reasonCode, source,
        timestamp: new Date().toISOString(), observedAt: null,
      });
      return jsonResponse({
        status: "partial", city: "Dhaka", timestamp: new Date().toISOString(),
        indicators: {
          airQuality: typeof aqi === "number" ? {
            status: aqi > 150 ? "danger" : aqi > 100 ? "warning" : "ok",
            provenance: "modeled", us_aqi: aqi, observedAt: air.data?.current?.time,
            category: aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy for Sensitive Groups" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very Unhealthy" : "Hazardous",
            source: air.source,
          } : missing("CAMS / Open-Meteo", air.reasonCode || "invalid-current-aqi"),
          weather: typeof wind?.wind_speed_10m === "number" ? {
            status: "ok", provenance: "modeled", wind_speed_10m: wind.wind_speed_10m,
            wind_direction_10m: wind.wind_direction_10m, observedAt: wind.time, source: weather.source,
          } : missing("Open-Meteo", weather.reasonCode || "invalid-current-wind"),
          floodRisk: missing("BWDB / FFWC", "river-observations-not-connected"),
          economy: missing("Bangladesh Bank / DSE", "dated-bulletin-not-connected"),
        },
      });
    }

    if (url.pathname === "/api/atlas/outlook") {
      const kind = url.searchParams.get("kind");
      if (kind !== "air" && kind !== "flood") return jsonResponse({status:"unavailable",reasonCode:"invalid-outlook-kind",timestamp:new Date().toISOString()}, {status:400});
      const data = await getOutlook(kind) as {status:string};
      return jsonResponse(data, {status:data.status === "ok" ? 200 : 503,headers:{"cache-control":"public, max-age=60"}});
    }

    // ── /api/dhaka/rivers ────────────────────────────────────────────────────
    // Flood risk tiers are computed from Open-Meteo 24-hour rainfall
    // accumulation (catchment level) combined with BWDB danger levels. Live
    // river-gauge readings are not connected; this is a modeled risk proxy,
    // not an official flood warning.
    if (url.pathname === "/api/dhaka/rivers") {
      const cacheKey = "rivers:flood-risk";
      const { data, error } = await fetchWithCache(
        cacheKey,
        20 * 60 * 1000,
        async () => {
          // Fetch 24h rainfall for the 5 catchments
          const points = [
            { id: "buriganga", name: "Buriganga Catchment", lat: 23.7001, lng: 90.4150 },
            { id: "turag", name: "Turag Basin", lat: 23.7980, lng: 90.3420 },
            { id: "balu", name: "Balu Corridor", lat: 23.7140, lng: 90.5050 },
            { id: "tongi", name: "Tongi North", lat: 23.8890, lng: 90.4010 },
            { id: "savar", name: "Savar West", lat: 23.8583, lng: 90.2667 },
          ];
          const rainfall = await Promise.all(
            points.map(async (p) => {
              try {
                const r = await fetch(
                  `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=precipitation,rain&hourly=precipitation,rain&forecast_hours=24&timezone=Asia%2FDhaka`,
                  { signal: AbortSignal.timeout(10000), headers: { "user-agent": "dhaka-3d-atlas/1.0" } },
                );
                if (!r.ok) throw new Error(`upstream-http-${r.status}`);
                const j = (await r.json()) as { current?: { precipitation?: number }; hourly?: { precipitation?: number[] } };
                if (!Number.isFinite(j.current?.precipitation) || !j.hourly?.precipitation?.length) throw new Error("invalid-rainfall-payload");
                return { ...p, status: "ok" as const, current_mm: j.current!.precipitation, rain_24h_sum_mm: j.hourly!.precipitation!.reduce((a: number, b: number) => a + b, 0) };
              } catch {
                return { ...p, status: "unavailable" as const, reasonCode: "upstream-or-invalid-rainfall" as const, current_mm: null, rain_24h_sum_mm: null };
              }
            }),
          );
          const rainById = new Map(rainfall.map(p => [p.id, p]));

          // Map catchment ids to river station ids
          const catchmentToStation: Record<string, string> = {
            buriganga: "buriganga-mill-barrage",
            turag: "turag-mirpur",
            balu: "balu-demra",
            tongi: "tongi-khal-tongi",
            savar: "dhaleshwari-rekabi-bazar",
          };

          const stations = RIVER_STATIONS.map(st => {
            const rain = rainById.get(Object.keys(catchmentToStation).find(k => catchmentToStation[k] === st.id) || "");
            const rain24h = rain?.rain_24h_sum_mm ?? null;
            const rainCurrent = rain?.current_mm ?? null;
            const rainStatus = rain?.status ?? "unavailable";

            // Flood risk tier from 24h rainfall accumulation relative to danger level.
            // No live river readings exist, so this is a modeled proxy only.
            let riskTier: "normal" | "watch" | "alert" | "danger" = "normal";
            let riskReason = null;
            if (rainStatus === "unavailable") {
              riskTier = "normal"; // can't assess without rainfall data
              riskReason = "rainfall-data-unavailable";
            } else if (rain24h !== null) {
              const danger = st.danger_level_m;
              // Heuristic: 24h rainfall > 50mm suggests catchment saturation;
              // > 100mm suggests elevated river levels approaching danger.
              const saturation = rain24h / 100; // 0-1+ scale
              if (saturation >= 1.0) {
                riskTier = "danger";
                riskReason = "heavy-24h-rainfall-catchment-saturated";
              } else if (saturation >= 0.6) {
                riskTier = "alert";
                riskReason = "significant-24h-rainfall";
              } else if (saturation >= 0.3) {
                riskTier = "watch";
                riskReason = "moderate-24h-rainfall";
              }
            }

            return {
              ...st,
              current_level_m: null, // no live gauge feed
              trend: "unavailable",
              status: "unavailable",
              readingsStatus: "unavailable",
              reasonCode: "river-observations-not-connected",
              floodRisk: {
                tier: riskTier,
                reasonCode: riskReason,
                rain_24h_mm: rain24h,
                rain_current_mm: rainCurrent,
                rainfallStatus: rainStatus,
                danger_level_m: st.danger_level_m,
                warning_level_m: st.warning_level_m,
                note: "Modeled flood risk proxy from 24h rainfall accumulation. Not an official FFWC flood warning.",
              },
            };
          });

          const anyRain = rainfall.some(r => r.status === "ok");
          const anyDanger = stations.some(s => s.floodRisk.tier === "danger");
          const anyAlert = stations.some(s => s.floodRisk.tier === "alert");

          return {
            status: anyRain ? "ok" : "unavailable",
            provenance: "modeled",
            readingsStatus: "unavailable",
            reasonCode: anyRain ? null : "river-observations-not-connected",
            observedAt: null,
            timestamp: new Date().toISOString(),
            stations,
            summary: {
              normal: stations.filter(s => s.floodRisk.tier === "normal").length,
              watch: stations.filter(s => s.floodRisk.tier === "watch").length,
              alert: stations.filter(s => s.floodRisk.tier === "alert").length,
              danger: stations.filter(s => s.floodRisk.tier === "danger").length,
              unavailable: stations.filter(s => s.floodRisk.tier === "normal" && rainfall.some(r => r.id === Object.keys(catchmentToStation).find(k => catchmentToStation[k] === s.id)) && rainfall.find(r => r.id === Object.keys(catchmentToStation).find(k => catchmentToStation[k] === s.id))?.status === "unavailable").length,
            },
            note: "Danger levels are officially surveyed benchmarks in metres Above Mean Sea Level (m MSL). Flood risk tiers are modeled from 24h rainfall accumulation — not live gauge readings or an official FFWC warning.",
          };
        },
        null,
      );

      if (!data) {
        return jsonResponse({
          status: "unavailable",
          reasonCode: "upstream-unreachable",
          provenance: "unavailable",
          observedAt: null,
          readingsStatus: "unavailable",
          stations: RIVER_STATIONS.map(s => ({ ...s, floodRisk: { tier: "normal" as const, reasonCode: "upstream-unreachable", rain_24h_mm: null, rain_current_mm: null, rainfallStatus: "unavailable", danger_level_m: s.danger_level_m, warning_level_m: s.warning_level_m, note: "Modeled flood risk proxy unavailable — upstream unreachable." } })),
          timestamp: new Date().toISOString(),
          error: error || null,
        }, { status: 503 });
      }

      return jsonResponse(data, { status: data.status === "ok" ? 200 : 503 });
    }

    // ── /api/dhaka/economy ───────────────────────────────────────────────────
    // Combines Bangladesh-specific reference indicators (RMG, DSEX, EPZs) with
    // dated World Bank WDI observations where they overlap (CPI, remittance,
    // exports, FX rate). Corridor workforce/export figures are unsourced
    // constants and remain labeled reference-only.
    if (url.pathname === "/api/dhaka/economy") {
      const instruments = await getInstruments();
      const wbById = new Map(instruments.macro.map((m: any) => [m.id, m]));

      const indicators = MACRO_INDICATORS.map(ind => {
        const wb = (wbById.get({
          "worker-remittance": "remittance",
          "cpi-inflation-general": "inflation",
          "usd-bdt-rate": "fx-period",
        }[ind.id] || "") as any);
        if (wb && wb.status === "ok" && wb.value !== null) {
          return {
            ...ind,
            value: wb.value,
            period: wb.period,
            provenance: "reference" as const,
            source: "World Bank WDI · " + ind.source,
            source_url: wb.sourceUrl || ind.source_url,
            note: ind.note + ` (World Bank ${wb.period})`,
            note_bn: ind.note_bn,
          };
        }
        return ind;
      });

      const corridors = [
        { name: "Savar & Ashulia RMG Belt", workforce: 450000, annual_export: "$7.5B", sector: "Apparel" },
        { name: "Dhaka EPZ (DEPZ)", workforce: 95000, annual_export: "$2.2B", sector: "RMG & Electronics" },
        { name: "Adamjee EPZ Narayanganj", workforce: 62000, annual_export: "$1.1B", sector: "Diversified Export" },
        { name: "Hemayetpur Leather City", workforce: 35000, annual_export: "$850M", sector: "Leather & CETP" },
        { name: "Tejgaon Commercial Estate", workforce: 80000, sector: "Light Engineering & Media" },
        { name: "Motijheel Financial Core", sector: "Central Banking & Capital Markets" },
        { name: "Kawran Bazar Wholesale Hub", daily_turnover: "400M BDT", sector: "Agri-commodities" },
        { name: "Islampur Textile Market", daily_turnover: "600M BDT", sector: "Wholesale Fabric" },
      ].map(c => ({ ...c, provenance: "reference" as const, note: "Workforce and export figures are registry references; no dated bulletin connected." }));

      const anyOk = instruments.status !== "unavailable";
      return jsonResponse({
        status: anyOk ? "ok" : "unavailable",
        city: "Dhaka",
        country: "Bangladesh",
        provenance: instruments.status === "ok" ? "reference" : "unavailable",
        statusReason: anyOk ? "World Bank WDI annual series connected; Bangladesh-specific indicators remain reference registry." : "No dated bulletin connected.",
        reasonCode: anyOk ? null : "dated-bulletin-not-connected",
        observedAt: instruments.timestamp,
        indicators,
        corridors,
        timestamp: new Date().toISOString(),
        fx: instruments.currency,
      }, { status: anyOk ? 200 : 503 });
    }

    // ── /api/dhaka/transit ───────────────────────────────────────────────────
    if (url.pathname === "/api/dhaka/transit") {
      const transitUrl = new URL("/dhaka-mrt.geojson", request.url);
      const res = await env.ASSETS.fetch(transitUrl.toString());
      if (res.ok) {
        const transit = await res.json();
        return jsonResponse({
          status: "ok",
          city: "Dhaka",
          provenance: "reference",
          transit,
        });
      }
      return jsonResponse({ status: "unavailable", reasonCode: "transit-missing" }, { status: 503 });
    }

    // ── Fallback to static assets ───────────────────────────────────────────
    return env.ASSETS.fetch(request);
  },
};

export default worker;
