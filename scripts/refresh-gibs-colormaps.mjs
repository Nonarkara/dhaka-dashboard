#!/usr/bin/env node
/**
 * Vendor the GIBS colour maps for the layers the atlas measures.
 *
 * GIBS serves every raster as a palette PNG: the pixel carries an index into a
 * 256-entry palette, and the palette itself is the only place the physical
 * quantity lives (nW/(cm² sr), Kelvin, aerosol optical depth). The colour map
 * XML is the authority for that mapping, and the WMTS capabilities document
 * names the exact file each layer uses.
 *
 * So a measurement is only honest if it travels the whole chain:
 *
 *   capabilities → colormap href → ref → value range → pixel index → quantity
 *
 * A layer measured with the wrong colour map is a number in the wrong unit,
 * which is worse than no number at all. This script walks the chain from the
 * capabilities document, writes the resulting lookup tables, and refuses to
 * emit anything for a layer whose colour map cannot be resolved.
 *
 * Usage: node scripts/refresh-gibs-colormaps.mjs [--check]
 *   --check  exit non-zero if the vendored file differs from upstream
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAPABILITIES_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml";
const COLORMAP_BASE = "https://gibs.earthdata.nasa.gov/colormaps/v1.3";
const OUT = join(ROOT, "src", "gibs-colormaps.ts");

/**
 * The layers the atlas measures numerically. Everything here is a continuous
 * physical quantity, so each one needs a colour map whose entries carry a
 * `value` range in the layer's own unit.
 *
 *   id                      GIBS layer id
 *   colormap                file name under colormaps/v1.3
 *   units                   physical unit, as published by GIBS
 */
export const MEASURED_LAYERS = [
  {
    id: "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
    colormap: "VIIRS_DayNightBand_At_Sensor_Radiance.xml",
    units: "nW/(cm² sr)",
  },
  {
    id: "MODIS_Terra_Land_Surface_Temp_Day_TES",
    colormap: "MODIS_Land_Surface_Temp.xml",
    units: "K",
  },
  {
    id: "MODIS_Terra_Land_Surface_Temp_Night_TES",
    colormap: "MODIS_Land_Surface_Temp.xml",
    units: "K",
  },
  {
    id: "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth",
    colormap: "MODIS_VIIRS_AOD.xml",
    units: "1",
  },
  {
    id: "MODIS_Terra_L3_NDVI_16Day",
    colormap: "MODIS_L3_NDVI.xml",
    units: "1",
  },
  {
    id: "Landsat_Human_Built-up_And_Settlement_Extent",
    colormap: "Landsat_Human_Built-up_And_Settlement_Extent.xml",
    units: null,
  },
];

function parseXmlAttrs(tag) {
  const attrs = {};
  // The capabilities document uses single quotes and varies the namespace
  // prefix (xlink:href, ns1:href), so both quote styles are accepted and the
  // prefix is stripped — the local name is what identifies the attribute.
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) {
    const key = m[1].includes(":") ? m[1].split(":").pop() : m[1];
    attrs[key] = m[2] !== undefined ? m[2] : m[3];
  }
  return attrs;
}

/**
 * Parse one GIBS colour map document.
 *
 * A colour map is a set of <ColorMap> blocks. The first is "No Data" and its
 * entries carry nodata="true"; the rest carry the physical quantity in
 * `value`, expressed as a range such as "[0.1,0.2)". A single-value entry
 * such as value="5" is an exact value.
 */
export function parseColormap(xml) {
  const maps = [];
  const blockRe = /<ColorMap\s+([^>]*)>([\s\S]*?)<\/ColorMap>/g;
  let block;
  while ((block = blockRe.exec(xml))) {
    const attrs = parseXmlAttrs(block[1]);
    const title = attrs.title || "untitled";
    const units = attrs.units || null;
    const entries = [];
    const entryRe = /<ColorMapEntry\s+([^>]*?)\/>/g;
    let entry;
    while ((entry = entryRe.exec(block[2]))) {
      const a = parseXmlAttrs(entry[1]);
      if (a.ref === undefined) continue;
      entries.push({
        ref: Number(a.ref),
        value: a.value ?? null,
        sourceValue: a.sourceValue ?? null,
        nodata: a.nodata === "true",
        transparent: a.transparent === "true",
      });
    }
    maps.push({ title, units, entries });
  }
  return maps;
}

/**
 * Parse a value range such as "[0.1,0.2)" or "5" into [low, high].
 * Returns null when the string is not a range this code understands, because a
 * range we cannot read is a range we must not silently turn into a number.
 */
export function parseRange(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  const exact = trimmed.match(/^(-?\d+(?:\.\d+)?)$/);
  if (exact) {
    const v = Number(exact[1]);
    return [v, v];
  }
  const range = trimmed.match(/^\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
  if (range) return [Number(range[1]), Number(range[2])];
  return null;
}

/**
 * Build the index → value table for one layer.
 *
 * `value` is the physical range when the colour map states one. A
 * classification has no physical range — its entries carry only a class code
 * in `sourceValue` — so that is used instead, which is exactly what makes the
 * class index and the class meaning line up.
 *
 * Entries whose range cannot be parsed are dropped, but a layer that ends up
 * with no usable entries is an error rather than an empty table: a table that
 * silently measures nothing would report "unavailable" for the wrong reason.
 */
export function buildLookup(maps, expectedUnits) {
  const ranges = new Map();
  const nodata = new Set();
  const transparent = new Set();
  let units = null;
  for (const map of maps) {
    if (map.units) units = map.units;
    for (const e of map.entries) {
      if (e.nodata) {
        nodata.add(e.ref);
        continue;
      }
      // A transparent entry is one GIBS renders as "nothing here" even though
      // the raster carries a value — a negative NDVI over water, for instance.
      // It is present in the file but is not an observation of the quantity the
      // layer claims to measure, so it must not be averaged into a figure
      // described as that quantity.
      if (e.transparent) {
        transparent.add(e.ref);
        continue;
      }
      const range = parseRange(e.value) ?? parseRange(e.sourceValue);
      if (!range) continue;
      // A later colour map wins for the same index, matching how GIBS resolves
      // overlapping entries when it renders the tile.
      ranges.set(e.ref, range);
    }
  }
  if (!ranges.size) {
    throw new Error(`colour map has no readable value entries (units=${expectedUnits})`);
  }
  if (expectedUnits && units && units !== expectedUnits) {
    throw new Error(`colour map units "${units}" do not match expected "${expectedUnits}"`);
  }
  const refs = [...ranges.keys()].sort((a, b) => a - b);
  const lows = [];
  const highs = [];
  for (const ref of refs) {
    const [lo, hi] = ranges.get(ref);
    lows.push(lo);
    highs.push(hi);
  }
  return {
    units: units || expectedUnits || null,
    refs,
    lows,
    highs,
    nodata: [...nodata].sort((a, b) => a - b),
    transparent: [...transparent].sort((a, b) => a - b),
  };
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/**
 * Resolve each layer's colour map from the capabilities document itself, so
 * the vendored table can never drift from what GIBS actually serves.
 */
export async function resolveFromCapabilities(capabilitiesXml) {
  const wanted = new Map(MEASURED_LAYERS.map((l) => [l.id, l]));
  const found = new Map();
  const layerRe = /<Layer\b[^>]*>([\s\S]*?)<\/Layer>/g;
  let layer;
  while ((layer = layerRe.exec(capabilitiesXml))) {
    const body = layer[1];
    const idMatch = body.match(/<ows:Identifier>([^<]+)<\/ows:Identifier>/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (!wanted.has(id)) continue;
    const hrefMatch = body.match(
      /<ows:Metadata[^>]*\bhref\s*=\s*(?:"([^"]*colormaps\/v1\.3\/[^"]*)"|'([^']*colormaps\/v1\.3\/[^']*)')/,
    );
    if (!hrefMatch) {
      throw new Error(`${id}: capabilities document has no v1.3 colour map link`);
    }
    const href = hrefMatch[1] ?? hrefMatch[2];
    const file = href.split("/").pop();
    const expected = wanted.get(id).colormap;
    if (file !== expected) {
      throw new Error(`${id}: capabilities points at ${file}, expected ${expected}`);
    }
    found.set(id, href);
  }
  for (const id of wanted.keys()) {
    if (!found.has(id)) throw new Error(`${id}: not present in the capabilities document`);
  }
  return found;
}

function renderModule(lookups, captured) {
  const lines = [];
  lines.push("/**");
  lines.push(" * GIBS colour maps — generated by scripts/refresh-gibs-colormaps.mjs.");
  lines.push(" *");
  lines.push(" * Each entry is the value table GIBS uses to paint a layer: for every");
  lines.push(" * palette index (ref) the physical quantity it stands for, as a range.");
  lines.push(" * A measurement reads the pixel's index and looks it up here.");
  lines.push(" *");
  lines.push(` * Captured from ${CAPABILITIES_URL} on ${captured}.`);
  lines.push(" *");
  lines.push(" * Do not edit by hand — run the script to regenerate.");
  lines.push(" */");
  lines.push("");
  lines.push("export interface GibsColormap {");
  lines.push("  /** Physical unit, as published by GIBS. */");
  lines.push("  units: string | null;");
  lines.push("  /** Palette indices, ascending. */");
  lines.push("  refs: number[];");
  lines.push("  /** Lower bound of the value range for each ref, parallel to refs. */");
  lines.push("  lows: number[];");
  lines.push("  /** Upper bound of the value range for each ref, parallel to refs. */");
  lines.push("  highs: number[];");
  lines.push("  /** Palette indices that mean \"no observation\". */");
  lines.push("  nodata: number[];");
  lines.push("  /**");
  lines.push("   * Palette indices GIBS renders as transparent — the raster carries a");
  lines.push("   * value but not an observation of the quantity the layer measures.");
  lines.push("   */");
  lines.push("  transparent: number[];");
  lines.push("}");
  lines.push("");
  lines.push("export const GIBS_COLORMAPS: Record<string, GibsColormap> = {");
  for (const [id, cm] of Object.entries(lookups)) {
    lines.push(`  ${JSON.stringify(id)}: {`);
    lines.push(`    units: ${JSON.stringify(cm.units)},`);
    lines.push(`    refs: ${JSON.stringify(cm.refs)},`);
    lines.push(`    lows: ${JSON.stringify(cm.lows)},`);
    lines.push(`    highs: ${JSON.stringify(cm.highs)},`);
    lines.push(`    nodata: ${JSON.stringify(cm.nodata)},`);
    lines.push(`    transparent: ${JSON.stringify(cm.transparent)},`);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");
  lines.push(`export const GIBS_COLORMAPS_CAPTURED = ${JSON.stringify(captured)};`);
  lines.push("");
  lines.push("/**");
  lines.push(" * Look up the value range for a palette index.");
  lines.push(" *");
  lines.push(" * Returns null for an index that is not in the table, that marks no");
  lines.push(" * observation, or that GIBS renders as transparent — the caller must");
  lines.push(" * treat that as missing data, never as zero.");
  lines.push(" */");
  lines.push("export function colormapRange(");
  lines.push("  colormap: GibsColormap,");
  lines.push("  index: number,");
  lines.push("): [number, number] | null {");
  lines.push("  if (colormap.nodata.includes(index)) return null;");
  lines.push("  if (colormap.transparent.includes(index)) return null;");
  lines.push("  const at = colormap.refs.indexOf(index);");
  lines.push("  if (at === -1) return null;");
  lines.push("  return [colormap.lows[at], colormap.highs[at]];");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const check = process.argv.includes("--check");
  const capabilitiesXml = await fetchText(CAPABILITIES_URL);
  const hrefs = await resolveFromCapabilities(capabilitiesXml);
  const lookups = {};
  for (const [id, href] of hrefs) {
    const spec = MEASURED_LAYERS.find((l) => l.id === id);
    const xml = await fetchText(href);
    const maps = parseColormap(xml);
    lookups[id] = buildLookup(maps, spec.units);
    console.log(
      `✓ ${id}: ${lookups[id].refs.length} value entries, ${lookups[id].nodata.length} nodata indices, units=${lookups[id].units}`,
    );
  }
  const captured = new Date().toISOString().split("T")[0];
  const rendered = renderModule(lookups, captured);
  if (check) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      current = "";
    }
    const same =
      current.replace(/\d{4}-\d{2}-\d{2}/g, captured) === rendered.replace(/\d{4}-\d{2}-\d{2}/g, captured);
    if (!same) {
      console.error("✗ vendored colour maps differ from upstream — run scripts/refresh-gibs-colormaps.mjs");
      process.exit(1);
    }
    console.log("✓ vendored colour maps match upstream");
    return;
  }
  writeFileSync(OUT, rendered);
  console.log(`✓ wrote ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
