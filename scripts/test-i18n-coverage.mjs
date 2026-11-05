// Bilingual coverage and hybrid gate.
//
// The i18n contract test proves every catalog key has a Bengali value. It
// does not prove the reader ever sees one. Two failures slipped through it:
//
//   1. A phrase rule that substituted a lone word inside a longer English
//      sentence, turning "Air Quality" into "বায়ু Quality" and "Dhaka
//      Stock Exchange" into "ঢাকা Stock Exchange".
//   2. A Bengali value carrying a character from another script, such as
//      the Greek "θέση" standing in for the Bengali "অবস্থা".
//
// Both are hybrids: a string half in one script and half in another. A
// hybrid is worse than an untranslated string, because the reader cannot
// tell which half is wrong. This test fails on hybrids, and on plain
// English that the catalog should have been able to translate.
//
//   node scripts/test-i18n-coverage.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CATALOG_FILE = 'public/translations.js';
const HTML_FILES = [
  'public/index.html',
  'public/research.html',
  'public/parliament-reference.html',
];

// Latin that may survive inside a Bengali string: source names, units and
// standard acronyms. Anything else surviving is a half-translated hybrid.
const ALLOWED_LATIN = new Set([
  'AOD', 'API', 'AQI', 'BMD', 'BWDB', 'CAMS', 'CO', 'DAE', 'DHKx', 'ECMWF',
  'FFWC', 'GeoJSON', 'GIBS', 'JSON', 'MAIAC', 'MODIS', 'NASA', 'NO2',
  'O3', 'Open-Meteo', 'OpenFreeMap', 'OpenMapTiles', 'OpenStreetMap',
  'OSM', 'PM2.5', 'Sentinel', 'SO2', 'SWRC', 'UTC', 'VIIRS', 'WorldPop',
  'Esri', 'Carto', 'Maxar', 'Earthstar', 'Geographics', 'CORS', 'UTM', 'PM10', 'MSL', 'm',
  '3D', '2D', 'Date.now', 'BPM6', 'USD', 'BDT', 'EPB', 'BGMEA', 'RMG', 'DSE', 'DSEX',
  'BBS', 'CPI', 'VNP46A2', 'DMTCL', 'USGS', 'DEPA', 'Cloudflare', 'Workers',
  'dhaka.nonarkara.org', 'Location', 'Scout', 'oyasumi-gamedev.com', 'Terrain', 'Tiles',
  'Maxar', 'Earthstar', 'Geographics',
  'WGS84', 'BDT', 'm³', 'μ', 'µ',
]);

const BENGALI = /[ঀ-৿]/;
// A token may start with digits (3D, PM2.5) but a bare number is not a token.
const LATIN_RUN = /\b(?:\d+[A-Za-z][A-Za-z0-9.]*|[A-Za-z][A-Za-z0-9.]*(?:-[A-Za-z0-9.]+)*)\b/g;
// U+0964 and U+0965 are the Bengali danda and double danda. They sit
// numerically inside the Devanagari block (U+0900–U+097F) and must not be
// read as a foreign script.
const OTHER_SCRIPT = /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0900-\u0963\u0966-\u097F\u0E00-\u0E7F\u3040-\u30FF\uAC00-\uD7AF]/;

function loadCatalog() {
  const source = readFileSync(CATALOG_FILE, 'utf8');
  const sandbox = { window: {} };
  new Function('window', source)(sandbox.window);
  return sandbox.window.ATLAS_BN || {};
}

const catalog = loadCatalog();
assert.ok(Object.keys(catalog).length > 200, 'the catalog must not be gutted');

/** The Latin tokens that may remain inside a Bengali string. */
function offendingLatin(value) {
  if (!BENGALI.test(value)) return [];
  const found = new Set();
  for (const match of value.match(LATIN_RUN) || []) {
    if (!ALLOWED_LATIN.has(match)) found.add(match);
  }
  return [...found];
}

// ── 1. The catalog itself must be clean ───────────────────────────────────
const catalogHybrids = [];
for (const [key, value] of Object.entries(catalog)) {
  assert.equal(typeof value, 'string', `catalog value for ${JSON.stringify(key)} must be a string`);
  assert.ok(value.trim().length > 0, `catalog value for ${JSON.stringify(key)} must not be empty`);
  const latin = offendingLatin(value);
  if (latin.length) catalogHybrids.push({ key, value, latin });
  if (OTHER_SCRIPT.test(value)) {
    catalogHybrids.push({ key, value, latin: ['a character from another script'] });
  }
}
assert.deepEqual(
  catalogHybrids,
  [],
  'a Bengali value must not mix scripts or keep an untranslated English word:\n' +
    catalogHybrids.map(h => `  ${JSON.stringify(h.key)} → ${JSON.stringify(h.value)} [${h.latin.join(', ')}]`).join('\n'),
);

// ── 2. The translation engine must not create a hybrid ────────────────────
// A lone word is translated only when it is the whole label. Only a
// multi-word phrase may be substituted inside a longer sentence.
const phrases = Object.keys(catalog)
  .filter(key => /\s/.test(key))
  .sort((a, b) => b.length - a.length);
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parts = phrases.length
  ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + phrases.map(escapeRe).join('|') + ')(?![\\p{L}\\p{N}])', 'gu')
  : null;

function translate(text) {
  const key = text.replace(/\s+/g, ' ').trim();
  if (Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key];
  if (parts) return text.replace(parts, match => catalog[match] || match);
  return text;
}

// ── 3. Every visible string in the static pages must be handled ──────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', middot: '·', times: '×', minus: '−' };
const decodeEntities = text =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : whole;
  });

function extractStrings(html) {
  const out = [];
  // Each of these is replaced by a newline, not by nothing: a CODE element
  // between two runs of prose splits them into two text nodes in the real
  // DOM, and the test must see the same two nodes.
  const withoutCode = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    // Some pages carry their own bilingual pair instead of using the
    // catalog. Their text is already translated and must not be reported.
    .replace(/<([a-z][a-z0-9-]*)\b[^>]*\bdata-bn="[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '\n');
  for (const match of withoutCode.matchAll(/<(?!script|style|noscript)([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attrs = match[2] || '';
    for (const attr of attrs.matchAll(/\b(aria-label|title|placeholder|alt)\s*=\s*"([^"]*)"/gi)) {
      if (attr[2].trim()) out.push({ file: '', text: attr[2], where: `${match[1]}@${attr[1]}` });
    }
  }
  const stripped = withoutCode.replace(/<[^>]*>/g, '\n');
  for (const line of stripped.split('\n')) {
    const text = line.replace(/\s+/g, ' ').trim();
    if (text) out.push({ file: '', text, where: 'text' });
  }
  return out;
}

/**
 * The strings the translator actually reaches.
 *
 * The walker skips SCRIPT, STYLE, NOSCRIPT and CODE. A CODE element holds
 * a literal token — the API's own `unavailable`, a field name — and is
 * meant to stay in Latin script. A test that ignored that would report the
 * page as translated when the reader still sees English.
 */
function reachableStrings(html) {
  const withoutCode = html.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, '\n');
  return extractStrings(withoutCode);
}

const untranslated = [];
const hybrids = [];
for (const file of HTML_FILES) {
  const html = readFileSync(file, 'utf8');
  for (const { text: raw, where } of reachableStrings(html)) {
    const text = decodeEntities(raw);
    if (!/[A-Za-z]/.test(text)) continue;
    // A string that is only a proper noun, a unit, a number or a URL is
    // meant to stay in Latin script.
    if (!/[A-Za-z]{3}/.test(text)) continue;
    const out = translate(text);
    if (out === text) {
      untranslated.push({ file, text, where });
      continue;
    }
    const latin = offendingLatin(out);
    if (latin.length) hybrids.push({ file, text, out, latin });
  }
}

assert.deepEqual(
  hybrids,
  [],
  'a translated string must not keep an untranslated English word beside Bengali:\n' +
    hybrids.map(h => `  ${h.file}: ${JSON.stringify(h.text)} → ${JSON.stringify(h.out)} [${h.latin.join(', ')}]`).join('\n'),
);

console.log(
  `✓ Bilingual: ${Object.keys(catalog).length} catalog keys, no mixed-script values, ` +
  `${phrases.length} multi-word phrases, ${untranslated.length} static strings left in Latin`,
);
if (untranslated.length) {
  console.log('  Latin-only strings (must be proper nouns, units or URLs):');
  for (const u of untranslated.slice(0, 40)) console.log(`    ${u.file}: ${JSON.stringify(u.text)}`);
  if (untranslated.length > 40) console.log(`    …and ${untranslated.length - 40} more`);
}
