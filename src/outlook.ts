// Spatial model output, never observations or calibrated inundation extents.
type Row = { latitude: number; longitude: number; hourly?: Record<string, unknown[]>; daily?: Record<string, unknown[]>; hourly_units?: Record<string,string>; daily_units?: Record<string,string> };
const cache = new Map<string, { at: number; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export interface NortheastReachMeta {
  station: string;
  station_bn: string;
}

const NORTHEAST_REACHES: { lat: number; lon: number; meta: NortheastReachMeta }[] = [
  {
    lat: 25.2,
    lon: 91.27,
    meta: {
      station: "Tahirpur / Lorergorh",
      station_bn: "তাহিরপুর / লরেড়গড়",
    },
  },
  {
    lat: 25.07,
    lon: 91.4,
    meta: {
      station: "Sunamganj Sadar",
      station_bn: "সুনামগঞ্জ সদর",
    },
  },
  {
    lat: 24.86,
    lon: 92.18,
    meta: {
      station: "Amalshid / Zakiganj",
      station_bn: "অমলশীদ / জকিগঞ্জ",
    },
  },
  {
    lat: 24.9,
    lon: 91.87,
    meta: {
      station: "Sylhet Sadar",
      station_bn: "সিলেট সদর",
    },
  },
];

function findNearestReach(lat: number, lon: number): NortheastReachMeta | undefined {
  let bestDist = Infinity;
  let bestMeta: NortheastReachMeta | undefined;
  for (const r of NORTHEAST_REACHES) {
    // Context names are only attached within the provider's 5 km search radius.
    // Distance does not validate a channel or an official warning station.
    const rad = Math.PI / 180;
    const a = Math.sin((lat-r.lat)*rad/2)**2
      + Math.cos(lat*rad)*Math.cos(r.lat*rad)*Math.sin((lon-r.lon)*rad/2)**2;
    const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    if (d <= 5 && d < bestDist) {
      bestDist = d;
      bestMeta = r.meta;
    }
  }
  return bestMeta;
}

export function normalizeOutlook(raw: unknown, kind: 'air' | 'flood', now = Date.now()) {
  const rows = (Array.isArray(raw) ? raw : [raw]) as Row[];
  const cells: { id: string; latitude: number; longitude: number; values: Map<string, { value: number | null; p25: number | null; p75: number | null }> }[] = [];
  const times = new Set<string>();
  const seen = new Set<string>();
  const key = kind === 'air' ? 'pm2_5' : 'river_discharge';
  const unit = kind === 'air' ? 'μg/m³' : 'm³/s';
  for (const row of rows) {
    if (!Number.isFinite(row?.latitude) || !Number.isFinite(row?.longitude) || Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180) throw new Error('invalid-model-coordinates');
    const id = `${row.latitude.toFixed(4)},${row.longitude.toFixed(4)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const series = kind === 'air' ? row.hourly : row.daily;
    const units = kind === 'air' ? row.hourly_units : row.daily_units;
    if (units?.[key] !== unit || !Array.isArray(series?.time) || !Array.isArray(series?.[key]) || series.time.length !== series[key].length) throw new Error('invalid-model-series');
    const values = new Map<string, { value: number | null; p25: number | null; p75: number | null }>();
    series.time.forEach((t, i) => {
      if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(t)) throw new Error('invalid-valid-time');
      const time = t.length === 10 ? `${t}T00:00:00Z` : `${t}:00Z`;
      const ms = Date.parse(time);
      const start = kind === 'air' ? now : Math.floor(now / 86400000) * 86400000;
      if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== t.slice(0,10)) throw new Error('invalid-valid-time');
      if (ms < start || ms > now + (kind === 'air' ? 48 * 3600000 : 10 * 86400000)) return;
      if (kind === 'air' && new Date(ms).getUTCHours() % 3 !== 0) return;
      const v = series[key][i], lo = series.river_discharge_p25?.[i], hi = series.river_discharge_p75?.[i];
      const quartilesValid = units.river_discharge_p25 === unit && units.river_discharge_p75 === unit && finite(lo) && finite(hi) && lo <= hi;
      values.set(time, { value: finite(v) ? v : null, p25: quartilesValid ? lo : null, p75: quartilesValid ? hi : null });
      times.add(time);
    });
    cells.push({ id, latitude: row.latitude, longitude: row.longitude, values });
  }

  // A maximum in a daily series is a model statistic, not a flood arrival.
  // Place labels are geographic query context; no station identity is inferred.
  // The provider can choose a different river within its search radius.
  const reachMetaMap = new Map<string, {
    meta?: NortheastReachMeta;
    seriesMaximum: number | null;
    seriesMaximumValidAt: string | null;
    usableDays: number;
    totalDays: number;
    warningStatus: 'unavailable';
    warningReasonCode: string;
  }>();

  if (kind === 'flood') {
    for (const c of cells) {
      const meta = findNearestReach(c.latitude, c.longitude);
      let maximum: number | null = null;
      let maximumAt: string | null = null;
      let usableDays = 0;
      for (const [validAt, sample] of [...c.values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (sample.value === null) continue;
        usableDays++;
        if (maximum === null || sample.value > maximum) {
          maximum = sample.value;
          maximumAt = validAt;
        }
      }
      reachMetaMap.set(c.id, {
        meta,
        seriesMaximum: maximum,
        seriesMaximumValidAt: maximumAt,
        usableDays,
        totalDays: times.size,
        warningStatus: 'unavailable',
        warningReasonCode: 'no-validated-station-threshold-or-arrival-model',
      });
    }
  }

  const frames = [...times].sort().map(validAt => ({
    validAt,
    cells: cells.map(c => {
      const v = c.values.get(validAt) || { value: null, p25: null, p75: null };
      const reachInfo = reachMetaMap.get(c.id);
      return {
        id: c.id,
        latitude: c.latitude,
        longitude: c.longitude,
        value: v.value,
        p25: v.p25,
        p75: v.p75,
        ...(kind === 'flood' && reachInfo ? {
          place: reachInfo.meta?.station || null,
          place_bn: reachInfo.meta?.station_bn || null,
          contextStatus: 'geographic-query-context-only',
          stationMatchStatus: 'unvalidated',
          riverMatchStatus: 'unvalidated',
          seriesMaximum: reachInfo.seriesMaximum,
          seriesMaximumValidAt: reachInfo.seriesMaximumValidAt,
          usableDays: reachInfo.usableDays,
          totalDays: reachInfo.totalDays,
          warningStatus: reachInfo.warningStatus,
          warningReasonCode: reachInfo.warningReasonCode,
          harvestGuidanceStatus: 'unavailable',
          harvestGuidanceReasonCode: 'no-local-crop-stage-or-official-advisory-feed',
          bankfull_q: null,
          alert_q: null,
        } : {})
      };
    })
  }));

  if (frames.length < 2 || !frames.some(f => f.cells.some(c => c.value !== null))) throw new Error('model-horizon-unavailable');

  const reaches = kind === 'flood' ? cells.map(c => {
    const info = reachMetaMap.get(c.id);
    return {
      id: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      place: info?.meta?.station || null,
      place_bn: info?.meta?.station_bn || null,
      contextStatus: 'geographic-query-context-only',
      stationMatchStatus: 'unvalidated',
      riverMatchStatus: 'unvalidated',
      seriesMaximum: info?.seriesMaximum ?? null,
      seriesMaximumValidAt: info?.seriesMaximumValidAt ?? null,
      usableDays: info?.usableDays ?? 0,
      totalDays: times.size,
      warningStatus: 'unavailable',
      warningReasonCode: 'no-validated-station-threshold-or-arrival-model',
      harvestGuidanceStatus: 'unavailable',
      harvestGuidanceReasonCode: 'no-local-crop-stage-or-official-advisory-feed',
      bankfull_q: null,
      alert_q: null,
    };
  }) : undefined;

  return { frames, unit, ...(reaches ? { reaches } : {}) };
}

export async function getOutlook(kind: 'air' | 'flood') {
  const cached = cache.get(kind), ttl = kind === 'air' ? 3600000 : 6 * 3600000;
  if (cached && Date.now() - cached.at < ttl) return cached.data;
  if (pending.has(kind)) return pending.get(kind);
  const task = (async () => {
    const coords = kind === 'air'
      ? [23.2,23.6,24,24.4,24.8].flatMap(lat => [90,90.4,90.8,91.2].map(lon => [lat,lon]))
      : [[24.9,91.87],[25.07,91.4],[24.86,92.18],[25.2,91.27]];
    const url = new URL(kind === 'air' ? 'https://air-quality-api.open-meteo.com/v1/air-quality' : 'https://flood-api.open-meteo.com/v1/flood');
    url.searchParams.set('latitude',coords.map(c => c[0]).join(','));
    url.searchParams.set('longitude',coords.map(c => c[1]).join(','));
    url.searchParams.set('timezone','GMT');
    if (kind === 'air') { url.searchParams.set('hourly','pm2_5'); url.searchParams.set('forecast_days','3'); url.searchParams.set('domains','cams_global'); }
    else { url.searchParams.set('daily','river_discharge,river_discharge_p25,river_discharge_p75'); url.searchParams.set('forecast_days','10'); url.searchParams.set('models','forecast_v4'); }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('model-provider-unavailable');
      const normalized = normalizeOutlook(await res.json(), kind);
      const timestamp = new Date().toISOString();
      const data = {
        status: 'ok',
        provenance: 'modeled',
        kind,
        region: kind === 'air' ? 'central-bangladesh' : 'northeast-bangladesh',
        ...normalized,
        timestamp,
        fetchedAt: timestamp,
        issuedAt: null,
        issueTimeReasonCode: 'provider-does-not-expose-run-time',
        source: kind === 'air' ? 'CAMS global / Open-Meteo' : 'GloFAS v4 forecast / Open-Meteo',
        sourceUrl: kind === 'air' ? 'https://open-meteo.com/en/docs/air-quality-api' : 'https://open-meteo.com/en/docs/flood-api',
        resolution: kind === 'air' ? '0.4° (~45 km), native 3-hour steps' : '0.05° (~5 km), daily steps',
        extentStatus: 'unavailable',
        warningStatus: 'unavailable',
        warningReasonCode: 'no-validated-station-threshold-or-arrival-model',
        harvestGuidanceStatus: 'unavailable',
        harvestGuidanceReasonCode: 'no-local-crop-stage-or-official-advisory-feed',
        extentReasonCode: 'no-calibrated-inundation-model',
        reachSelection: kind === 'flood' ? 'largest modeled river within 5 km of query; not validated against warning stations' : null,
        requestedCoordinates: coords,
        observationsStatus: 'unavailable',
        localAccuracy: null
      };
      cache.set(kind, { at: Date.now(), data });
      return data;
    } catch {
      return { status: 'unavailable', kind, reasonCode: 'model-provider-or-valid-horizon-unavailable', timestamp: new Date().toISOString(), frames: [] };
    }
  })();
  pending.set(kind, task);
  try { return await task; } finally { pending.delete(kind); }
}
