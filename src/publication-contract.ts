import { DOMAIN_SIGNALS, type CollageResult } from "./collage.js";
import { DOMAINS, MEASURED_LAYERS, resolveIndexValue } from "./satellite.js";
import { GIBS_COLORMAPS } from "./gibs-colormaps.js";

/** Version of the identities and processing rules recorded for new publications. */
export const PUBLICATION_CONTRACT_VERSION = 1;
export const PUBLICATION_CLOCK_SKEW_MS = 60_000;
export const PUBLICATION_DISTRICT_IDS = [
  "old-dhaka", "motijheel", "parliament", "hatirjheel", "gulshan", "kawran-bazar", "sadarghat",
  "savar-ashulia", "uttara", "mirpur", "dhanmondi", "tejgaon", "chawkbazar", "narayanganj",
] as const;
export const PUBLICATION_DOMAIN_IDS = DOMAINS.map(domain => domain.id);
export const LEGACY_NIGHT_INSTRUMENT = "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance";
export const CURRENT_NIGHT_INSTRUMENT = "VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance";
export const SOLAR_INSTRUMENT = "NASA_POWER_ALLSKY_SFC_SW_DWN";

// These names identify the algorithms actually used by the current collector.
// They are written only for a new acquisition, never inferred for archived rows.
export const PUBLICATION_INSTRUMENTS = [
  ...MEASURED_LAYERS.map(layer => ({
    id: layer.id, domain: layer.domain, unit: layer.unit, static: layer.static === true,
    provenance: layer.static ? "reference" : "measured", sourceHost: "gibs.earthdata.nasa.gov",
    processingMethod: layer.classes ? "gibs-class-window-share-v1" : "gibs-palette-window-mean-v1",
  })),
  { id: SOLAR_INSTRUMENT, domain: "energy", unit: "kWh/m²/day", static: false, provenance: "modeled", sourceHost: "power.larc.nasa.gov", processingMethod: "nasa-power-climatology-point-v1" },
];
const instruments = new Map(PUBLICATION_INSTRUMENTS.map(spec => [spec.id, spec]));
const instrumentFor = (id: string, legacy: boolean) => instruments.get(legacy && id === LEGACY_NIGHT_INSTRUMENT ? CURRENT_NIGHT_INSTRUMENT : id);
function failure(reason: string): never { throw Error(`invalid-snapshot-${reason}`); }
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function exactSet(values: unknown[], expected: readonly string[], reason: string): void {
  if (values.length !== expected.length || new Set(values).size !== values.length ||
      values.some(id => typeof id !== "string" || !expected.includes(id))) failure(reason);
}

function sameEvidence(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameEvidence(left[key], right[key]));
}

const BASIS_EVIDENCE_FIELDS = [
  "source", "sourceUrl", "provenance", "sampling", "coverage", "resolutionM", "nativeResolutionM",
  "nativeResolutionDegrees", "windowM", "censored", "period", "observationDate", "vintage", "label", "label_bn",
] as const;

function sourceMatches(source: unknown, sourceUrl: unknown, spec: typeof PUBLICATION_INSTRUMENTS[number]): boolean {
  if (!nonempty(source) || !nonempty(sourceUrl)) return false;
  if (spec.id === SOLAR_INSTRUMENT ? !source.startsWith("NASA POWER Climatology API · ") : source !== "NASA GIBS") return false;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "https:" && url.hostname === spec.sourceHost && !url.username && !url.password;
  } catch { return false; }
}

/** A mean of decoded palette values must remain inside those values' range. */
const decodedBounds = new Map(MEASURED_LAYERS.filter(layer => !layer.classes).map(layer => {
  const map = GIBS_COLORMAPS[layer.id];
  const values = map ? map.refs.map(ref => resolveIndexValue(map, ref)?.value).filter(finite) : [];
  return [layer.id, values.length ? [Math.min(...values), Math.max(...values)] : null] as const;
}));

/**
 * Publication integrity, not a weather/availability policy. Snapshot publication
 * retains its existing >=50% coverage rule; the live release gate remains stricter.
 * Legacy schema-3 archives retain their original sensor ID and decoded values.
 */
export function validateCollagePublication(input: unknown, { legacy = false, requireMethods = false, now = Date.now() } = {}): asserts input is CollageResult {
  const data = input as CollageResult;
  if (!data || !Array.isArray(data.districts) || !Array.isArray(data.domains) ||
      data.total !== PUBLICATION_DISTRICT_IDS.length * PUBLICATION_INSTRUMENTS.length ||
      !Number.isInteger(data.measured) || data.measured < Math.ceil(data.total / 2) || data.measured > data.total) {
    throw Error("insufficient-snapshot-coverage");
  }
  if (!finite(now) || !finite(new Date(now).getTime()) || !nonempty(data.timestamp) || !finite(Date.parse(data.timestamp)) ||
      Date.parse(data.timestamp) > now + PUBLICATION_CLOCK_SKEW_MS) failure("timestamp");
  if (!legacy && (data.city !== "Dhaka" || data.provenance !== "mixed")) failure("publication-source");
  const latestObservationDay = new Date(now + PUBLICATION_CLOCK_SKEW_MS).toISOString().slice(0,10);
  exactSet(data.districts.map(place => place?.id), PUBLICATION_DISTRICT_IDS, "district-identities");
  exactSet(data.domains.map(domain => domain?.id), PUBLICATION_DOMAIN_IDS, "domain-identities");
  let measured = 0;
  let nightProduct: string | null = null;
  for (const place of data.districts) {
    if (!finite(place.lat) || Math.abs(place.lat) > 90 || !finite(place.lng) || Math.abs(place.lng) > 180 ||
        !Array.isArray(place.measurements) || place.measurements.length !== PUBLICATION_INSTRUMENTS.length ||
        !Array.isArray(place.readings)) failure("shape");
    const ids = place.measurements.map(measurement => measurement?.layerId);
    const canonicalIds = ids.map(id => legacy && id === LEGACY_NIGHT_INSTRUMENT ? CURRENT_NIGHT_INSTRUMENT : id);
    exactSet(canonicalIds, PUBLICATION_INSTRUMENTS.map(spec => spec.id), "instrument-identities");
    exactSet(place.readings.map(reading => reading?.domain), PUBLICATION_DOMAIN_IDS, "reading-identities");
    for (const measurement of place.measurements) {
      const spec = instrumentFor(measurement.layerId, legacy);
      if (!spec || measurement.unit !== spec.unit || measurement.domain !== spec.domain) failure("instrument-contract");
      if (spec.id === CURRENT_NIGHT_INSTRUMENT) {
        if (nightProduct && nightProduct !== measurement.layerId) failure("mixed-night-instruments");
        nightProduct = measurement.layerId;
      }
      const method = (measurement as typeof measurement & { processingMethod?: unknown }).processingMethod;
      if (!legacy && (requireMethods || method !== undefined) && method !== spec.processingMethod) failure("processing-method");
      if (measurement.coverage !== null && (!finite(measurement.coverage) || measurement.coverage < 0 || measurement.coverage > 1)) failure("measurement-coverage");
      if (measurement.observationDate !== null && (!date(measurement.observationDate) || measurement.observationDate > latestObservationDay)) failure("measurement-period");
      if (!legacy && (measurement.provenance !== spec.provenance || !sourceMatches(measurement.source, measurement.sourceUrl, spec))) failure("measurement-source");
      if (measurement.status === "ok") {
        if (!finite(measurement.value) || measurement.reasonCode !== null ||
            !(date(measurement.observationDate) || nonempty(measurement.vintage) || nonempty(measurement.period))) failure("measurement");
        // Do not apply today's colour-map decoder bounds to original legacy
        // archives. Their original processing method was not recorded.
        if (!legacy) {
          if (!finite(measurement.min) || !finite(measurement.max) || !finite(measurement.mean) ||
              measurement.min > measurement.max || measurement.value < measurement.min || measurement.value > measurement.max || measurement.value !== measurement.mean) failure("measurement-statistics");
          if (measurement.static !== spec.static || !Number.isInteger(measurement.samples) || measurement.samples < 0) failure("measurement-method");
          if (spec.id === SOLAR_INSTRUMENT && (measurement.value <= 0 || measurement.provenance !== "modeled" || !nonempty(measurement.period) || measurement.coverage !== null)) failure("solar-measurement");
          if (spec.unit === "% of ground" && (measurement.value < 0 || measurement.value > 100)) failure("measurement-range");
          const bounds = decodedBounds.get(spec.id);
          if (bounds && [measurement.value,measurement.min,measurement.max].some(value => value < bounds[0] - 0.00051 || value > bounds[1] + 0.00051)) failure("measurement-range");
          if (spec.static && (!nonempty(measurement.vintage) || measurement.observationDate !== null)) failure("measurement-period");
          if (!spec.static && spec.id !== SOLAR_INSTRUMENT && (!date(measurement.observationDate) || measurement.observationDate > new Date(data.timestamp).toISOString().slice(0,10))) failure("measurement-period");
        }
        measured++;
      } else if (measurement.status !== "unavailable" || measurement.value !== null || !nonempty(measurement.reasonCode) ||
                 (!legacy && [measurement.min,measurement.max,measurement.mean].some(value => value !== null))) failure("missing-value");
    }
    for (const reading of place.readings) {
      const expectedSignals = place.measurements.filter(measurement => DOMAIN_SIGNALS[reading.domain]?.includes(legacy && measurement.layerId === LEGACY_NIGHT_INSTRUMENT ? CURRENT_NIGHT_INSTRUMENT : measurement.layerId));
      if (!Array.isArray(reading.signals) || new Set(reading.signals).size !== reading.signals.length ||
          reading.signals.some(signal => !ids.includes(signal) || !DOMAIN_SIGNALS[reading.domain]?.includes(legacy && signal === LEGACY_NIGHT_INSTRUMENT ? CURRENT_NIGHT_INSTRUMENT : signal))) failure("reading-signals");
      exactSet(reading.signals, expectedSignals.map(measurement => measurement.layerId), "reading-signals");
      if ((reading.status === "ok") !== expectedSignals.some(measurement => measurement.status === "ok")) failure("reading-status");
      if (reading.status === "ok") {
        if (!reading.basis || !finite(reading.basis.value) || !nonempty(reading.reading) || !nonempty(reading.reading_bn) || reading.reasonCode !== null) failure("reading");
        if (!place.measurements.some(measurement => reading.signals.includes(measurement.layerId) && measurement.status === "ok" &&
            measurement.value === reading.basis?.value && measurement.unit === reading.basis?.unit &&
            (legacy || BASIS_EVIDENCE_FIELDS.every(key => sameEvidence(measurement[key], reading.basis?.[key]))))) failure("reading-basis");
      } else if (reading.status !== "unavailable" || reading.basis !== null || reading.reading !== null || reading.reading_bn !== null || !nonempty(reading.reasonCode)) failure("missing-reading");
    }
  }
  if (measured !== data.measured) failure("count");
  const status = measured === data.total ? "ok" : "partial";
  if (data.status !== status || (status === "ok" ? data.reasonCode !== null : !nonempty(data.reasonCode))) failure("status");
}

/** Record the current acquisition's method, without rewriting historical data. */
export function recordPublicationMethods(data: CollageResult): void {
  for (const place of data.districts) for (const measurement of place.measurements) {
    const spec = instruments.get(measurement.layerId);
    if (!spec) failure("instrument-identities");
    Object.assign(measurement, { processingMethod: spec.processingMethod });
  }
}
