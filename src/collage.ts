/**
 * The collage.
 *
 * One number per district is a reading. Seven domains, each answered by a
 * different satellite instrument, is a collage — and it is the collage that
 * says something, because the interesting fact about a city is rarely in one
 * measurement. It is in the disagreement between them: the district that is
 * hot at night and bright at midnight and has no vegetation is a different
 * place from the one that is merely hot.
 *
 * So this module does three things:
 *
 *  1. Measures the same set of signals over every district, on one
 *     acquisition per signal.
 *  2. Ranks each district within each signal, so "hottest" is a measured
 *     statement about this city rather than an absolute threshold invented
 *     elsewhere.
 *  3. Turns those ranks into a short reading per district — the interpretive
 *     step, which is where a collage earns its keep.
 *
 * Every reading names the measurement it came from. A reading that cannot be
 * traced to a number is not offered.
 */

import {
  DOMAINS,
  MEASURED_LAYERS,
  measureLayer,
  type MeasurePoint,
  type Measurement,
} from "./satellite.js";

export { DOMAINS };

export interface District extends MeasurePoint {
  name: string;
  name_bn: string;
  category: string;
}

/** One domain's answer for one district. */
export interface DomainReading {
  domain: string;
  /** The measured signals this reading rests on. */
  signals: string[];
  /** The plain-language reading, or null when nothing could be measured. */
  reading: string | null;
  reading_bn: string | null;
  /** The measurement the reading is drawn from. */
  basis: {
    label: string;
    label_bn: string;
    value: number | null;
    unit: string;
    observationDate: string | null;
    /** The vintage of a static layer, which has no observation date. */
    vintage: string | null;
    rank: number | null;
    of: number;
    /** How many districts share this value, when it is a tie. */
    tied: number;
    /** Share of the measurement window that carried an observation. */
    coverage: number;
  } | null;
  status: "ok" | "unavailable";
  reasonCode: string | null;
}

export interface DistrictCollage {
  id: string;
  name: string;
  name_bn: string;
  category: string;
  lat: number;
  lng: number;
  /** Every measurement taken over this district. */
  measurements: Measurement[];
  /** One reading per domain. */
  readings: DomainReading[];
  /** The one-line summary a human reads first. */
  headline: string;
  headline_bn: string;
}

export interface CollageResult {
  status: "ok" | "partial" | "unavailable";
  reasonCode: string | null;
  timestamp: string;
  city: string;
  provenance: "measured";
  domains: typeof DOMAINS;
  districts: DistrictCollage[];
  /** The industrial corridors, measured the same way as the districts. */
  corridors: CorridorReading[];
  /** How many measurements were taken and how many succeeded. */
  measured: number;
  total: number;
}

/**
 * An industrial corridor, measured.
 *
 * The registry used to carry a workforce, an export value and a daily
 * turnover for each corridor. None of those had an upstream or a date; they
 * were typed in and read as data. The satellite cannot count workers, but it
 * can measure how much light a corridor leaves on after dark, on a stated
 * night, at a stated resolution — and that is a fact with a source.
 */
export interface CorridorReading {
  id: string;
  name: string;
  sector: string;
  lat: number;
  lng: number;
  night_radiance_nw: number | null;
  night_radiance_unit: string;
  observation_date: string | null;
  resolution_m: number | null;
  city_rank: number | null;
  status: "ok" | "unavailable";
  reasonCode: string | null;
  provenance: "measured";
  note: string;
}

/** A corridor to measure: a point from the atlas's own economy registry. */
export interface CorridorPoint {
  id: string;
  name: string;
  sector: string;
  lat: number;
  lng: number;
}

/**
 * How each signal is ranked and read.
 *
 * `higherIs` says which direction is "more of the thing". For radiance that
 * is brighter: more night-time activity, more lit economy. For aerosol it is
 * dirtier air. The reader is told which, because "top of the city" is
 * meaningless without knowing what is being topped.
 */
interface SignalReading {
  layerId: string;
  higherIs: "more" | "less";
  /** What a high value means, for the reading. */
  highNote: string;
  highNote_bn: string;
  lowNote: string;
  lowNote_bn: string;
  /** Shown alongside the number, e.g. temperature in Kelvin shown as °C. */
  display?: (value: number) => string;
  /** The Bengali form of the same quantity. */
  displayBn?: (value: number) => string;
}

const SIGNAL_READINGS: Record<string, SignalReading> = {
  VIIRS_SNPP_DayNightBand_At_Sensor_Radiance: {
    layerId: "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
    higherIs: "more",
    highNote: "the brightest night-time light in the city",
    highNote_bn: "শহরের সবচেয়ে উজ্জ্বল রাতের আলো",
    lowNote: "the darkest night-time light in the city",
    lowNote_bn: "শহরের সবচেয়ে অন্ধকার রাতের আলো",
  },
  MODIS_Terra_Land_Surface_Temp_Day_TES: {
    layerId: "MODIS_Terra_Land_Surface_Temp_Day_TES",
    higherIs: "more",
    highNote: "the hottest daytime surface in the city",
    highNote_bn: "শহরের সবচেয়ে গরম দিনের ভূমি",
    lowNote: "the coolest daytime surface in the city",
    lowNote_bn: "শহরের সবচেয়ে ঠান্ডা দিনের ভূমি",
    display: (v) => `${(v - 273.15).toFixed(1)} °C`,
  },
  MODIS_Terra_Land_Surface_Temp_Night_TES: {
    layerId: "MODIS_Terra_Land_Surface_Temp_Night_TES",
    higherIs: "more",
    highNote: "the surface that stays hottest after dark",
    highNote_bn: "রাতেও সবচেয়ে গরম থাকা ভূমি",
    lowNote: "the surface that cools fastest after dark",
    lowNote_bn: "রাতে সবচেয়ে দ্রুত ঠান্ডা হওয়া ভূমি",
    display: (v) => `${(v - 273.15).toFixed(1)} °C`,
  },
  MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth: {
    layerId: "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth",
    higherIs: "more",
    highNote: "the haziest air in the city",
    highNote_bn: "শহরের সবচেয়ে ধুলোভরা বায়ু",
    lowNote: "the clearest air in the city",
    lowNote_bn: "শহরের সবচেয়ে পরিষ্কার বায়ু",
  },
  MODIS_Terra_L3_NDVI_16Day: {
    layerId: "MODIS_Terra_L3_NDVI_16Day",
    higherIs: "more",
    highNote: "the most vegetated ground in the city",
    highNote_bn: "শহরের সবচেয়ে বেশি উদ্ভিদাকৃল",
    lowNote: "the least vegetated ground in the city",
    lowNote_bn: "শহরের সবচেয়ে কম উদ্ভিদাকৃল",
  },
  "Landsat_Human_Built-up_And_Settlement_Extent": {
    layerId: "Landsat_Human_Built-up_And_Settlement_Extent",
    higherIs: "more",
    highNote: "the most built-up ground in the city",
    highNote_bn: "শহরের সবচেয়ে বেশি নির্মিত ভূমি",
    lowNote: "the least built-up ground in the city",
    lowNote_bn: "শহরের সবচেয়ে কম নির্মিত ভূমি",
    display: (v) => `${v.toFixed(0)}% built-up`,
    displayBn: (v) => `${v.toFixed(0)}% নির্মিত`,
  },
};

/**
 * The same instrument answers more than one question, and the questions are
 * not the same sentence. Governance asks what the city can see through the
 * aerosol column; Environment asks how dirty the air is. Without this, two
 * domains print the same sentence about the same number, and a reader is
 * entitled to read that as two findings when it is one.
 */
const DOMAIN_PHRASING: Record<string, Record<string, { high: string; high_bn: string; low: string; low_bn: string }>> = {
  governance: {
    MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth: {
      high: "the least transparent air over the city — orbital observation is most limited here",
      high_bn: "শহরের সবচেয়ে অস্বচ্ছ বায়ু — এখানে উপগ্রহ থেকে দেখা সবচেয়ে কঠিন",
      low: "the clearest line of sight from orbit in the city",
      low_bn: "কক্ষপথ থেকে শহরের সবচেয়ে পরিষ্কার দৃশ্যমানতা",
    },
  },
  "smart-living": {
    MODIS_Terra_Land_Surface_Temp_Night_TES: {
      high: "no night-time relief — the surface here stays hottest after dark",
      high_bn: "রাতে কোনো স্বস্তি নেই — রাতেও সবচেয়ে গরম থাকা ভূমি",
      low: "the fastest night-time cooling in the city",
      low_bn: "শহরে রাতে সবচেয়ে দ্রুত ঠান্ডা হওয়া ভূমি",
    },
  },
};

/**
 * How a measured quantity is written beside its number.
 *
 * A dimensionless unit ("1") is dropped rather than shown: an index has no
 * unit, and printing "1" next to it reads as a value.
 */
function showValue(
  value: number | null,
  unit: string,
  display?: (v: number) => string,
): string {
  if (value === null || value === undefined) return "—";
  if (display) return display(value);
  if (unit === "1") return String(Number(value.toFixed(3)));
  return `${value} ${unit}`;
}

/** The order domains are listed in, and their signal grouping. */
const DOMAIN_SIGNALS: Record<string, string[]> = {
  // One instrument per domain, so two domains never print the same
  // measurement as their own finding. Six instruments, six domains.
  environment: ["MODIS_Terra_Land_Surface_Temp_Day_TES"],
  economy: ["VIIRS_SNPP_DayNightBand_At_Sensor_Radiance"],
  mobility: ["Landsat_Human_Built-up_And_Settlement_Extent"],
  people: ["MODIS_Terra_L3_NDVI_16Day"],
  "smart-living": ["MODIS_Terra_Land_Surface_Temp_Night_TES"],
  governance: ["MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth"],
};

/**
 * Rank every measured value against the whole city.
 *
 * Ranking is what makes the reading a statement about the city. "312 K" is a
 * number anyone could have measured anywhere; "the hottest daytime surface
 * in Dhaka" is a finding.
 *
 * The ranking has to span every district: ranking a district against itself
 * makes every one of them first, which is a sentence that says nothing.
 *
 * Ties are recorded, because a tie is a fact too — several districts can sit
 * at the same value, and calling one of them "the most" when five share the
 * value is a claim the measurement does not support.
 */
function rankAcrossCity(
  perDistrict: Map<string, Measurement[]>,
): Map<string, { rank: number; of: number; tied: number }> {
  const byLayer = new Map<string, Array<{ district: string; m: Measurement }>>();
  for (const [district, measurements] of perDistrict) {
    for (const m of measurements) {
      if (m.status !== "ok" || m.value === null) continue;
      const list = byLayer.get(m.layerId) ?? [];
      list.push({ district, m });
      byLayer.set(m.layerId, list);
    }
  }
  const ranks = new Map<string, { rank: number; of: number; tied: number }>();
  for (const [, list] of byLayer) {
    list.sort((a, b) => (b.m.value as number) - (a.m.value as number));
    const of = list.length;
    // Competition ranking: entry i shares the rank of the first entry holding
    // its value. Counting the row itself as a tie — the obvious off-by-one —
    // makes every district look tied with two others, which is a claim the
    // measurement does not support.
    let i = 0;
    while (i < of) {
      let end = i;
      while (end < of && list[end].m.value === list[i].m.value) end++;
      const tied = end - i - 1; // other districts on the same value
      const rank = i + 1;
      for (let k = i; k < end; k++) {
        ranks.set(`${list[k].district}|${rankKey(list[k].m)}`, { rank, of, tied });
      }
      i = end;
    }
  }
  return ranks;
}

function rankKey(m: Measurement): string {
  return `${m.layerId}|${m.observationDate}|${m.value}`;
}

/**
 * Compose the reading for one district and one domain.
 *
 * The reading names the single strongest signal for that domain and says
 * what the district is at the top or bottom of. It never blends two
 * measurements into one number: a blended score would be a new number with
 * no upstream, which is exactly the failure this project exists to remove.
 */
function readDomain(
  domain: string,
  districtId: string,
  measurements: Measurement[],
  ranks: Map<string, { rank: number; of: number; tied: number }>,
  citySize: number,
): DomainReading {
  const wanted = DOMAIN_SIGNALS[domain] ?? [];
  const relevant = measurements.filter(
    (m) => wanted.includes(m.layerId) && m.status === "ok" && m.value !== null,
  );
  if (!relevant.length) {
    return {
      domain,
      signals: wanted,
      reading: null,
      reading_bn: null,
      basis: null,
      status: "unavailable",
      reasonCode: "no-measured-signal-in-domain",
    };
  }

  // The signal that most distinguishes this district decides the reading, and
  // "distinguishes" is distance from the middle of the city in either
  // direction. Picking the highest rank instead would only ever name the top
  // of a scale, so the district that is coldest, or darkest, or least built-up
  // could never be described as what it is.
  let best = relevant[0];
  let bestPlaced = ranks.get(`${districtId}|${rankKey(best)}`);
  let bestScore = -1;
  for (const m of relevant) {
    const placed = ranks.get(`${districtId}|${rankKey(m)}`);
    if (!placed) continue;
    const middle = (placed.of + 1) / 2;
    const halfSpan = Math.max(placed.of - 1, 1) / 2;
    const extremity = Math.abs(placed.rank - middle) / halfSpan;
    // A rank drawn from fourteen districts says more than one drawn from
    // three, so it breaks ties between equally extreme signals.
    const score = extremity + placed.of * 1e-6;
    if (score > bestScore) {
      bestScore = score;
      best = m;
      bestPlaced = placed;
    }
  }

  const spec = SIGNAL_READINGS[best.layerId];
  const phrase = DOMAIN_PHRASING[domain]?.[best.layerId];
  const highNote = phrase?.high ?? spec?.highNote;
  const highNoteBn = phrase?.high_bn ?? spec?.highNote_bn;
  const lowNote = phrase?.low ?? spec?.lowNote;
  const lowNoteBn = phrase?.low_bn ?? spec?.lowNote_bn;
  const of = bestPlaced?.of ?? relevant.length;
  const rank = bestPlaced?.rank ?? of;
  const tied = bestPlaced?.tied ?? 0;
  // A rank is only "in the city" when every district was measured on this
  // acquisition. A cloudy day leaves three districts visible, and calling the
  // hottest of those "the hottest in Dhaka" would describe a city nobody saw.
  const cityWide = of >= citySize;
  const scopeEn = cityWide ? "the city" : `${of} districts measured`;
  const scopeBn = cityWide ? "শহরে" : `পরিমাপ করা ${of}টি এলাকার`;
  const isTop = rank === 1;
  const isBottom = rank + tied === of;
  const tiedTop = tied > 0 && tied === of - 1;

  // Every measured district holding the same value is a uniformity finding,
  // not a fourteen-way tie for first: "100% built-up everywhere" is a fact
  // about the city, and ranking it would be a sentence that says nothing.
  const noteEn = tiedTop
    ? `the same in all ${of} districts measured`
    : isTop
      ? tied > 0
        ? `tied with ${tied} other ${tied === 1 ? "district" : "districts"} at the top of ${scopeEn}`
        : cityWide
          ? highNote ?? `the highest of ${of} districts measured`
          : `the highest of ${of} districts measured`
      : isBottom
        ? tied > 0
          ? `tied with ${tied} other ${tied === 1 ? "district" : "districts"} at the bottom of ${scopeEn}`
          : cityWide
            ? lowNote ?? `the lowest of ${of} districts measured`
            : `the lowest of ${of} districts measured`
        : `ranked ${rank} of ${of} in ${scopeEn}`;
  const noteBn = tiedTop
    ? `পরিমাপ করা সব ${of}টি এলাকায় একই`
    : isTop
      ? tied > 0
        ? `${scopeBn} শীর্ষে আরও ${tied}টি এলাকার সঙ্গে যৌথ`
        : cityWide
          ? highNoteBn ?? `পরিমাপ করা ${of}টি এলাকার মধ্যে সর্বোচ্চ`
          : `পরিমাপ করা ${of}টি এলাকার মধ্যে সর্বোচ্চ`
      : isBottom
        ? tied > 0
          ? `${scopeBn} সর্বনিম্নে আরও ${tied}টি এলাকার সঙ্গে যৌথ`
          : cityWide
            ? lowNoteBn ?? `পরিমাপ করা ${of}টি এলাকার মধ্যে সর্বনিম্ন`
            : `পরিমাপ করা ${of}টি এলাকার মধ্যে সর্বনিম্ন`
        : `${scopeBn} ${of}টির মধ্যে ${rank} নম্বর`;

  const shown = showValue(best.value, best.unit, spec?.display);
  // A unit system is the same in both languages — Celsius is Celsius in
  // Bengali too — so a reading without its own Bengali form falls back to
  // the English one rather than dropping back to the raw unit.
  const shownBn = showValue(best.value, best.unit, spec?.displayBn ?? spec?.display);

  return {
    domain,
    signals: relevant.map((m) => m.layerId),
    reading: `${best.label}: ${shown} — ${noteEn}.`,
    reading_bn: `${best.label_bn}: ${shownBn} — ${noteBn}।`,
    basis: {
      label: best.label,
      label_bn: best.label_bn,
      value: best.value,
      unit: best.unit,
      observationDate: best.observationDate,
      vintage: best.vintage,
      rank,
      of,
      tied,
      // The share of the window that actually saw the district. A mean over
      // 40% of a window is a different claim from one over all of it, and the
      // reader is entitled to know which they are looking at.
      coverage: best.coverage,
    },
    status: "ok",
    reasonCode: null,
  };
}

/**
 * Turn per-district measurements into per-district readings.
 *
 * This is the interpretive step, separated from the measurement so it can be
 * exercised without a network: given the same measurements it always
 * produces the same readings, and the ranking it uses always spans the city.
 */
export function readingsFromMeasurements(
  perDistrict: Map<string, Measurement[]>,
  districtIds: string[],
): Map<string, DomainReading[]> {
  const ranks = rankAcrossCity(perDistrict);
  const out = new Map<string, DomainReading[]>();
  for (const id of districtIds) {
    const measurements = perDistrict.get(id) ?? [];
    out.set(
      id,
      DOMAINS.map(d => readDomain(d.id, id, measurements, ranks, districtIds.length)),
    );
  }
  return out;
}

/**
 * Build the collage for a set of districts.
 *
 * Signals are measured layer by layer, and each layer's acquisition is
 * resolved once, so every district is compared on the same observation.
 */
export async function buildCollage(
  districts: District[],
  corridorPoints: CorridorPoint[] = [],
  radiusPx = 2,
): Promise<CollageResult> {
  const points: MeasurePoint[] = districts.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));
  const perDistrict = new Map<string, Measurement[]>();
  for (const d of districts) perDistrict.set(d.id, []);

  // The layers are independent, so they are measured together rather than
  // one after another. Measuring them in sequence took almost half a minute,
  // which is most of a Worker's request budget spent waiting on the network
  // instead of doing work.
  const layerResults = await Promise.all(
    MEASURED_LAYERS.map((layer) => measureLayer(layer, points, radiusPx)),
  );
  for (const { measurements } of layerResults) {
    // measureLayer returns one measurement per point, in the order it was
    // given, so they zip back onto the districts exactly.
    measurements.forEach((m, index) => {
      const district = districts[index];
      if (district) perDistrict.get(district.id)?.push(m);
    });
  }

  const results: DistrictCollage[] = [];
  let measured = 0;
  let total = 0;

  // One ranking across the whole city, so "the brightest" means brightest.
  const readingsByDistrict = readingsFromMeasurements(
    perDistrict,
    districts.map(d => d.id),
  );

  for (const district of districts) {
    const measurements = perDistrict.get(district.id) ?? [];
    const readings = readingsByDistrict.get(district.id) ?? [];

    for (const m of measurements) {
      total++;
      if (m.status === "ok") measured++;
    }

    // The headline is the reading for the environment: it is the one a
    // resident feels first.
    const lead = readings.find((r) => r.domain === "environment") ?? readings[0];
    results.push({
      id: district.id,
      name: district.name,
      name_bn: district.name_bn,
      category: district.category,
      lat: district.lat,
      lng: district.lng,
      measurements,
      readings,
      headline: lead?.reading ?? "No signal could be measured over this district.",
      headline_bn: lead?.reading_bn ?? "এই এলাকায় কোনো সংকেত মাপা যায়নি।",
    });
  }

  const status: CollageResult["status"] =
    measured === 0 ? "unavailable" : measured < total ? "partial" : "ok";
  return {
    status,
    reasonCode:
      status === "ok" ? null : status === "partial" ? "some-signals-unavailable" : "no-signal-measured",
    timestamp: new Date().toISOString(),
    city: "Dhaka",
    provenance: "measured",
    domains: DOMAINS,
    districts: results,
    corridors: await measureCorridors(corridorPoints),
    measured,
    total,
  };
}

/**
 * Measure the industrial corridors.
 *
 * They are measured on the same instrument and the same night as the
 * districts, so a corridor can be read against the city it sits in.
 */
async function measureCorridors(points: CorridorPoint[]): Promise<CorridorReading[]> {
  if (!points.length) return [];
  const layer = MEASURED_LAYERS.find(
    (l) => l.id === "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
  );
  if (!layer) return [];
  const { measurements } = await measureLayer(
    layer,
    points.map(p => ({ id: p.id, lat: p.lat, lng: p.lng })),
    2,
  );
  const corridors: CorridorReading[] = points.map((p, index) => {
    const m = measurements[index];
    return {
      id: p.id,
      name: p.name,
      sector: p.sector,
      lat: p.lat,
      lng: p.lng,
      night_radiance_nw: m?.status === "ok" ? m.value : null,
      night_radiance_unit: "nW/(cm² sr)",
      observation_date: m?.observationDate ?? null,
      resolution_m: m?.resolutionM ?? null,
      city_rank: null,
      status: m?.status ?? "unavailable",
      reasonCode: m?.reasonCode ?? "corridor-not-measured",
      provenance: "measured",
      note: "Night-time radiance measured by VIIRS Day/Night Band over the corridor centre.",
    };
  });
  // Rank the corridors against each other, so the figure says something.
  const ranked = corridors
    .map((c, i) => ({ c, i, v: measurements[i]?.value ?? null }))
    .filter(x => x.v !== null)
    .sort((a, b) => (b.v as number) - (a.v as number));
  ranked.forEach((x, index) => {
    corridors[x.i].city_rank = index + 1;
  });
  if (ranked.length && ranked[0].v === ranked[ranked.length - 1].v) {
    corridors[ranked[0].i].note = "Tied for the brightest night-time light of the measured corridors in the city.";
  } else if (ranked.length) {
    corridors[ranked[0].i].note = "Brightest night-time light of the measured corridors in the city.";
  }
  return corridors;
}
