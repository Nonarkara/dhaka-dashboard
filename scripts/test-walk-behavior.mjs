import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(process.env.WALK_SOURCE || 'public/walk.js', 'utf8');
const areaData = JSON.parse(readFileSync('public/dhaka-areas.json', 'utf8'));

class Events {
  handlers = new Map();
  addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); }
  removeEventListener(type, fn) { this.handlers.get(type)?.delete(fn); }
  emit(type, event = {}) { for (const fn of [...this.handlers.get(type) || []]) fn(event); }
}
class Element extends Events {
  constructor() { super(); this.children = []; this.attrs = {}; this.dataset = {}; this.textContent = ''; this.html = ''; }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attrs[name] = value; }
  querySelectorAll() { return this.children; }
}
function harness({ reduced = false, delay = false } = {}) {
  const elements = new Map(['atlas-walk-place', 'atlas-walk-route', 'atlas-walk-status', 'atlas-walk-keys', 'atlas-walk-prev', 'atlas-walk-next', 'atlas-walk-itinerary-summary'].map(id => [id, new Element()]));
  const document = Object.assign(new Events(), { hidden: false, documentElement: { lang: 'en' }, querySelector: selector => elements.get(selector.slice(1)) || null, createElement: () => new Element() });
  const motion = Object.assign(new Events(), { matches: reduced });
  const window = Object.assign(new Events(), { matchMedia: () => motion });
  const raf = new Map(); let serial = 0, now = 1000, requests = 0, finishFetch;
  const response = { ok: true, json: async () => ({ districts: [{ id: 'old-dhaka', headline: 'Dated district evidence', headline_bn: 'তারিখযুক্ত জেলার তথ্য' }] }) };
  vm.runInNewContext(source, { window, document, AbortSignal, console, fetch: () => { requests++; return delay ? new Promise(resolve => { finishFetch = () => resolve(response); }) : Promise.resolve(response); }, requestAnimationFrame: fn => { raf.set(++serial, fn); return serial; }, cancelAnimationFrame: id => raf.delete(id) });
  const mapEvents = new Events(), canvas = Object.assign(new Events(), { clientWidth: 1000, clientHeight: 800 });
  const map = {
    keyboard:{enabled:true,isEnabled(){return this.enabled;},disable(){this.enabled=false;},enable(){this.enabled=true;}},
    center: { lng: 90.4, lat: 23.7 }, bearing: 0, pitch: 85, zoom: 19, maxPitch: 75, jumps: [],
    getCenter() { return this.center; }, getBearing() { return this.bearing; }, getPitch() { return this.pitch; }, getZoom() { return this.zoom; },
    getCanvas: () => canvas, getMaxPitch() { return this.maxPitch; }, setMaxPitch(value) { this.maxPitch = value; },
    jumpTo(options) { if (options.center) this.center = { lng: options.center[0], lat: options.center[1] }; for (const key of ['bearing', 'pitch', 'zoom']) if (options[key] !== undefined) this[key] = options[key]; this.jumps.push(options); mapEvents.emit('moveend'); },
    setBearing(value) { this.bearing = value; mapEvents.emit('moveend'); },
    on: (type, fn) => mapEvents.addEventListener(type, fn), off: (type, fn) => mapEvents.removeEventListener(type, fn),
    // Independent pinhole camera model, with altitude 12m and depression 5°.
    unproject([x, y]) {
      const R = 6378137, θ = (90 - this.pitch) * Math.PI / 180, f = 1200, H = 12;
      const sy = (y - canvas.clientHeight / 2) / f;
      const distance = H * (Math.cos(θ) - sy * Math.sin(θ)) / (Math.sin(θ) + sy * Math.cos(θ));
      const fwd = distance - H / Math.tan(θ);
      const side = (x - canvas.clientWidth / 2) / f * (distance * Math.cos(θ) + H * Math.sin(θ));
      const b = this.bearing * Math.PI / 180, k = Math.cos(this.center.lat * Math.PI / 180);
      const e = fwd * Math.sin(b) + side * Math.cos(b), n = fwd * Math.cos(b) - side * Math.sin(b);
      const mx = R * this.center.lng * Math.PI / 180 + e / k;
      const my = R * Math.log(Math.tan(Math.PI / 4 + this.center.lat * Math.PI / 360)) + n / k;
      return { lng: mx / R * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180 / Math.PI };
    },
  };
  const api = window.AtlasWalk;
  api.start();
  const key = (value, extra = {}) => document.emit('keydown', { key: value, target: { tagName: 'CANVAS' }, preventDefault() {}, ...extra });
  const release = value => document.emit('keyup', { key: value });
  const tick = () => { now += 100; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(fn => fn(now)); };
  return { api, map, mapEvents, canvas, document, window, motion, raf, elements, key, release, tick, get requests() { return requests; }, finishFetch: () => finishFetch() };
}

// Activation before map/data: attach later must bind input exactly once.
const h = harness({ delay: true });
h.api.activate('walk');
h.api.attach(h.map, []);
h.api.attach(h.map, areaData);
assert.equal(h.requests, 1, 'in-flight evidence fetch must not duplicate on reattach');
assert.equal(h.map.zoom, 19);
assert.equal(h.raf.size, 0, 'no idle animation loop');
assert.equal(h.document.handlers.get('keydown').size, 1);
assert.equal(h.map.keyboard.enabled,false,'native arrows must not simultaneously pan during manual exploration');
const old = areaData.find(a => a.id === 'old-dhaka');
assert.equal(h.map.center.lng, old.lng);
assert.match(h.elements.get('atlas-walk-status').textContent, /Model camera/);
assert.ok(Math.abs(h.api.measure().heightM - 12) < 0.001, 'altitude must agree with independent perspective projection');
assert.equal(h.api.measure().method, 'planar-projection-model');
assert.match(h.elements.get('atlas-walk-status').textContent, /Model camera/);

for (const [key, axis, direction] of [['w', 'lat', 1], ['s', 'lat', -1], ['a', 'lng', -1], ['d', 'lng', 1]]) {
  h.map.bearing = 0;
  const initial = h.map.center[axis];
  h.key(key); h.tick(); h.tick(); h.release(key);
  assert.ok((h.map.center[axis] - initial) * direction > 0, `${key} must move in its documented direction`);
  assert.equal(h.raf.size, 0, 'release cancels scheduled movement');
}
assert.match(h.elements.get('atlas-walk-status').textContent, /Model camera/);
assert.match(h.elements.get('atlas-walk-place').textContent, /Exploring map/);
assert.ok(h.elements.get('atlas-walk-route').children.every(button => button.attrs['aria-pressed'] === 'false'));
const explored = { ...h.map.center };
h.api.activate('walk');
assert.deepEqual(h.map.center, explored, 'same-lens refresh must not snap exploration back');

// Keyboard forms/modifiers are respected; reduced motion has no held loop.
for (const extra of [{ target: { tagName: 'INPUT' } }, { target: { isContentEditable: true } }, { ctrlKey: true }]) { h.key('w', extra); assert.equal(h.raf.size, 0); }
for (const interrupt of [() => { h.document.hidden = true; h.document.emit('visibilitychange'); }, () => h.window.emit('blur'), () => h.document.emit('pointerdown'), () => h.document.emit('focusin'), () => h.canvas.emit('pointerdown'), () => h.canvas.emit('wheel'), () => h.mapEvents.emit('dragstart', { originalEvent: {} }), () => h.mapEvents.emit('zoomstart', { originalEvent: {} }), () => h.mapEvents.emit('rotatestart', { originalEvent: {} }), () => h.mapEvents.emit('pitchstart', { originalEvent: {} })]) {
  h.document.hidden = false; h.key('w'); h.tick(); interrupt();
  assert.equal(h.raf.size, 0, 'interruption must cancel the pending frame immediately');
  const count = h.map.jumps.length;
  h.tick(); assert.equal(h.map.jumps.length, count); assert.equal(h.raf.size, 0);
}
h.document.hidden = false;
h.key('w',{repeat:true}); assert.equal(h.raf.size,0,'held autorepeat cannot restart after a task interruption');
const originalQuery=h.document.querySelector;h.document.querySelector=s=>s==='dialog[open]'?{}:originalQuery(s);h.key('w');assert.equal(h.raf.size,0,'modal interaction cannot move the map behind the desk');h.document.querySelector=originalQuery;
h.key('w'); h.api.next(); assert.equal(h.raf.size, 0, 'bookmark selection interrupts input');
assert.match(h.elements.get('atlas-walk-status').textContent, /Model camera/);
h.map.jumpTo({ center: [91, 24] });
assert.match(h.elements.get('atlas-walk-status').textContent, /Model camera/, 'external map centre change must clear district context');
h.finishFetch(); await new Promise(resolve => setImmediate(resolve));
assert.match(h.elements.get('atlas-walk-status').textContent, /Model camera/, 'late evidence must not restore stale bookmark context');
h.api.next(); assert.match(h.elements.get('atlas-walk-status').textContent, /Model camera/);
h.key('w'); h.api.stop(); assert.equal(h.raf.size, 0, 'explicit task interruption cancels held input');
h.key('w'); h.api.activate('city'); assert.equal(h.raf.size, 0); assert.equal(h.map.maxPitch, 75); assert.equal(h.map.keyboard.enabled,true,'restore original keyboard mode on exit');
const beforeExit = h.map.jumps.length; h.key('w'); h.tick(); assert.equal(h.map.jumps.length, beforeExit);
assert.equal(h.document.handlers.get('visibilitychange').size, 0);

const reduced = harness({ reduced: true }); reduced.api.attach(reduced.map, areaData); reduced.api.activate('walk');
const before = reduced.map.center.lat; reduced.key('w'); assert.notEqual(reduced.map.center.lat, before); assert.equal(reduced.raf.size, 0);
const once = reduced.map.jumps.length; reduced.key('w', { repeat: true }); assert.equal(reduced.map.jumps.length, once);
reduced.motion.matches = false; reduced.key('w'); assert.equal(reduced.raf.size, 1); reduced.motion.emit('change'); assert.equal(reduced.raf.size, 0);
reduced.map.unproject = () => ({ lng: 0, lat: 0 }); assert.equal(reduced.api.measure(), null, 'inconsistent projection is unavailable');
reduced.map.pitch = 0; assert.equal(reduced.api.measure(), null, 'flat map must not assert a model height');
console.log('✓ Walk behavior: direction, explicit-input lifecycle, delayed attach, reduced motion, bookmark context, independent camera model and unavailable fit');

const disabled = harness(); disabled.map.keyboard.enabled=false; disabled.api.attach(disabled.map,areaData); disabled.api.activate('walk'); disabled.api.activate('city');
assert.equal(disabled.map.keyboard.enabled,false,'a previously disabled native handler stays disabled');
