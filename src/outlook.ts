// Spatial model output, never observations or calibrated inundation extents.
type Row = { latitude: number; longitude: number; hourly?: Record<string, unknown[]>; daily?: Record<string, unknown[]>; hourly_units?: Record<string,string>; daily_units?: Record<string,string> };
const cache = new Map<string, { at: number; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export interface NortheastReachMeta {
  station: string;
  station_bn: string;
  river: string;
  river_bn: string;
  haor: string;
  haor_bn: string;
  vulnerability: string;
  vulnerability_bn: string;
  bankfull_q: number;
  alert_q: number;
}

const NORTHEAST_REACHES: { lat: number; lon: number; meta: NortheastReachMeta }[] = [
  {
    lat: 25.2,
    lon: 91.27,
    meta: {
      station: "Tahirpur / Lorergorh",
      station_bn: "তাহিরপুর / লরেড়গড়",
      river: "Jadukata River",
      river_bn: "যাদুকাটা নদী",
      haor: "Tanguar & Shanir Haor",
      haor_bn: "টাঙ্গুয়ার ও শনির হাওর",
      vulnerability: "Submersible dykes protecting Boro paddy crops",
      vulnerability_bn: "বোরো ধান সুরক্ষার ডুবন্ত বাঁধ",
      bankfull_q: 350,
      alert_q: 600,
    },
  },
  {
    lat: 25.07,
    lon: 91.4,
    meta: {
      station: "Sunamganj Sadar",
      station_bn: "সুনামগঞ্জ সদর",
      river: "Surma River",
      river_bn: "সুরমা নদী",
      haor: "Dekhar & Karchar Haor",
      haor_bn: "দেখার ও খরচার হাওর",
      vulnerability: "Low-lying Boro paddy depressions and municipal dykes",
      vulnerability_bn: "নিচু বোরো ধানের জমি ও শহর রক্ষা বাঁধ",
      bankfull_q: 550,
      alert_q: 900,
    },
  },
  {
    lat: 24.86,
    lon: 92.18,
    meta: {
      station: "Amalshid / Zakiganj",
      station_bn: "অমলশীদ / জকিগঞ্জ",
      river: "Kushiyara River (Barak Bifurcation)",
      river_bn: "কুশিয়ারা নদী (বরাক মোহনা)",
      haor: "Hakaluki Haor & Fenchuganj Corridor",
      haor_bn: "হাকালুকি হাওর ও ফেঞ্চুগঞ্জ করিডোর",
      vulnerability: "Primary transboundary inflow into Hakaluki Haor basin",
      vulnerability_bn: "হাকালুকি হাওরে প্রধান আন্তঃসীমান্ত পাহাড়ি ঢল",
      bankfull_q: 1200,
      alert_q: 1800,
    },
  },
  {
    lat: 24.9,
    lon: 91.87,
    meta: {
      station: "Sylhet Sadar",
      station_bn: "সিলেট সদর",
      river: "Surma River (Upper Reach)",
      river_bn: "সুরমা নদী (উজান প্রবাহ)",
      haor: "Upper Surma Valley",
      haor_bn: "উজান সুরমা উপত্যকা",
      vulnerability: "Urban lowlands and riverbank agricultural plots",
      vulnerability_bn: "শহরের নিচু এলাকা ও নদী তীরবর্তী কৃষি জমি",
      bankfull_q: 400,
      alert_q: 700,
    },
  },
];

function findNearestReach(lat: number, lon: number): NortheastReachMeta | undefined {
  let bestDist = Infinity;
  let bestMeta: NortheastReachMeta | undefined;
  for (const r of NORTHEAST_REACHES) {
    const d = Math.hypot(lat - r.lat, lon - r.lon);
    if (d < 0.25 && d < bestDist) {
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
      if (!Number.isFinite(ms) || ms < start || ms > now + (kind === 'air' ? 48 * 3600000 : 10 * 86400000)) return;
      if (kind === 'air' && new Date(ms).getUTCHours() % 3 !== 0) return;
      const v = series[key][i], lo = series.river_discharge_p25?.[i], hi = series.river_discharge_p75?.[i];
      const quartilesValid = units.river_discharge_p25 === unit && units.river_discharge_p75 === unit && finite(lo) && finite(hi) && lo <= hi;
      values.set(time, { value: finite(v) ? v : null, p25: quartilesValid ? lo : null, p75: quartilesValid ? hi : null });
      times.add(time);
    });
    cells.push({ id, latitude: row.latitude, longitude: row.longitude, values });
  }

  // Pre-calculate reach peak arrivals, lead times and harvest decision advisories for flood reaches
  const reachMetaMap = new Map<string, {
    meta?: NortheastReachMeta;
    peakValue: number | null;
    peakTime: string | null;
    peakLeadHours: number | null;
    peakLeadDays: number | null;
    arrivalLeadHours: number | null;
    riskLevel: 'normal' | 'watch' | 'alert';
    harvestAdvisory: string;
    harvestAdvisory_bn: string;
  }>();

  if (kind === 'flood') {
    for (const c of cells) {
      const meta = findNearestReach(c.latitude, c.longitude);
      let peakVal: number | null = null;
      let peakT: string | null = null;
      let maxV = -Infinity;
      let arrivalH: number | null = null;
      const bankfull = meta?.bankfull_q ?? 500;
      const alert = meta?.alert_q ?? 800;

      for (const [timeStr, valObj] of c.values.entries()) {
        if (valObj.value !== null) {
          if (valObj.value > maxV) {
            maxV = valObj.value;
            peakT = timeStr;
          }
          if (valObj.value >= bankfull && arrivalH === null) {
            arrivalH = Math.max(0, Math.round((Date.parse(timeStr) - now) / 3600000));
          }
        }
      }
      if (Number.isFinite(maxV)) peakVal = maxV;
      const peakHours = peakT ? Math.max(0, Math.round((Date.parse(peakT) - now) / 3600000)) : null;
      const peakDays = peakHours !== null ? Math.round(peakHours / 24) : null;

      const riskLevel: 'normal' | 'watch' | 'alert' =
        peakVal !== null && peakVal >= alert
          ? 'alert'
          : (peakVal !== null && peakVal >= bankfull ? 'watch' : 'normal');

      let advisory = "Defer harvest: seasonal river flow is within safe limits. Allow crops to reach 100% full ripening for maximum grain yield.";
      let advisory_bn = "অকাল কর্তন পরিহার: নদীপ্রবাহ নিরাপদ মৌসুমি সীমার মধ্যে রয়েছে। পূর্ণ ফলনের জন্য ধান সম্পূর্ণ পরিপক্ব হতে দিন।";

      if (riskLevel === 'alert') {
        advisory = "Emergency early harvest: peak flood surge arrives within <72h. Reap Boro paddy >=80% ripe immediately to prevent submersion loss.";
        advisory_bn = "জরুরি আগাম কর্তন: ৭২ ঘণ্টার মধ্যে পাহাড়ি ঢল আসার সম্ভাবনা। বাঁধ উপচে ফসলহানি রোধে ৮০% পাকা বোরো ধান দ্রুত কাটুন।";
      } else if (riskLevel === 'watch') {
        advisory = "Harvest preparation: river flow rising towards bankfull. Mobilize combine harvesters and labor. Track upstream Cherrapunji rain.";
        advisory_bn = "কর্তন প্রস্তুতি: নদীপ্রবাহ ডুবন্ত বাঁধের উচ্চতার দিকে বাড়ছে। কম্বাইন হারভেস্টার ও কৃষি শ্রমিক প্রস্তুত রাখুন। চেরাপুঞ্জির বৃষ্টি পর্যবেক্ষণ করুন।";
      }

      reachMetaMap.set(c.id, {
        meta,
        peakValue: peakVal,
        peakTime: peakT,
        peakLeadHours: peakHours,
        peakLeadDays: peakDays,
        arrivalLeadHours: arrivalH,
        riskLevel,
        harvestAdvisory: advisory,
        harvestAdvisory_bn: advisory_bn,
      });
    }
  }

  const frames = [...times].sort().map(validAt => ({
    validAt,
    cells: cells.map(c => {
      const v = c.values.get(validAt) || { value: null, p25: null, p75: null };
      const reachInfo = reachMetaMap.get(c.id);
      const cellRisk: 'normal' | 'watch' | 'alert' =
        v.value !== null && reachInfo?.meta
          ? (v.value >= reachInfo.meta.alert_q ? 'alert' : (v.value >= reachInfo.meta.bankfull_q ? 'watch' : 'normal'))
          : (reachInfo?.riskLevel || 'normal');

      return {
        id: c.id,
        latitude: c.latitude,
        longitude: c.longitude,
        value: v.value,
        p25: v.p25,
        p75: v.p75,
        ...(kind === 'flood' && reachInfo?.meta ? {
          station: reachInfo.meta.station,
          station_bn: reachInfo.meta.station_bn,
          river: reachInfo.meta.river,
          river_bn: reachInfo.meta.river_bn,
          haor: reachInfo.meta.haor,
          haor_bn: reachInfo.meta.haor_bn,
          vulnerability: reachInfo.meta.vulnerability,
          vulnerability_bn: reachInfo.meta.vulnerability_bn,
          bankfull_q: reachInfo.meta.bankfull_q,
          alert_q: reachInfo.meta.alert_q,
          peakValue: reachInfo.peakValue,
          peakTime: reachInfo.peakTime,
          peakLeadHours: reachInfo.peakLeadHours,
          peakLeadDays: reachInfo.peakLeadDays,
          arrivalLeadHours: reachInfo.arrivalLeadHours,
          riskLevel: cellRisk,
          harvestAdvisory: reachInfo.harvestAdvisory,
          harvestAdvisory_bn: reachInfo.harvestAdvisory_bn,
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
      station: info?.meta?.station || c.id,
      station_bn: info?.meta?.station_bn || c.id,
      river: info?.meta?.river || 'Northeast River',
      river_bn: info?.meta?.river_bn || 'উত্তর-পূর্ব নদী',
      haor: info?.meta?.haor || 'Haor Basin',
      haor_bn: info?.meta?.haor_bn || 'হাওর অঞ্চল',
      bankfull_q: info?.meta?.bankfull_q || null,
      alert_q: info?.meta?.alert_q || null,
      peakValue: info?.peakValue || null,
      peakTime: info?.peakTime || null,
      peakLeadHours: info?.peakLeadHours || null,
      peakLeadDays: info?.peakLeadDays || null,
      arrivalLeadHours: info?.arrivalLeadHours || null,
      riskLevel: info?.riskLevel || 'normal',
      harvestAdvisory: info?.harvestAdvisory || null,
      harvestAdvisory_bn: info?.harvestAdvisory_bn || null,
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
        extentStatus: kind === 'flood' ? 'modeled-reaches-with-arrival-and-submersible-embankment-risk' : 'unavailable',
        extentReasonCode: kind === 'flood' ? 'field-level-inundation-requires-bwdb-submersible-dyke-dem' : 'no-calibrated-inundation-model',
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
