import { getOutlook } from "./outlook.js";
import { BUILD_ID, ATLAS_VERSION } from "./build-id.js";
import { checkRateLimit } from "./rate-limit.js";
import type { RateLimitEnv } from "./rate-limit.js";
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

    // ── /api/atlas/environment ───────────────────────────────────────────────
    if (url.pathname === "/api/atlas/environment") {
      const today = new Date().toISOString().split("T")[0];
      return jsonResponse({
        status: "ok",
        city: "Dhaka",
        provenance: "reference",
        date: today,
        layers: [
          {
            id: "viirs-truecolor",
            name: "VIIRS True Color Surface Reflectance",
            provider: "NASA GIBS / NOAA-20",
            template: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
            format: "jpg",
          },
          {
            id: "viirs-aerosol",
            name: "VIIRS Aerosol Optical Depth (Deep Blue)",
            provider: "NASA GIBS / Suomi NPP",
            template: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Aerosol_Optical_Depth_Deep_Blue_Daily/default/{Time}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
            format: "png",
          },
          {
            id: "black-marble-night",
            name: "Black Marble Nighttime Lights (VIIRS DNB)",
            provider: "NASA GIBS / VNP46A2",
            template: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_ENCC/default/{Time}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
            format: "png",
          },
          {
            id: "modis-flood-water",
            name: "MODIS NRT Global Flood Water (250m)",
            provider: "NASA GIBS / Terra & Aqua",
            template: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Combined_Flood_Water_250m/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
            format: "png",
          },
          {
            id: "rainviewer-radar",
            name: "Doppler Weather Radar Composite",
            provider: "RainViewer",
            endpoint: "https://api.rainviewer.com/public/weather-maps.json",
            format: "tiles",
          },
        ],
      });
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
    if (url.pathname === "/api/dhaka/rivers") {
      return jsonResponse({
        status: "ok",
        city: "Dhaka",
        agency: "Bangladesh Water Development Board (BWDB) / Flood Forecasting & Warning Centre (FFWC)",
        agency_url: "https://ffwc.gov.bd",
        provenance: "reference",
        reasonCode: "river-observations-not-connected",
        observedAt: null,
        readingsStatus: "unavailable",
        stations: RIVER_STATIONS,
        timestamp: new Date().toISOString(),
        note: "Danger levels are officially surveyed benchmarks in metres Above Mean Sea Level (m MSL).",
      });
    }

    // ── /api/dhaka/economy ───────────────────────────────────────────────────
    if (url.pathname === "/api/dhaka/economy") {
      return jsonResponse({
        status: "ok",
        city: "Dhaka",
        country: "Bangladesh",
        provenance: "unavailable",
        statusReason: "Indicator registry only; no dated bulletin has been ingested.",
        reasonCode: "dated-bulletin-not-connected",
        observedAt: null,
        indicators: MACRO_INDICATORS,
        corridors: [
          { name: "Savar & Ashulia RMG Belt", workforce: 450000, annual_export: "$7.5B", sector: "Apparel" },
          { name: "Dhaka EPZ (DEPZ)", workforce: 95000, annual_export: "$2.2B", sector: "RMG & Electronics" },
          { name: "Adamjee EPZ Narayanganj", workforce: 62000, annual_export: "$1.1B", sector: "Diversified Export" },
          { name: "Hemayetpur Leather City", workforce: 35000, annual_export: "$850M", sector: "Leather & CETP" },
          { name: "Tejgaon Commercial Estate", workforce: 80000, sector: "Light Engineering & Media" },
          { name: "Motijheel Financial Core", sector: "Central Banking & Capital Markets" },
          { name: "Kawran Bazar Wholesale Hub", daily_turnover: "400M BDT", sector: "Agri-commodities" },
          { name: "Islampur Textile Market", daily_turnover: "600M BDT", sector: "Wholesale Fabric" },
        ].map(({ name, sector }) => ({ name, sector, provenance: "reference" })),
        timestamp: new Date().toISOString(),
      });
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
