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
  assert.ok(walk.includes("map plane") || walk.includes("map-plane"),
    "the exploration does not identify its map-plane model");
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

// ── The paper is bilingual and complete ────────────────────────────────────
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

console.log(`✓ Walk and paper contract: ${checks} checks passed — camera ownership, stated limits, bilingual itinerary, bilingual paper and flat diagram geometry`);
