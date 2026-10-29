import { fetchSource } from "./source-fetch.js";
/**
 * Satellite measurement over Dhaka.
 *
 * The atlas does not draw rasters and call it a day. It measures them: it
 * reads the palette index of the pixel covering a district, looks that index
 * up in the layer's own colour map, and reports the physical quantity —
 * radiance in nW/(cm² sr), land surface temperature in Kelvin, aerosol
 * optical depth as a dimensionless fraction.
 *
 * The chain that makes that honest:
 *
 *   capabilities → colour map → palette index → physical value
 *
 * Every link is checked. A layer whose colour map is missing is refused, a
 * tile whose pixels are all "no observation" is refused, and a date whose
 * coverage over the city is too thin to measure is refused — each with a
 * reason code rather than a number that came from nowhere.
 *
 * Two lessons from shipping this kind of thing before are baked in here:
 *
 *  1. GIBS publishes a date before the observation behind it is ingested. The
 *     tile for that date is HTTP 200, non-empty, and a single flat colour. A
 *     status check or a byte count accepts it as data. Only decoding it, and
 *     then asking how much of the window actually carries an observation,
 *     tells the truth.
 *
 *  2. A layer's newest date is a property of the layer, not of the city. A
 *     radiometer can have a clear night over one district and be overcast
 *     over another, so the date is resolved per measurement window.
 */

import { decodeGibsPalette, workerInflate } from "./gibs-png.js";
import { colormapRange, GIBS_COLORMAPS, type GibsColormap } from "./gibs-colormaps.js";
import { GIBS_CATALOGUE_LATEST } from "./gibs-catalogue.js";

export const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/** GIBS publishes GoogleMapsCompatible tile matrices: 256 px, Web Mercator. */
export const TILE_SIZE = 256;

/**
 * A layer the atlas measures numerically.
 *
 * `tileLevel` is the GIBS level, and with it the ground resolution:
 * 2^level tiles across the world, so resolution ≈ 156543 m / 2^level at the
 * equator, and a little finer in absolute metres as you move away from it.
 */
export interface MeasuredLayer {
  id: string;
  name: string;
  provider: string;
  tileLevel: number;
  /** What the quantity means, for the operator reading the number. */
  unit: string;
  /** Short bilingual label. */
  label: string;
  label_bn: string;
  /** The city-domain this signal speaks to. */
  domain: string;
  /**
   * Set when the layer is a classification rather than a continuous quantity.
   * The measurement is then the share of the window falling in `classTarget`,
   * which is how a categorical raster becomes a quantity you can rank.
   */
  classes?: Record<number, string>;
  classTarget?: number;
  /** Set when the layer has no time dimension — a static map, not an observation. */
  static?: boolean;
  /**
   * The window radius in pixels.
   *
   * A window has to be wide enough to characterise the place and narrow
   * enough to stay inside it. At level 7 one pixel is 1.3 km, so a radius of
   * two is a five-kilometre neighbourhood; at level 12 one pixel is 35 m, so
   * the same radius would be a hundred-and-seventy-metre patch and would say
   * more about one building than about the district.
   */
  radiusPx?: number;
  /** The vintage of a static layer, which has no observation date. */
  vintage?: string;
}

/**
 * The measured signal set.
 *
 * Every layer here is published by NASA GIBS with a colour map that states
 * what it means. The catalogue in scripts/fixtures/gibs-catalogue.json is the
 * authority for whether each of these ids and levels exist; the contract test
 * checks that.
 */
export const MEASURED_LAYERS: MeasuredLayer[] = [
  {
    id: "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
    name: "Night-time radiance (VIIRS Day/Night Band, at sensor)",
    provider: "NASA GIBS / Suomi NPP",
    tileLevel: 8,
    unit: "nW/(cm² sr)",
    label: "Night radiance",
    label_bn: "রাতের আলোক তীব্রতা",
    domain: "economy",
  },
  {
    id: "MODIS_Terra_Land_Surface_Temp_Day_TES",
    name: "Land surface temperature, daytime (ASTER TES)",
    provider: "NASA GIBS / MODIS Terra",
    tileLevel: 7,
    unit: "K",
    label: "Daytime surface heat",
    label_bn: "দিনের ভূমি তাপমাত্রা",
    domain: "environment",
  },
  {
    id: "MODIS_Terra_Land_Surface_Temp_Night_TES",
    name: "Land surface temperature, night-time (ASTER TES)",
    provider: "NASA GIBS / MODIS Terra",
    tileLevel: 7,
    unit: "K",
    label: "Night-time surface heat",
    label_bn: "রাতের ভূমি তাপমাত্রা",
    domain: "environment",
  },
  {
    id: "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth",
    name: "Aerosol optical depth (MAIAC, MODIS Aqua + Terra)",
    provider: "NASA GIBS / MAIAC",
    tileLevel: 7,
    unit: "1",
    label: "Aerosol optical depth",
    label_bn: "অ্যারোসোল আপটিক্যাল ডেপথ",
    domain: "environment",
  },
  {
    id: "MODIS_Terra_L3_NDVI_16Day",
    name: "Vegetation index (NDVI, 16-day, MODIS Terra)",
    provider: "NASA GIBS / MODIS Terra",
    tileLevel: 9,
    unit: "1",
    label: "Vegetation index",
    label_bn: "উদ্ভিদ সূচক",
    domain: "environment",
  },
  {
    id: "Landsat_Human_Built-up_And_Settlement_Extent",
    name: "Human built-up and settlement extent (HBASE, Landsat, 2010)",
    provider: "NASA GIBS / HBASE from Landsat",
    tileLevel: 12,
    unit: "% of ground",
    label: "Built-up ground",
    label_bn: "নির্মিত ভূমি",
    domain: "mobility",
    classes: { 1: "not-built", 2: "built-up", 3: "road" },
    classTarget: 2,
    static: true,
    vintage: "2010",
    radiusPx: 7,
  },
];

/**
 * The seven city-development domains the atlas speaks to.
 *
 * Each names the signals that speak to it. A domain with no measured signal
 * says so rather than borrowing a number from a neighbouring domain.
 */
export const DOMAINS = [
  {
    id: "environment",
    label: "Environment",
    label_bn: "পরিবেশ",
    question: "What does the air, the heat and the ground say about this place?",
    question_bn: "বায়ু, তাপ ও মাটি এই স্থানের কী বলছে?",
  },
  {
    id: "energy",
    label: "Energy",
    label_bn: "জ্বালানি",
    question: "How much sun falls on this place, and how much light does it make?",
    question_bn: "এই স্থানে কত রোদ পড়ে, আর এটি কত আলো তৈরি করে?",
  },
  {
    id: "economy",
    label: "Economy",
    label_bn: "অর্থনীতি",
    question: "Where is the city's work happening, measured from the light it leaves on?",
    question_bn: "নিজের আলোর ছাপ থেকে শহরের কাজ কোথায় হচ্ছে?",
  },
  {
    id: "mobility",
    label: "Mobility",
    label_bn: "চলাচল",
    question: "How dense is the settled area people move through?",
    question_bn: "মানুষের চলাচলের এলাকা কত ঘন?",
  },
  {
    id: "people",
    label: "People",
    label_bn: "জনগণ",
    question: "How many people live here, and what can the state do for them?",
    question_bn: "এখানে কত মানুষ বাস করে, এবং রাষ্ট্র তাদের জন্য কী করতে পারে?",
  },
  {
    id: "smart-living",
    label: "Smart living",
    label_bn: "স্মার্ট লিভিং",
    question: "Where are a resident's ordinary days most at risk?",
    question_bn: "বাসিন্দার সাধারণ দিনগুলো কোথায় সবচেয়ে ঝুঁকিতে?",
  },
  {
    id: "governance",
    label: "Governance",
    label_bn: "শাসন",
    question: "What can the city see, and how fast?",
    question_bn: "শহর কী দেখতে পারে, এবং কত দ্রুত?",
  },
] as const;

export type DomainId = (typeof DOMAINS)[number]["id"];

/** A place to measure: a district centre from the atlas's own area list. */
export interface MeasurePoint {
  id: string;
  lat: number;
  lng: number;
}

/**
 * The outcome of measuring one layer over one place.
 *
 * A measurement either carries a value with its unit, its observation date
 * and the share of the window that actually observed something — or it says
 * why it could not be measured. There is no third state.
 */
export interface Measurement {
  layerId: string;
  label: string;
  label_bn: string;
  domain: string;
  unit: string;
  status: "ok" | "unavailable";
  value: number | null;
  /** Lowest and highest observed value inside the window. */
  min: number | null;
  max: number | null;
  /** Mean of the observed values. */
  mean: number | null;
  /** Share of the window's pixels that carried an observation. */
  coverage: number | null;
  /** Pixels that carried an observation. */
  samples: number;
  /** The observation date the measurement was taken from. */
  observationDate: string | null;
  /** The vintage of a static layer, which has no observation date. */
  vintage: string | null;
  /** True when the layer is a static map rather than an observation. */
  static: boolean;
  /**
   * True when at least one pixel fell in an open-ended colour-map bin, so the
   * reported value is a lower bound rather than an exact mean.
   */
  censored: boolean;
  reasonCode: string | null;
  /** Ground resolution of one pixel, in metres, at the measured latitude. */
  resolutionM: number | null;
  source?: string; sourceUrl?: string; provenance?: "measured" | "modeled" | "reference";
  period?: string | null; retrievedAt?: string; nativeResolutionM?: number | null;
  nativeResolutionDegrees?: number | null; returnedCoordinates?: number[] | null;
  sampling?: { type: "point-window" | "model-point"; radiusPx: number | null; bbox: [number, number, number, number] | null; scope: string };
}

/* ── Tile geometry ───────────────────────────────────────────────────────── */

/**
 * Ground resolution of one GIBS pixel, in metres, at a given latitude.
 *
 * GIBS uses the standard GoogleMapsCompatible Web Mercator pyramid, so the
 * equator's 156543.03 m / 2^level is scaled by cos(latitude).
 */
export function groundResolutionM(level: number, lat: number): number {
  const equator = 156543.03392804097 / Math.pow(2, level);
  const cos = Math.cos((lat * Math.PI) / 180);
  return equator * Math.max(cos, 1e-6);
}

/** The XY tile covering a point, and the pixel within that tile. */
export function tileForPoint(
  lat: number,
  lng: number,
  level: number,
): { x: number; y: number; pixelX: number; pixelY: number } {
  const n = Math.pow(2, level);
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  const worldPixels = n * TILE_SIZE;
  const worldX = ((lng + 180) / 360) * worldPixels;
  const worldY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * worldPixels;
  return {
    x,
    y,
    pixelX: Math.floor(worldX - x * TILE_SIZE),
    pixelY: Math.floor(worldY - y * TILE_SIZE),
  };
}

/**
 * The global pixel coordinate of a point on the level's pyramid.
 *
 * Global pixels run across the whole world, so a window can be expressed in
 * one coordinate system and then cut into the tiles that hold it. Doing this
 * in tile-local pixels instead is how a sampler ends up reading the wrong
 * tile entirely — and the wrong tile is still a real tile with real pixels,
 * so nothing complains.
 */
export function globalPixelForPoint(
  lat: number,
  lng: number,
  level: number,
): { gx: number; gy: number } {
  const n = Math.pow(2, level);
  const latRad = (lat * Math.PI) / 180;
  const worldPixels = n * TILE_SIZE;
  return {
    gx: Math.floor(((lng + 180) / 360) * worldPixels),
    gy: Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * worldPixels,
    ),
  };
}

/**
 * The tiles a window around a point can touch, given a radius in pixels.
 *
 * The window is expressed in global pixels and then cut at tile boundaries,
 * so a point near a tile edge reads the pixels that are actually beside it.
 */
export function tilesForWindow(
  lat: number,
  lng: number,
  level: number,
  radiusPx: number,
): { x: number; y: number }[] {
  const { gx, gy } = globalPixelForPoint(lat, lng, level);
  const x0 = Math.floor((gx - radiusPx) / TILE_SIZE);
  const x1 = Math.floor((gx + radiusPx) / TILE_SIZE);
  const y0 = Math.floor((gy - radiusPx) / TILE_SIZE);
  const y1 = Math.floor((gy + radiusPx) / TILE_SIZE);
  const tiles: { x: number; y: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      tiles.push({ x: tx, y: ty });
    }
  }
  return tiles;
}

/* ── Tile fetching ───────────────────────────────────────────────────────── */

export function gibsTileUrl(layerId: string, date: string | null, level: number, x: number, y: number): string {
  const t = date ? `${date}/` : "";
  return `${GIBS_BASE}/${layerId}/default/${t}GoogleMapsCompatible_Level${level}/${level}/${y}/${x}.png`;
}

interface DecodedTile {
  indices: Uint8Array;
  width: number;
  height: number;
}

/**
 * Decoded tiles, kept for the life of the isolate.
 *
 * A measurement over fourteen districts touches the same tile repeatedly —
 * districts share tiles, and the date search tries the same tile on several
 * days. Without this the Worker would fetch the same bytes dozens of times.
 */
const tileCache = new Map<string, {value: DecodedTile | null; expires: number}>();
const tilePending = new Map<string, Promise<DecodedTile | null>>();

function tileCacheKey(layerId: string, date: string | null, level: number, x: number, y: number): string {
  return `${layerId}|${date ?? "latest"}|${level}|${x}|${y}`;
}

/**
 * Fetch and decode one tile.
 *
 * Returns null when the tile is missing, is not a palette image, or carries
 * no observation at all. It never throws for an ordinary upstream problem:
 * an unreachable tile is a missing measurement, not a crashed request.
 */
async function collectTile(
  layerId: string,
  date: string | null,
  level: number,
  x: number,
  y: number,
): Promise<DecodedTile | null> {
  const key = tileCacheKey(layerId, date, level, x, y);
  const cached = tileCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const url = gibsTileUrl(layerId, date, level, x, y);
  let result: DecodedTile | null = null;
  try {
    const res = await fetchSource(url, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength) {
        const raster = await decodeGibsPalette(buf, workerInflate);
        result = { indices: raster.indices, width: raster.width, height: raster.height };
      }
    }
  } catch {
    result = null;
  }
  if (tileCache.size >= 256) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, {value:result, expires:Date.now() + (result ? 30*60000 : 60000)});
  return result;
}

async function fetchTile(layerId: string, date: string | null, level: number, x: number, y: number) {
  const key = tileCacheKey(layerId, date, level, x, y);
  const existing = tilePending.get(key);
  if (existing) return existing;
  const task = collectTile(layerId, date, level, x, y);
  tilePending.set(key, task);
  try { return await task; } finally { tilePending.delete(key); }
}

/** Actual sampled pixel edges, not an administrative district boundary. */
export function samplingWindow(lat: number, lng: number, level: number, radiusPx: number): Measurement["sampling"] {
  const {gx, gy} = globalPixelForPoint(lat, lng, level);
  const size = 256 * 2 ** level;
  const lon = (x: number) => x / size * 360 - 180;
  const latitude = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI;
  return {type:"point-window", radiusPx, bbox:[lon(gx-radiusPx),latitude(gy+radiusPx+1),lon(gx+radiusPx+1),latitude(gy-radiusPx)], scope:"sampled-pixels-not-district-average"};
}

/* ── Measurement ─────────────────────────────────────────────────────────── */

/**
 * The share of the window that must carry an observation for the measurement
 * to count.
 *
 * Below this, the "mean" is really a mean over whatever sliver happened to
 * be clear, and reporting it as the district's value would be inventing a
 * figure for the rest of the window.
 */
export const MIN_COVERAGE = 0.25;

interface WindowSample {
  values: number[];
  total: number;
  /** True when at least one pixel sat in an open-ended colour-map bin. */
  censored: boolean;
  /** Pixels falling in each class index, for a classification layer. */
  classCounts: Map<number, number>;
}

/**
 * Collect the observed values inside a square window of pixels around a point.
 *
 * The window is a square in global pixels, which is small enough to stay
 * inside a district and large enough to survive a couple of cloudy pixels.
 * Each pixel is addressed by its global coordinate and then resolved to the
 * tile that holds it, so a window straddling a tile edge still reads the
 * pixels that are actually beside it.
 */
async function sampleWindow(
  layer: MeasuredLayer,
  colormap: GibsColormap,
  date: string | null,
  point: MeasurePoint,
  radiusPx: number,
): Promise<WindowSample> {
  const { gx, gy } = globalPixelForPoint(point.lat, point.lng, layer.tileLevel);
  const tiles = tilesForWindow(point.lat, point.lng, layer.tileLevel, radiusPx);
  const decoded = new Map<string, DecodedTile | null>();
  await Promise.all(
    tiles.map(async (t) => {
      decoded.set(`${t.x}/${t.y}`, await fetchTile(layer.id, date, layer.tileLevel, t.x, t.y));
    }),
  );

  const values: number[] = [];
  const total = (2 * radiusPx + 1) ** 2;
  let censored = false;
  const classCounts = new Map<number, number>();
  for (let dy = -radiusPx; dy <= radiusPx; dy++) {
    for (let dx = -radiusPx; dx <= radiusPx; dx++) {
      const px = gx + dx;
      const py = gy + dy;
      const tile = decoded.get(`${Math.floor(px / TILE_SIZE)}/${Math.floor(py / TILE_SIZE)}`);
      if (!tile) {
        // A missing tile means unknown pixels, not zero pixels.
        continue;
      }
      const localX = px - Math.floor(px / TILE_SIZE) * TILE_SIZE;
      const localY = py - Math.floor(py / TILE_SIZE) * TILE_SIZE;
      if (localX < 0 || localY < 0 || localX >= tile.width || localY >= tile.height) continue;
      const index = tile.indices[localY * tile.width + localX];
      classCounts.set(index, (classCounts.get(index) ?? 0) + 1);
      const resolved = resolveIndexValue(colormap, index);
      if (!resolved) continue;
      if (resolved.lowerBound) censored = true;
      values.push(resolved.value);
    }
  }
  return { values, total, censored, classCounts };
}

/**
 * Resolve the newest date on which this layer carries a real observation over
 * this point.
 *
 * GIBS's own "latest" path can point at a date whose tile is a flat
 * placeholder, and a radiometer's coverage varies across the city, so the
 * date is found by measurement: walk back from today, and take the first date
 * whose window actually holds an observation.
 */
async function resolveObservationDate(
  layer: MeasuredLayer,
  colormap: GibsColormap,
  point: MeasurePoint,
  radiusPx: number,
  candidates: string[],
): Promise<{ date: string; sample: WindowSample } | null> {
  for (const date of candidates) {
    const sample = await sampleWindow(layer, colormap, date, point, radiusPx);
    if (sample.total === 0) continue;
    if (sample.values.length / sample.total >= MIN_COVERAGE) {
      return { date, sample };
    }
  }
  return null;
}

/**
 * Candidate observation dates, newest first.
 *
 * The last few days come first because most layers update daily. The
 * catalogue's own latest date is added because some layers do not: a 16-day
 * vegetation composite or a weekly flood product publishes on its own
 * schedule, so a window of only the last six days would miss it entirely and
 * report "no observation" for a layer that has one.
 */
export function candidateDates(today = new Date(), days = 6): string[] {
  const out: string[] = [];
  for (let back = 0; back < days; back++) {
    out.push(new Date(today.getTime() - back * 86400000).toISOString().split("T")[0]);
  }
  return out;
}

/**
 * The value a palette index stands for.
 *
 * A colour map entry gives a range because the raster is quantised, and the
 * midpoint is the honest estimate of the bin. Two exceptions:
 *
 *  - An exact value ("5") is used as it stands.
 *  - An open-ended range ("[38.2,999999.0)") has no midpoint that means
 *    anything. Taking the midpoint of that range produces a number in the
 *    hundreds of thousands, which is an artefact of the colour map and not a
 *    measurement. Such a bin is reported as its lower bound and flagged, so
 *    a saturated pixel can never drag a district's mean into fiction.
 */
export interface ResolvedValue {
  value: number;
  /** True when the bin was open-ended and the value is a lower bound. */
  lowerBound: boolean;
}

export function resolveIndexValue(
  colormap: GibsColormap,
  index: number,
): ResolvedValue | null {
  const range = colormapRange(colormap, index);
  if (!range) return null;
  const [lo, hi] = range;
  if (lo === hi) return { value: lo, lowerBound: false };
  // GIBS marks an unbounded top bin with a sentinel upper bound of 999999.
  // Its midpoint is a colour-map artefact, not a measurement, so the bin is
  // reported as the lower bound it guarantees and flagged as censored.
  if (hi >= 99999) return { value: lo, lowerBound: true };
  return { value: (lo + hi) / 2, lowerBound: false };
}

/**
 * Measure one layer across many places.
 *
 * The observation date is a property of the layer's acquisition, not of each
 * district, so it is resolved once — from the city centre — and then every
 * district is read on that date. Resolving it per district would let two
 * districts of the same acquisition report different dates, which would read
 * as a real difference in the city when it is only a difference in when the
 * measurement happened.
 *
 * A district whose own pixels are cloud, shadow or nodata on that date is
 * reported unavailable for that signal. That is the honest answer: the
 * satellite did not observe it.
 */
export async function measureLayer(
  layer: MeasuredLayer,
  points: MeasurePoint[],
  radiusPx = layer.radiusPx ?? 2,
  dates = candidateDates(),
): Promise<{ date: string | null; measurements: Measurement[] }> {
  const colormap = GIBS_COLORMAPS[layer.id];
  if (!colormap) {
    return {
      date: null,
      measurements: points.map((p) =>
        unavailableMeasurement(layer, p, "colormap-unresolved"),
      ),
    };
  }

  // A static layer has no time dimension: it is a map, not an observation, so
  // there is no date to resolve and the undated tile path is the only one.
  const isStatic = layer.static === true;
  let chosen: string | null = null;
  if (isStatic) {
    chosen = null;
  } else {
    const catalogueDate = GIBS_CATALOGUE_LATEST[layer.id];
    const candidates = catalogueDate && !dates.includes(catalogueDate)
      ? [...dates, catalogueDate]
      : dates;
    // The city centre decides the acquisition; every district then reads it.
    const probe = points[0] ?? { id: "probe", lat: 23.8103, lng: 90.4125 };
    for (const date of candidates) {
      const sample = await sampleWindow(layer, colormap, date, probe, radiusPx);
      if (sample.total > 0 && sample.values.length / sample.total >= MIN_COVERAGE) {
        chosen = date;
        break;
      }
    }
    if (!chosen) {
      return {
        date: null,
        measurements: points.map((p) =>
          unavailableMeasurement(layer, p, "no-observation-in-window"),
        ),
      };
    }
  }

  const measurements = await Promise.all(
    points.map(async (point) => {
      const sample = await sampleWindow(layer, colormap, chosen, point, radiusPx);
      if (!sample.total || sample.values.length / sample.total < MIN_COVERAGE) {
        return unavailableMeasurement(layer, point, "cloud-or-no-observation", chosen);
      }

      // A classification is measured as the share of the window in the class
      // that matters, not as a mid-point of a colour range.
      if (layer.classes && layer.classTarget !== undefined) {
        const hits = sample.classCounts.get(layer.classTarget) ?? 0;
        const share = hits / sample.values.length;
        return {
          layerId: layer.id,
          label: layer.label,
          label_bn: layer.label_bn,
          domain: layer.domain,
          unit: layer.unit,
          resolutionM: Math.round(groundResolutionM(layer.tileLevel, point.lat)),
          status: "ok" as const,
          value: Number((share * 100).toFixed(2)),
          min: Number((share * 100).toFixed(2)),
          max: Number((share * 100).toFixed(2)),
          mean: Number((share * 100).toFixed(2)),
          coverage: Number((sample.values.length / sample.total).toFixed(3)),
          samples: sample.values.length,
          observationDate: chosen,
          vintage: layer.vintage ?? null,
          static: layer.static === true,
          censored: false,
          reasonCode: null,
        };
      }

      const values = sample.values;
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      return {
        layerId: layer.id,
        label: layer.label,
        label_bn: layer.label_bn,
        domain: layer.domain,
        unit: layer.unit,
        resolutionM: Math.round(groundResolutionM(layer.tileLevel, point.lat)),
        status: "ok" as const,
        value: Number(mean.toFixed(3)),
        min: Number(Math.min(...values).toFixed(3)),
        max: Number(Math.max(...values).toFixed(3)),
        mean: Number(mean.toFixed(3)),
        coverage: Number((values.length / sample.total).toFixed(3)),
        samples: values.length,
        observationDate: chosen,
        vintage: layer.vintage ?? null,
        static: layer.static === true,
        censored: sample.censored,
        reasonCode: null,
      };
    }),
  );
  return { date: chosen, measurements };
}

function unavailableMeasurement(
  layer: MeasuredLayer,
  point: MeasurePoint,
  reasonCode: string,
  date: string | null = null,
): Measurement {
  return {
    layerId: layer.id,
    label: layer.label,
    label_bn: layer.label_bn,
    domain: layer.domain,
    unit: layer.unit,
    resolutionM: Math.round(groundResolutionM(layer.tileLevel, point.lat)),
    status: "unavailable",
    value: null,
    min: null,
    max: null,
    mean: null,
    coverage: 0,
    samples: 0,
    observationDate: date,
    vintage: layer.vintage ?? null,
    static: layer.static === true,
    censored: false,
    reasonCode,
  };
}

/**
 * Measure one layer over one point.
 *
 * Every failure mode ends in a reason code: the layer is not one we can
 * measure, the upstream never produced an observation, the observation was too
 * thin to read, or the colour map could not be resolved.
 */
export async function measureLayerAt(
  layer: MeasuredLayer,
  point: MeasurePoint,
  radiusPx = 2,
  dates = candidateDates(),
): Promise<Measurement> {
  const base = {
    layerId: layer.id,
    label: layer.label,
    label_bn: layer.label_bn,
    domain: layer.domain,
    unit: layer.unit,
    resolutionM: Math.round(groundResolutionM(layer.tileLevel, point.lat)),
  };

  const colormap = GIBS_COLORMAPS[layer.id];
  if (!colormap) {
    return {
      ...base,
      status: "unavailable",
      value: null,
      min: null,
      max: null,
      mean: null,
      coverage: 0,
      samples: 0,
      observationDate: null,
      vintage: layer.vintage ?? null,
      static: layer.static === true,
      censored: false,
      reasonCode: "colormap-unresolved",
    };
  }

  // The catalogue's date for this layer is a candidate too: a layer on a
  // weekly or 16-day cycle would otherwise never be measured.
  const catalogueDate = GIBS_CATALOGUE_LATEST[layer.id];
  const candidates = catalogueDate && !dates.includes(catalogueDate)
    ? [...dates, catalogueDate]
    : dates;

  const resolved = await resolveObservationDate(layer, colormap, point, radiusPx, candidates);
  if (!resolved) {
    return {
      ...base,
      status: "unavailable",
      value: null,
      min: null,
      max: null,
      mean: null,
      coverage: 0,
      samples: 0,
      observationDate: null,
      vintage: layer.vintage ?? null,
      static: layer.static === true,
      censored: false,
      reasonCode: "no-observation-in-window",
    };
  }

  const values = resolved.sample.values;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    ...base,
    status: "ok",
    // The headline figure is the window mean: the district's typical value,
    // not its brightest pixel, which would flatter every district equally.
    value: Number(mean.toFixed(3)),
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    mean: Number(mean.toFixed(3)),
    coverage: Number((values.length / Math.max(resolved.sample.total, 1)).toFixed(3)),
    samples: values.length,
    observationDate: resolved.date,
    vintage: layer.vintage ?? null,
    static: layer.static === true,
    censored: resolved.sample.censored,
    reasonCode: null,
  };
}

function pixelOffset(_r: number): number { return 0; }
