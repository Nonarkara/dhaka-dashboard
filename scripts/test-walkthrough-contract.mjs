// The walkthrough contract.
//
// The Street level lens is the atlas's only eye-level surface, and it is
// the one place in the project where a building's height is drawn from a
// number nobody surveyed. That is allowed only under conditions, and this
// test holds the conditions in place:
//
//   1. The lens exists and is reachable from the lens picker.
//   2. Its camera is at eye level, and the map is allowed to tilt that far.
//   3. Its massing layer is hidden unless the lens asks for it, and it
//      draws the provider's render_height — never a "source height" the
//      tile does not carry.
//   4. The panel tells the reader how many buildings in view rest on that
//      provider number, in both languages.
//   5. The link out to the street scene carries the reader's own
//      coordinates, and the credit names the tool that draws it.
//
//   node scripts/test-walkthrough-contract.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');
const app = readFileSync('public/app.js', 'utf8');
const css = readFileSync('public/dhaka-design.css', 'utf8');
const dashboard = readFileSync('public/dashboard.js', 'utf8');

// ── 1. The lens is offered and described ──────────────────────────────────
assert.match(html, /<option value="walk">/, 'the lens picker must offer the Street level lens');
assert.match(app, /walk:\s*\{\s*\n?\s*title:\s*"Street level"/, 'the lens must carry a story title');
assert.match(app, /title_bn:\s*"রাস্তার ধরনে"/, 'the lens story must exist in Bengali');

// ── 2. The camera is at eye level ─────────────────────────────────────────
const viewports = app.match(/const LENS_VIEWPORTS = \{[\s\S]*?\n  \};/);
assert.ok(viewports, 'the lens camera table must exist');
const viewport = viewports[0].match(/\n\s*walk:\s*\{[^}]*\}/);
assert.ok(viewport, 'the walkthrough must have a camera viewport');
const pitch = Number(viewport[0].match(/pitch:\s*(\d+(?:\.\d+)?)/)?.[1]);
const zoom = Number(viewport[0].match(/zoom:\s*(\d+(?:\.\d+)?)/)?.[1]);
assert.ok(pitch >= 80, `the walkthrough camera must be at eye level, not ${pitch}°`);
assert.ok(zoom >= 17, `the walkthrough camera must be close to the ground, not zoom ${zoom}`);

// MapLibre caps the pitch at 85°. The map must be allowed to reach it.
const maxPitch = Number(app.match(/maxPitch:\s*(\d+(?:\.\d+)?)/)?.[1]);
assert.ok(maxPitch >= pitch, `the map's maxPitch (${maxPitch}) must allow the lens pitch (${pitch})`);

// ── 3. The massing is illustrative, provider-derived, and opt-in ──────────
const layer = app.match(/id:\s*"walk-massing"[\s\S]*?\n    \}\);/);
assert.ok(layer, 'the walkthrough must have its own massing layer');
assert.match(layer[0], /visibility:\s*"none"/, 'the massing layer must be hidden until the lens asks for it');
assert.match(layer[0], /"get",\s*"render_height"/, 'the massing must draw the provider height');
assert.match(layer[0], /"get",\s*"render_min_height"/, 'the massing must sit on the provider base');
assert.ok(
  !/"source_height/.test(layer[0]),
  'the massing must not read a source height the streamed tile does not carry',
);
assert.match(
  app,
  /map\.setLayoutProperty\("walk-massing",\s*"visibility",\s*lensId === "walk"/,
  'the massing layer must be shown by the walk lens and by no other',
);

// ── 4. The reader is told what the numbers are ───────────────────────────
assert.match(html, /id="atlas-walk-counts"/, 'the panel must carry the building count');
assert.match(html, /id="atlas-walk-note"/, 'the panel must carry the method note');
assert.match(html, /id="atlas-walk-legend-text"/, 'the panel must carry the massing legend');
assert.match(app, /carry a provider-computed height, not a survey/, 'the count must say the height is not surveyed');
assert.match(app, /মানচিত্র সরবরাহকারীর গণনা, জরিপ নয়/, 'the count must say so in Bengali too');
assert.match(app, /Illustrative massing/, 'the legend must name the massing as illustrative');

// The count must come from what the screen holds, not from a constant.
assert.match(app, /querySourceFeatures\(\s*"buildings"/, 'the count must be read from the map source');
// An empty feature list means the tiles have not arrived, not that the
// street has no buildings. A zero there would be a false reading.
assert.match(app, /counts\.total > 0/, 'the count must never print a zero it did not measure');
assert.match(app, /Building count unavailable\./, 'an unmeasured count must say so');
// Solid walls. A translucent block standing on a filled footprint
// double-draws the ground and turns the street into mud.
assert.match(layer[0], /"fill-extrusion-opacity":\s*1\b/, 'the street walls must be solid');
assert.match(layer[0], /buildingPaint\("render_height",\s*"render_min_height"\)/, 'the massing must reuse the atlas palette for colour');

// ── 5. The link out carries the reader's own coordinates and the credit ───
assert.match(app, /SCOUT_BASE\s*=\s*"https:\/\/tools\.oyasumi-gamedev\.com\/rokehan\/"/, 'the street scene link must be well formed');
const url = app.match(/function streetScoutUrl[\s\S]*?\n  \}/);
assert.ok(url, 'the street scene link must be built from the map centre');
assert.match(url[0], /map\.getCenter\(\)/, 'the link must carry the reader\'s own coordinates');
assert.match(url[0], /ll:/, 'the link must carry the coordinates');
assert.match(url[0], /tod:/, 'the link must carry a time of day');
assert.match(url[0], /far:/, 'the link must carry a surroundings distance');
assert.match(url[0], /n:/, 'the link must carry the place name');
assert.match(html, /rel="noopener noreferrer"/, 'the link must open safely');
assert.match(html, /target="_blank"/, 'the link must not navigate the atlas away');
assert.match(app, /Location Scout \(oyasumi-gamedev\.com\)/, 'the credit must name the street scene tool');
assert.match(app, /OpenStreetMap \/ OpenFreeMap/, 'the credit must name the map sources');

// The atlas must not carry the tool's code. A link is use; a copy is not.
assert.ok(!/rokehan/i.test(app.replace(/rokehan\//g, '')), 'no tool code may be vendored into the atlas');

// ── 6. The panel must not be on screen in any other lens ─────────────────
assert.match(app, /panel\.hidden = !isWalk/, 'the panel must be hidden outside the walk lens');
assert.match(css, /\.atlas-walk\[hidden\]\s*\{\s*display:none/, 'the hidden panel must really be hidden');

// ── 7. The transit desk reads the registry, not a copied table ────────────
assert.match(html, /id="transit-registry"/, 'the transit desk must be rendered into a container');
assert.ok(
  !/16 Stations/.test(html),
  'the transit desk must not carry a hand-written station count; the registry holds the number',
);
assert.match(dashboard, /fetch\('\/api\/dhaka\/transit'\)/, 'the transit desk must read the network registry');
assert.match(dashboard, /metro_station/, 'the transit desk must count the stations from the registry');

console.log('✓ Walkthrough: eye-level lens, opt-in illustrative massing, counted provider heights, credited link, registry-driven transit desk');
