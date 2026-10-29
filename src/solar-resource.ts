import { fetchSource } from "./source-fetch.js";
/**
 * The solar resource — NASA's POWER climatology.
 *
 * POWER answers a question the satellites cannot: not what a place is
 * *doing*, but what the sun does *to* it. The all-sky surface shortwave
 * figure is the energy arriving on a flat surface each day, averaged over the
 * climatological period — the ceiling on what rooftop solar could ever
 * collect here.
 *
 * It is a reanalysis, not an observation. That difference is carried all the
 * way through: the provenance is `modeled`, the reading says so, and the
 * period it covers is named.
 *
 * No key, no registration, and the figure is the same every time it is
 * asked for, so it is cached hard.
 */

/** POWER's own marker for a value it could not compute. */
const FILL_VALUE = -999;

export interface SolarReading {
  status: "ok" | "unavailable";
  /** Annual mean daily all-sky surface shortwave, kWh/m²/day. */
  value: number | null;
  unit: string;
  label: string;
  label_bn: string;
  /** POWER is a reanalysis: this is never "measured". */
  provenance: "modeled";
  /** The climatological period the figure averages over. */
  period: string | null;
  retrievedAt?: string;
  returnedCoordinates?: number[] | null;
  nativeResolutionDegrees?: number | null;
  sources?: string[];
  source: string;
  sourceUrl: string;
  reasonCode: string | null;
  /** The monthly figures, so a reader can see the season. */
  monthly: { month: string; value: number }[] | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function powerUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    parameters: "ALLSKY_SFC_SW_DWN",
    community: "RE",
    longitude: lng.toFixed(4),
    latitude: lat.toFixed(4),
    format: "JSON",
  });
  return `https://power.larc.nasa.gov/api/temporal/climatology/point?${params}`;
}

/**
 * Read the annual and monthly solar figures out of a POWER response.
 *
 * Every field is checked: a payload missing the parameter, carrying the fill
 * value, or holding a number that is not a number is a failure, and a
 * failure is reported as one. A climatology that quietly returned zero would
 * be the worst kind of wrong — it would read as "this place gets no sun".
 */
export function selectSolar(raw: unknown): {
  annual: number;
  monthly: { month: string; value: number }[];
  period: string | null;
  sources: string[]; returnedCoordinates: number[] | null; nativeResolutionDegrees: number | null;
} {
  const payload = raw as {
    properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: Record<string, number> } };
    header?: { sources?: string[]; range?: string };
    parameters?: { ALLSKY_SFC_SW_DWN?: { units?: string } };
    geometry?: { coordinates?: number[] };
  };
  const series = payload?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  if (!series || typeof series !== "object") {
    throw new Error("power-invalid-response");
  }
  const annual = series.ANN;
  if (typeof annual !== "number" || !Number.isFinite(annual) || annual <= 0 || annual === FILL_VALUE) {
    throw new Error("power-no-valid-observation");
  }
  const monthly: { month: string; value: number }[] = [];
  for (const month of MONTHS) {
    const value = series[month];
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value !== FILL_VALUE) {
      monthly.push({ month, value });
    }
  }
  if (payload.parameters?.ALLSKY_SFC_SW_DWN?.units !== "kW-hr/m^2/day") throw Error("power-invalid-units");
  const period = payload.header?.range;
  if (typeof period !== "string" || !/\b(19|20)\d{2}\b/.test(period)) throw Error("power-missing-period");
  const sources = payload.header?.sources;
  if (!Array.isArray(sources) || !sources.length || !sources.every(s=>typeof s === "string")) throw Error("power-missing-source");
  const coordinates = payload.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(Number.isFinite)) throw Error("power-invalid-location");
  return { annual, monthly, period, sources, returnedCoordinates: coordinates,
    nativeResolutionDegrees: sources.includes("SYN1DEG") ? 1 : null };

}

const cache = new Map<string, { reading: SolarReading; expires: number }>();
const pending = new Map<string, Promise<SolarReading>>();

/**
 * The solar resource at a point.
 *
 * A point's figure does not change between calls, so a successful reading is
 * kept; a failure is not, because the next request should try again rather
 * than live with a stale failure.
 */
async function collectSolarResource(lat: number, lng: number): Promise<SolarReading> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.reading;

  const base: Omit<SolarReading, "status" | "value" | "reasonCode" | "monthly"> = {
    unit: "kWh/m²/day",
    label: "Solar resource",
    label_bn: "সৌর সম্পদ",
    provenance: "modeled",
    period: null,
    source: "NASA POWER Climatology API · SYN1DEG",
    sourceUrl: "https://power.larc.nasa.gov/",
  };

  try {
    const res = await fetchSource(powerUrl(lat, lng), {
      signal: AbortSignal.timeout(12000),
      headers: { "user-agent": "dhaka-3d-atlas/1.0" },
    });
    if (!res.ok) throw new Error(res.status === 429 ? "power-rate-limited" : "power-upstream-http-error");
    const selected = selectSolar(await res.json());
    const reading: SolarReading = {
      ...base,
      status: "ok",
      value: Number(selected.annual.toFixed(4)),
      period: selected.period,
      source: `NASA POWER Climatology API · ${selected.sources.join(", ")}`,
      sourceUrl: powerUrl(lat, lng),
      retrievedAt: new Date().toISOString(),
      returnedCoordinates: selected.returnedCoordinates,
      nativeResolutionDegrees: selected.nativeResolutionDegrees,
      sources: selected.sources,
      monthly: selected.monthly,
      reasonCode: null,
    };
    cache.set(key, {reading, expires: Date.now() + 86400000});
    return reading;
  } catch (err) {
    const reasonCode =
      err instanceof Error && /^power-[a-z-]+$/.test(err.message)
        ? err.message
        : "power-upstream-unreachable";
    const reading: SolarReading = {
      ...base,
      status: "unavailable",
      value: null,
      period: null,
      monthly: null,
      reasonCode,
    };
    cache.set(key, {reading, expires: Date.now() + 5 * 60000});
    return reading;
  }
}

export async function getSolarResource(lat: number, lng: number): Promise<SolarReading> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = collectSolarResource(lat, lng);
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
