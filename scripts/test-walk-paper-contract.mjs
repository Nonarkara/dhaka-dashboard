/**
 * The walkthrough and the research paper.
 *
 * Two things are checked here, both of which are easy to break silently:
 *
 *  1. Preserve the map exploration module and its qualifications. Actual
 *     input/lifecycle/projection behavior is exercised by test-walk-behavior.
 *
 *  2. The paper is published in Bengali and English together. A page that
 *     says `<html lang="bn">` and then reads as English only is a parity
 *     failure, and it is invisible to anyone reading the other language.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const walk = readFileSync("public/walk.js", "utf8");
const app = readFileSync("public/app.js", "utf8");
const research = readFileSync("public/research.html", "utf8");
const index = readFileSync("public/index.html", "utf8");
const style = readFileSync("public/style.css", "utf8");
const i18n = readFileSync("public/i18n.js", "utf8");
const instruments = readFileSync("public/instruments.js", "utf8");

let checks = 0;
const ok = (label, fn) => { fn(); checks++; };

// ── The walk module exists and is loaded ────────────────────────────────────
ok("the walkthrough is loaded by the atlas", () => {
  assert.ok(index.includes('src="/walk.js'), "walk.js is not loaded");
  assert.ok(app.includes("AtlasWalk?.activate"), "the lens switcher does not tell the walk which lens is active");
  assert.ok(app.includes("AtlasWalk?.attach"), "the walk is never given the map");
});

// ── The walk owns its camera ───────────────────────────────────────────────
ok("the walk lens is not overridden by the lens viewport", () => {
  // A street-level viewpoint is a function of the zoom and the window, so a
  // fixed viewport would undo it.
  assert.ok(
    /!\["air",\s*"rivers",\s*"walk"\]/.test(app),
    "the lens viewport still overrides the walk camera",
  );
});

// ── The walk states its own limits ─────────────────────────────────────────
ok("the walk panel states the limits of what it measures", () => {
  // Unknown height remains unavailable; the map qualification stays visible.
  assert.ok(index.includes("atlas-walk-legend-text"), "the massing caveat is gone from the panel");
  assert.ok(index.includes("atlas-walk-note"), "the massing note is gone from the panel");
  assert.ok(index.includes("atlas-walk-credit"), "the credit line is gone from the panel");
  // The credit must name the tool it leans on.
  assert.ok(index.includes("oyasumi-gamedev.com"), "the street-scene credit is gone");
  assert.ok(index.includes("OpenStreetMap"), "the map data credit is gone");
});

// ── The camera height is computed, not asserted ────────────────────────────
ok("the model camera estimate is qualified", () => {
  assert.ok(walk.includes("cameraHeightM"), "the camera height is not computed");
  assert.ok(walk.includes("getCanvas().clientHeight"), "the camera height ignores the window");
  assert.ok(walk.includes("getPitch()"), "the camera height ignores the pitch");
  assert.ok(walk.includes("getZoom()"), "the camera height ignores the zoom");
  assert.ok(walk.includes("Model camera") && walk.includes("estimate unavailable"), "model estimate and refusal must both be named");
  // The model estimate is shown to the reader rather than kept internal.
  assert.ok(index.includes("atlas-walk-status"), "the camera height is not shown");
  assert.ok(walk.includes("atlas-walk-status"), "the camera height is not written to the panel");
});

// ── The walk is over a flat plane, and says so ─────────────────────────────
ok("the walk says it moves over the map plane, not a surveyed terrain", () => {
  // The reader sees this in the panel, so the panel is where it must be.
  const ground = index.match(/id="atlas-walk-ground"[^>]*>([^<]*)</);
  assert.ok(ground, "the walk panel has no statement about its ground");
  assert.ok(/flat plane/.test(ground[1]),
    `the walk panel does not say the ground is the map's flat plane: ${ground[1]}`);
  assert.ok(/no elevation model/.test(ground[1]),
    "the walk panel does not say the atlas carries no elevation model");
  assert.ok(/not a walking route/.test(ground[1]),
    "the walk panel does not say the viewpoints are not a walking route");
  assert.ok(/do not establish street access/.test(ground[1]),
    "the walk panel does not say the viewpoints establish no street access");
  // And the module must be honest about where its camera numbers come from.
  assert.ok(/projection-model estimates, not surveyed/.test(walk),
    "the walk module does not mark its camera values as estimates");
});

// ── The itinerary is authored and every stop is a real district ────────────
ok("the itinerary names districts the atlas actually measures", () => {
  const areas = JSON.parse(readFileSync("public/dhaka-areas.json", "utf8"));
  const ids = new Set(areas.map(a => a.id));
  const route = [...walk.matchAll(/id:\s*'([a-z-]+)',\s*bearing:/g)].map(m => m[1]);
  assert.ok(route.length >= 4, `the itinerary has only ${route.length} stops`);
  for (const id of route) {
    assert.ok(ids.has(id), `the itinerary names ${id}, which is not an atlas district`);
  }
  // Every stop must carry both languages, because the panel is bilingual.
  const notes = [...walk.matchAll(/note:\s*'([^']*)',\s*note_bn:\s*'([^']*)'/g)];
  assert.equal(notes.length, route.length, "a stop is missing one of its two languages");
  for (const [, en, bn] of notes) {
    assert.ok(en.length > 0 && bn.length > 0, "a stop has an empty note");
    assert.ok(/[ঀ-৿]/.test(bn), `the Bengali note for "${en}" has no Bengali characters`);
  }
});

// ── The movement controls are stated ───────────────────────────────────────
ok("the walk tells the reader how to move", () => {
  assert.ok(index.includes("atlas-walk-keys"), "the controls are not stated in the panel");
  assert.ok(walk.includes("atlas-walk-keys"), "the controls are never written");
  for (const key of ["'w'", "'a'", "'s'", "'d'"]) {
    assert.ok(walk.includes(key), `the ${key} control is not handled`);
  }
  assert.ok(walk.includes("arrowleft") && walk.includes("arrowright"),
    "the turning controls are not handled");
});

// ── The walk must not steal the keyboard from a form ──────────────────────
ok("the walk leaves the keyboard alone while a field is focused", () => {
  assert.ok(walk.includes("INPUT|SELECT|TEXTAREA") || walk.includes("^(INPUT|SELECT|TEXTAREA)$"),
    "the walk does not check what has focus");
  assert.ok(walk.includes("isContentEditable"), "the walk does not respect a contenteditable field");
});

// ── The header must carry the instrument band ───────────────────────────────
// The band was removed from the header on the premise that it was "empty,
// wasted chrome". It was empty only because its markup had gone, while its
// renderer and its stylesheet stayed: the readings were alive and unreachable.
// The whole path is checked, so neither half can go again.
ok("the header carries the instrument band, and the band is wired to it", () => {
  const header = index.match(/<header class="atlas-header">([\s\S]*?)<\/header>/);
  assert.ok(header, "the atlas has no header");
  assert.ok(/id="atlas-instruments"/.test(header[1]),
    "the header has no instrument band: the country's clock, the live rate and the national readings are gone from the top bar");
  assert.ok(instruments.includes("#atlas-instruments"),
    "the instruments module no longer looks for the band");
  assert.ok(index.includes('src="/instruments.js'), "the instruments module is not loaded");

  // The band's own list of readings, most important first.
  const list = instruments.match(/const BAND = \[([\s\S]*?)\n {2}\];/);
  assert.ok(list, "the instruments module has no band list");
  const slots = [...list[1].matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(slots.length >= 4, `the band lists only ${slots.length} readings`);

  // The width at which each reading is dropped. Each rule is one line, so the
  // width is read from the same line that names the slot rather than from a
  // window that might reach into the next rule.
  const widthFor = (slot) => {
    for (const line of style.split('\n')) {
      const m = line.match(/@media\s*\(max-width:\s*(\d+)px\)/);
      if (m && line.includes(`[data-slot="${slot}"]`)) return Number(m[1]);
    }
    return null;
  };

  for (const slot of slots) {
    assert.ok(widthFor(slot) !== null,
      `the band has no rule that drops the ${slot} reading when the width runs out`);
  }

  // The order matters as much as the presence: the reading listed first is
  // the one that must survive longest, so each drop happens at a narrower
  // width than the one before it. The live rate goes last, because a number
  // that changes while you watch is worth more room than one that has not
  // moved in a year.
  const widths = slots.map(widthFor);
  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] > widths[i - 1],
      `the ${slots[i]} reading is dropped at ${widths[i]}px, which is not narrower than the ${slots[i - 1]} reading at ${widths[i - 1]}px`);
  }

  // The clock is the one reading that is never dropped.
  const clockDropped = style.split('\n').some((line) =>
    /@media/.test(line) && /instrument-clock/.test(line));
  assert.ok(!clockDropped, "there is a rule that drops the country's clock");

  // The band must not carry data nothing reads: an attribute written into
  // the DOM and never consumed is a claim the interface does not keep.
  assert.ok(!/data-from/.test(instruments) && !/dataset\.from/.test(instruments),
    "the band still writes a from attribute that nothing reads");
  assert.ok(!/data-from/.test(style), "the stylesheet still keys off a data-from attribute");
});

ok("the band does not claim a reading is permanent when the width drops it", () => {
  // The code said the clock and the rate "are never dropped" while the
  // stylesheet dropped the rate at 559px. A comment that disagrees with the
  // cascade is a lie a future editor will believe.
  const doc = instruments.slice(0, instruments.indexOf("const BAND = ["));
  // The comment sits above the list, so the slice starts before it.
  const bandStart = instruments.lastIndexOf("/**", instruments.indexOf("const BAND = ["));
  const bandDoc = instruments.slice(bandStart, instruments.indexOf("const BAND = [") + 400);

  // Every sentence that claims something is never dropped must be talking
  // about the clock and nothing else.
  const claims = bandDoc.split(/[.\n]/).map((s) => s.trim()).filter((s) => /never dropped/.test(s));
  assert.ok(claims.length > 0, "the band does not say which reading is never dropped");
  for (const claim of claims) {
    assert.ok(/clock/i.test(claim),
      `the band claims something other than the clock is never dropped: "${claim}"`);
    assert.ok(!/rate|exchange/i.test(claim),
      `the band claims the rate is never dropped: "${claim}"`);
  }

  // And the module header must not carry the old claim either.
  assert.ok(!/clock and the rate are the two/.test(doc),
    "the module header still claims the rate is never dropped");
});

ok("the language control moves into the Map menu on a phone", () => {
  assert.ok(/id="language-toggle-menu"/.test(index),
    "the Map menu has no language control, so a phone header cannot give up the room for the band");
  const menu = index.match(/id="atlas-menu"[\s\S]*?<\/details>/);
  assert.ok(menu && /language-toggle-menu/.test(menu[0]),
    "the menu's language control is not inside the menu");
  assert.ok(/atlas-desktop-only/.test(index),
    "the header's language control is not marked desktop-only");
  // The menu's control must actually be wired to the switch — not merely
  // present in the markup.
  assert.ok(/getElementById\('language-toggle-menu'\)\?\.addEventListener/.test(i18n),
    "the menu's language control is not wired to the language switch");
});
ok("the research paper carries both languages for every block", () => {
  const en = (research.match(/data-en=/g) || []).length;
  const bn = (research.match(/data-bn=/g) || []).length;
  assert.ok(en > 40, `the paper has only ${en} translatable blocks`);
  assert.equal(en, bn, "a block carries one language but not the other");
  // Every Bengali block must actually contain Bengali.
  const pairs = [...research.matchAll(/data-en="([^"]*)"[^>]*data-bn="([^"]*)"/g)];
  assert.ok(pairs.length > 40, "the paper's bilingual pairs did not parse");
  for (const [, enText, bnText] of pairs) {
    assert.ok(enText.trim().length > 0, "an English block is empty");
    assert.ok(bnText.trim().length > 0, "a Bengali block is empty");
    assert.ok(/[ঀ-৿]/.test(bnText), `the Bengali text for "${enText.slice(0, 40)}" has no Bengali characters`);
  }
});

// ── The paper describes the architecture it claims to ──────────────────────
ok("the paper describes the system that is actually deployed", () => {
  const facts = [
    ["NASA GIBS", "the satellite source is not named"],
    ["colour map", "the measurement chain is not described"],
    ["provenance", "the provenance tiers are not described"],
    ["unavailable", "the refusal contract is not described"],
  ];
  for (const [needle, why] of facts) {
    assert.ok(research.includes(needle), why);
  }
  // The route table must list all seven domains.
  for (const domain of ["Environment", "Energy", "Economy", "Mobility", "People", "Smart living", "Governance"]) {
    assert.ok(research.includes(`>${domain}<`) || research.includes(`${domain}</td>`),
      `the paper does not cover the ${domain} domain`);
  }
});

// ── The paper's diagram obeys the geometry rules ───────────────────────────
ok("the architecture diagram has no rounded corners, shadows or gradients", () => {
  const svg = research.match(/<svg[\s\S]*?<\/svg>/);
  assert.ok(svg, "the paper has no architecture diagram");
  const markup = svg[0];
  assert.ok(!/rx\s*=\s*["']?\d/.test(markup), "the diagram rounds a corner");
  assert.ok(!/filter\s*=/.test(markup), "the diagram uses a filter");
  assert.ok(!/url\(#|linearGradient|radialGradient/i.test(markup), "the diagram uses a gradient");
  // One colour block per plane.
  const blocks = [...markup.matchAll(/<rect[^>]*fill="(#[0-9a-f]{6})"/g)].map(m => m[1]);
  assert.equal(blocks.length, 5, `the diagram has ${blocks.length} colour blocks, expected one per plane`);
  assert.equal(new Set(blocks).size, 5, "two planes share a colour");
});

// ── The paper must be reachable from the atlas ─────────────────────────────
ok("the atlas links to the paper", () => {
  assert.ok(index.includes('href="/research"'), "the atlas does not link to the research paper");
});

// ── The paper does not depend on the phrase catalogue ─────────────────────
ok("the paper renders its own translations", () => {
  // The phrase catalogue substitutes inside sentences, which would fight the
  // explicit pairs on a page of long arguments.
  assert.ok(!research.includes("i18n.js"), "the paper still loads the phrase catalogue");
  assert.ok(research.includes("data-en"), "the paper has no bilingual pairs to swap");
  assert.ok(research.includes("atlas:language"), "the paper does not follow the atlas's language");
});

// ── The paper's counts must match the system it describes ──────────────────
// A number in the paper is a claim about the code. Each count below is
// derived from the source it describes, then the paper's own words — in
// both languages — and the diagram's digits are held to it. This is the
// check that would have caught "seventeen lenses" over a fifteen-lens
// atlas and "fifteen test suites" over twenty-four.
/** The number as Bengali digits, grouped as the paper groups it. */
const bnDigits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  .replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[d]);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const collageSrc = readFileSync("src/collage.ts", "utf8");
const satelliteSrc = readFileSync("src/satellite.ts", "utf8");

const EN_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
// 0-30 covers every count this paper states. Extend it when a count passes 30.
const BN_NUM = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ",
  "বিশ", "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ",
  "ঊনত্রিশ", "ত্রিশ"];

const enNumber = (word) => {
  let n = 0;
  for (const part of word.toLowerCase().split("-")) {
    if (!(part in EN_NUM)) return NaN;
    n += EN_NUM[part];
  }
  return n;
};

/** Every English statement of `phrase` anywhere in the paper, attribute or body. */
const enClaims = (phrase) =>
  [...research.matchAll(new RegExp(`\\b([a-z-]+) ${phrase}`, "gi"))].map((m) => ({
    word: m[1], n: enNumber(m[1]),
  }));

/** The bilingual pair whose English carries `needle`. */
const pairFor = (needle) => {
  const hit = [...research.matchAll(/data-en="([^"]*)"[^>]*data-bn="([^"]*)"/g)]
    .find(([, en]) => en.includes(needle));
  assert.ok(hit, `no bilingual pair mentions "${needle}"`);
  return { en: hit[1], bn: hit[2] };
};

const assertEnClaims = (phrase, expected) => {
  const claims = enClaims(phrase);
  assert.ok(claims.length > 0, `the paper no longer states a count before "${phrase}"`);
  for (const c of claims) {
    assert.equal(c.n, expected,
      `the paper says "${c.word} ${phrase}" but the code says ${expected}`);
  }
};

/**
 * Bengali has interchangeable spellings for some numerals — আটাশ and আঠাশ
 * are both twenty-eight — so the comparison folds the letters that writers
 * vary before it looks. The check is about the number being claimed, not
 * about one spelling of it.
 */
const bnFold = (text) => text.replace(/\u09a0/g, "\u099f");

const assertBnClaim = (pair, phraseBn, expected) => {
  assert.ok(BN_NUM[expected] !== undefined,
    `extend BN_NUM in this test: the count is now ${expected}`);
  const want = bnFold(`${BN_NUM[expected]}টি ${phraseBn}`);
  assert.ok(bnFold(pair.bn).includes(want),
    `the Bengali twin says "${pair.bn.slice(0, 70)}…" — expected "${want}"`);
};

ok("the paper's lens count matches the atlas", () => {
  const story = app.match(/const LENS_STORIES = \{([\s\S]*?)\n {2}\};/);
  assert.ok(story, "LENS_STORIES did not parse");
  const lenses = [...story[1].matchAll(/^[ \t]{4}(?:"([^"]+)"|([a-z][a-z0-9-]*)): \{/gm)]
    .map((m) => m[1] || m[2]);
  assert.ok(lenses.length > 0, "no lens stories parsed");

  // The menu offers exactly those lenses, no more, no fewer.
  const menu = index.match(/<select id="atlas-lens"[\s\S]*?<\/select>/);
  assert.ok(menu, "the atlas has no lens select");
  const offered = [...menu[0].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...offered].sort(), [...lenses].sort(),
    "the lens menu and LENS_STORIES disagree");

  // The paper states the count in words, in both languages, everywhere it
  // states it — and the diagram states it in digits.
  assertEnClaims("map lenses", lenses.length);
  assertBnClaim(pairFor("map lenses"), "মানচিত্র লেন্স", lenses.length);
  assert.ok(research.includes(`>${lenses.length} lenses</text>`),
    `the diagram does not say "${lenses.length} lenses"`);
});

ok("the paper's route count matches the Worker", () => {
  const worker = readFileSync("src/index.ts", "utf8");
  const routes = [...worker.matchAll(/url\.pathname\s*===\s*"([^"]+)"/g)].map(m => m[1]);
  assert.ok(routes.length > 0, "no routes parsed from the Worker");
  // The count is of distinct routes, not of the places they are matched.
  const distinct = new Set(routes);
  assert.equal(distinct.size, routes.length, "a route is matched twice in the Worker");
  assertEnClaims("routes on a single Worker", distinct.size);
  assertBnClaim(pairFor("routes on a single Worker"), "রুট", distinct.size);
});

ok("the paper's test-suite count matches the release gate", () => {
  const suites = pkg.scripts.test.match(/scripts\/test-[\w-]+\.mjs/g) || [];
  assert.ok(suites.length > 0, "the test script names no suites");
  assertEnClaims("test suites", suites.length);
  assertBnClaim(pairFor("test suites run on every release"), "পরীক্ষা-স্যুট", suites.length);
});

ok("the paper's GIBS instrument count matches the collage", () => {
  const signals = collageSrc.match(/const DOMAIN_SIGNALS[^=]*= \{([\s\S]*?)\n\};/);
  assert.ok(signals, "DOMAIN_SIGNALS did not parse");
  const instruments = [...signals[1].matchAll(/\[\s*"([^"]+)"\s*\]/g)].map((m) => m[1]);
  assert.ok(instruments.length > 0, "no collage instruments parsed");

  // An instrument counts as "from NASA GIBS" only when satellite.ts actually
  // serves it from GIBS — NASA POWER is a model point, not a GIBS layer.
  const fromGibs = instruments.filter((id) => {
    const at = satelliteSrc.indexOf(`id: "${id}"`);
    return at >= 0 && /provider: "NASA GIBS/.test(satelliteSrc.slice(at, at + 600));
  });

  assertEnClaims("satellite instruments from NASA GIBS", fromGibs.length);
  assertBnClaim(pairFor("satellite instruments from NASA GIBS"), "উপগ্রহ যন্ত্র", fromGibs.length);

  // The diagram states the same count in digits, and it counts only the GIBS
  // layers. NASA POWER is a reanalysis model, not a satellite instrument, so
  // it is named separately in the block rather than folded into the number.
  assert.ok(research.includes(`>${fromGibs.length} satellite instruments</text>`),
    `the diagram does not say "${fromGibs.length} satellite instruments"`);
  assert.ok(research.includes("+ 1 climate reanalysis</text>"),
    "the diagram does not name the reanalysis model separately from the satellites");
});

ok("the paper's published-layer count matches the vendored catalogue", () => {
  // The catalogue is refreshed from NASA's capabilities document, so its
  // layer count moves whenever GIBS publishes more. The paper's number must
  // move with it, in both languages, or it is a stale claim about a source.
  const catalogue = JSON.parse(readFileSync("scripts/fixtures/gibs-catalogue.json", "utf8"));
  const layers = catalogue.layerCount;
  assert.ok(Number.isInteger(layers) && layers > 0, "the catalogue has no layer count");

  // English, in the attribute and in the body.
  const en = `(${layers.toLocaleString("en-GB")} published layers, no key)`;
  const enSites = (research.match(new RegExp(en.replace(/[()]/g, "\\$&"), "g")) || []).length;
  assert.ok(enSites > 0,
    `the paper does not state the catalogue's ${layers.toLocaleString("en-GB")} published layers`);
  assert.ok(enSites >= 2,
    "the paper states the layer count in only one of its two English places");

  // Bengali, in the same sentence.
  const bn = `(প্রকাশিত ${bnDigits(layers)} স্তর`;
  assert.ok(research.includes(bn),
    `the paper's Bengali twin does not state ${bnDigits(layers)} layers`);

  // And no other layer count may be claimed anywhere in the paper.
  const claims = [...research.matchAll(/\(([0-9][0-9,]{2,}) published layers/g)].map((m) => m[1]);
  for (const c of claims) {
    assert.equal(c.replace(/,/g, ""), String(layers),
      `the paper claims ${c} published layers but the catalogue holds ${layers}`);
  }
});

ok("the paper's collage counts match the code", () => {
  const signals = collageSrc.match(/const DOMAIN_SIGNALS[^=]*= \{([\s\S]*?)\n\};/);
  assert.ok(signals, "DOMAIN_SIGNALS did not parse");
  const domains = [...signals[1].matchAll(/^[ \t]{2}(?:"([^"]+)"|([a-z][a-z0-9-]*)):[ \t]*\[/gm)]
    .map((m) => m[1] || m[2]);
  const instruments = [...signals[1].matchAll(/\[\s*"([^"]+)"\s*\]/g)].map((m) => m[1]);

  const claims = [...research.matchAll(/\b([a-z-]+) domains and ([a-z-]+) instruments/gi)];
  assert.ok(claims.length > 0, "the paper no longer states the collage's domain count");
  for (const c of claims) {
    assert.equal(enNumber(c[1]), domains.length,
      `the paper says "${c[1]} domains" but DOMAIN_SIGNALS has ${domains.length}`);
    assert.equal(enNumber(c[2]), instruments.length,
      `the paper says "${c[2]} instruments" but the collage measures ${instruments.length}`);
  }

  assert.ok(BN_NUM[domains.length] !== undefined && BN_NUM[instruments.length] !== undefined,
    `extend BN_NUM: domains=${domains.length}, instruments=${instruments.length}`);
  const want = `${BN_NUM[domains.length]}টি ক্ষেত্র ও ${BN_NUM[instruments.length]}টি যন্ত্র`;
  const pair = pairFor("side by side for one district");
  assert.ok(pair.bn.includes(want), `the Bengali twin does not say "${want}"`);
});

ok("the paper's population figure is the one the atlas measures", () => {
  // The abstract used to say "23 million people" — a headcount the atlas does
  // not measure and cannot source. The figure it prints now is the sum of the
  // published WorldPop grid this atlas serves, so it is derived here from
  // that grid rather than trusted.
  const grid = JSON.parse(readFileSync("public/data/people-grid.json", "utf8"));
  const column = grid.columns.indexOf("population");
  assert.ok(column > 0, "the published population grid has no population column");
  const values = grid.cells.map((c) => c[column]).filter((v) => typeof v === "number");
  assert.ok(values.length > 0, "the published population grid carries no counts");
  const total = values.reduce((a, b) => a + b, 0);
  const millions = (total / 1e6).toFixed(1);
  assert.equal(Number(millions) * 1e6 > 1e6, true, "the grid does not hold a city's worth of people");

  // English, in the attribute and in the body.
  const en = `about ${millions} million people`;
  assert.ok(research.includes(en),
    `the paper does not state the grid's ${millions} million people`);
  assert.ok((research.match(new RegExp(en.replace(/[.]/g, "\\."), "g")) || []).length >= 2,
    "the paper states the population in only one of its two English places");

  // Bengali, in the same sentence.
  const bn = `প্রায় ${bnDigits(Number(millions))} মিলিয়ন মানুষ`;
  assert.ok(research.includes(bn),
    `the paper's Bengali twin does not state ${bnDigits(Number(millions))} million people`);

  // No other population headcount may be claimed anywhere in the paper.
  const claims = [...research.matchAll(/([0-9]+(?:\.[0-9]+)?) million people/g)].map((m) => m[1]);
  for (const c of claims) {
    assert.equal(c, millions,
      `the paper claims ${c} million people but the published grid holds ${millions} million`);
  }
});

ok("the paper's places, freshness windows and cadence match the Worker", () => {
  const areas = JSON.parse(readFileSync("public/dhaka-areas.json", "utf8"));
  const snapshots = readFileSync("src/snapshots.ts", "utf8");
  const worker = readFileSync("src/index.ts", "utf8");

  // The places the collage measures over.
  assertEnClaims("places carry all seven instruments", areas.length);
  assertBnClaim(pairFor("places carry all seven instruments"), "জায়গা", areas.length);

  // The freshness window and the point at which a snapshot stops being
  // served, read from the snapshot policy rather than from the prose.
  const fresh = snapshots.match(/const FRESH_MS = (\d+) \* 3600000/);
  const maxAge = snapshots.match(/const MAX_AGE_MS = (\d+) \* 86400000/);
  assert.ok(fresh && maxAge, "the snapshot policy does not state its windows");
  assertEnClaims("hours is fresh", Number(fresh[1]));
  assertEnClaims("days it is not served at all", Number(maxAge[1]));
  const freshPair = pairFor("hours is fresh");
  assert.ok(freshPair.bn.includes(`${BN_NUM[Number(fresh[1])]} ঘণ্টার`),
    `the Bengali twin does not say ${BN_NUM[Number(fresh[1])]} hours`);
  const stalePair = pairFor("days it is not served at all");
  assert.ok(stalePair.bn.includes(`${BN_NUM[Number(maxAge[1])]} দিনের`),
    `the Bengali twin does not say ${BN_NUM[Number(maxAge[1])]} days`);

  // The collector's cadence, from the Worker's own schedule.
  const cron = worker.match(/15 \* 60 \* 1000/);
  assert.ok(cron, "the Worker does not schedule a fifteen-minute collection");
  assert.ok(/every fifteen minutes/.test(research),
    "the paper no longer states the collector's fifteen-minute cadence");
  const cronPair = pairFor("every fifteen minutes");
  assert.ok(cronPair.bn.includes(`${BN_NUM[15]} মিনিটে`),
    "the Bengali twin does not say fifteen minutes");
});

console.log(`✓ Walk and paper contract: ${checks} checks passed — camera ownership, stated limits, bilingual itinerary, bilingual paper, flat diagram geometry and code-derived counts`);
