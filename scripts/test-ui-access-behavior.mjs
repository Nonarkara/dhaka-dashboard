#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/dashboard.js', 'utf8');
const html = readFileSync('public/index.html', 'utf8');
const menuMarkup = html.slice(html.indexOf('<details class="atlas-menu"'), html.indexOf('</header>')).replace(/<a id="parliament-reference-link"[^>]*>.*?<\/a>/, '');
assert.doesNotMatch(menuMarkup, /\p{Script=Bengali}/u, 'static menu labels use canonical English so switching back from Bengali restores them');
const dialogs = [...html.matchAll(/<dialog\b([^>]+)>/g)];
assert.equal(dialogs.length, 7, 'all existing desks stay available');
for (const [, attributes] of dialogs) {
  const id = /\bid="([^"]+)"/.exec(attributes)?.[1];
  const label = /aria-labelledby="([^"]+)"/.exec(attributes)?.[1];
  assert.ok(label && html.includes(`id="${label}"`), `${id} needs its visible heading as its accessible name`);
}

const listeners = new Map();
const document = {
  documentElement: { lang: 'en' }, activeElement: null,
  addEventListener(type, handler) { listeners.set(type, handler); },
};
class Element {
  constructor(id) { this.id = id; this.handlers = new Map(); this.open = false; this.dataset = {}; }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  focus() { document.activeElement = this; }
  contains(target) { return target === this || target?.parent === this; }
}
const menu = new Element('atlas-menu');
const summary = new Element('summary'); summary.parent = menu;
let menuTop = 101;
const menuBody = { style: {}, getBoundingClientRect: () => ({ top: menuTop }) };
menu.querySelector = selector => selector === 'summary' ? summary : selector === '.atlas-menu-body' ? menuBody : null;
const menuButton = new Element('menu-air'); menuButton.parent = menu;
const watchButton = new Element('watch-air');
const dialog = new Element('air-dialog');
dialog.showModal = () => { dialog.open = true; };
dialog.close = () => { dialog.open = false; dialog.handlers.get('close')?.(); };
const closeButton = new Element('close'); closeButton.closest = () => dialog;
for (const button of [menuButton, watchButton]) button.getAttribute = () => 'air-dialog';
const timeline = new Element('air-timeline-container'); timeline.innerHTML = '';
const retryButton = new Element('air-retry');
timeline.querySelector = selector => selector === '[data-feed-retry]' ? retryButton : null;
const referenceLink = { textContent: '', href: '' };
document.querySelector = selector => selector === '#parliament-reference-link' ? referenceLink : selector === '#atlas-menu' ? menu : selector === '#air-timeline-container' ? timeline : null;
document.querySelectorAll = selector => selector === '[data-open]' ? [menuButton, watchButton] : selector === 'dialog' ? [dialog] : selector === '.modal-close-btn' ? [closeButton] : [];
document.getElementById = id => id === 'air-dialog' ? dialog : null;
const windowListeners = new Map();
const window = { innerHeight: 844, addEventListener(type, handler) { windowListeners.set(type, handler); } };
let payload;
let responseOk = true;
const code = source.slice(0, source.lastIndexOf('  if (document.readyState')) + 'window.test={wireDialogControls,loadAirQuality,loadDashboardFeeds};})();';
vm.runInNewContext(code, { document, window, fetch: async () => ({ ok: responseOk, status: responseOk ? 200 : 503, json: async () => payload }), AbortSignal, Intl });
window.test.wireDialogControls();
menu.open = true; menu.handlers.get('toggle')();
assert.equal(menuBody.style.maxHeight, '735px', 'menu fits actual top after enlarged header wraps');
window.innerHeight = 640; menuTop = 104; windowListeners.get('resize')();
assert.equal(menuBody.style.maxHeight, '528px', 'viewport resize recomputes scroll budget');
menu.open = false;
const designCss = readFileSync('public/dhaka-design.css', 'utf8');
assert.match(designCss, /\.atlas-menu-body\s*>\s*\*\s*\{\s*flex-shrink:\s*0/, 'scrolling menu items retain full text height');
assert.match(designCss, /\.atlas-header:has\(\.atlas-menu\[open\]\)\s*\{\s*z-index:100/, 'an explicitly opened menu sits over the watch strip');
let prevented = false;
menu.open = true; menuButton.focus();
listeners.get('keydown')({ key: 'Escape', preventDefault: () => { prevented = true; } });
assert.equal(menu.open, false); assert.equal(document.activeElement, summary); assert.ok(prevented);
menu.open = true;
listeners.get('pointerdown')({ target: menuButton });
assert.equal(menu.open, true, 'inside interaction keeps controls open');
menuButton.focus(); listeners.get('pointerdown')({ target: watchButton });
assert.equal(menu.open, false); assert.equal(document.activeElement, summary);
menu.open = true; watchButton.focus(); listeners.get('pointerdown')({ target: watchButton });
assert.equal(document.activeElement, watchButton, 'outside dismissal does not steal outside focus');
menu.open = true; menuButton.focus(); menuButton.handlers.get('click')();
assert.equal(menu.open, false); assert.equal(dialog.open, true);
closeButton.handlers.get('click')();
assert.equal(document.activeElement, summary, 'a hidden menu opener cannot be the dialog return target');
watchButton.focus(); watchButton.handlers.get('click')(); dialog.close();
assert.equal(document.activeElement, watchButton, 'watch desk returns to its visible reading');

const time = Array.from({ length: 72 }, (_, i) => new Date(Date.UTC(2026, 10, 4, 16 + i)).toISOString().slice(0, 16));
const pm = time.map((_, i) => i === 2 ? null : i);
payload = { data: { hourly: { time, pm2_5: pm, us_aqi: pm }, current: { time: time[0], pm2_5: 0, us_aqi: 0 } } };
for (const lang of ['en', 'bn']) {
  document.documentElement.lang = lang;
  window.test.loadDashboardFeeds();
  assert.equal(referenceLink.href, `/parliament-reference.html?lang=${lang}`, 'reference viewer preserves the current language');
  assert.match(referenceLink.textContent, lang === 'bn' ? /সংসদের/ : /Parliament/);
  await window.test.loadAirQuality();
  assert.equal((timeline.innerHTML.match(/<tr>/g) || []).length, 73, '72 exact readings plus column headings remain available');
  assert.match(timeline.innerHTML, /<details class="air-data-table">/);
  assert.match(timeline.innerHTML, /2026-11-04 16:00/);
  assert.match(timeline.innerHTML, /2026-11-07 15:00/, 'actual final source time, not an invented +72-hour endpoint');
  assert.match(timeline.innerHTML, lang === 'bn' ? /<td>০<\/td>/ : /<td>0<\/td>/, 'real zero is preserved');
  assert.match(timeline.innerHTML, lang === 'bn' ? /<td>অনুপলব্ধ<\/td>/ : /<td>Unavailable<\/td>/, 'missing is not zero');
  assert.ok(!timeline.innerHTML.includes('+72 HOURS'));
}
payload.data.hourly.time[0] = '<img src=x onerror=alert(1)>';
await window.test.loadAirQuality();
assert.ok(!timeline.innerHTML.includes('<img'), 'source time cannot inject table markup');
const successPayload = payload;
successPayload.data.hourly.time[0] = time[0];
for (const lang of ['en', 'bn']) {
  document.documentElement.lang = lang;
  responseOk = false;
  payload = { status: 'unavailable', reasonCode: 'upstream-unreachable', timestamp: '2026-11-04T12:00:00.000Z' };
  await window.test.loadAirQuality();
  assert.equal(timeline.dataset.status, 'unavailable');
  assert.equal(timeline.dataset.reasonCode, 'upstream-unreachable');
  assert.equal(timeline.dataset.checkedAt, payload.timestamp, 'preserve the source failure timestamp');
  assert.match(timeline.innerHTML, lang === 'bn' ? /আবার চেষ্টা/ : /Retry/);
  responseOk = true; payload = successPayload;
  await retryButton.handlers.get('click')({ currentTarget: retryButton });
  assert.equal(timeline.dataset.status, 'ok', 'an explicit retry recovers a desk that failed at boot');
  assert.equal(timeline.dataset.reasonCode, undefined, 'recovery clears the old failure reason');
  assert.equal((timeline.innerHTML.match(/<tr>/g) || []).length, 73);
}
console.log('✓ UI behavior: seven named dialogs, menu dismissal/focus return, 72 dated bilingual table values and recoverable source failure.');

// The actual watch renderer must expose the reading/category to eyes and AT,
// including a Bengali→English change after data-language-fixed is applied.
const watchItems=new Map();
for(const id of ['flood','air','wind','traffic']) {
  const label={textContent:''}, value={textContent:''};
  watchItems.set(`#atlas-watch-${id}`,{dataset:{},title:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},querySelector(){return label;},label});
  watchItems.set(`#atlas-watch-${id}-value`,value);
}
watchItems.set('#atlas-watch-wind-symbol',{style:{}});
const watchDocument={documentElement:{lang:'bn'},querySelector:s=>watchItems.get(s)||null,addEventListener(){}};
const watchWindow={location:{search:''},addEventListener(){}};
let watchSource=readFileSync('public/app.js','utf8');
watchSource=watchSource.slice(0,watchSource.indexOf('  // Safe boot:'))+'window.testWatch=(data)=>{watchData=data;renderCityWatch();};})();';
vm.runInNewContext(watchSource,{document:watchDocument,window:watchWindow,URLSearchParams,Intl,console});
for(const lang of ['bn','en']) {
  watchDocument.documentElement.lang=lang;
  watchWindow.testWatch({indicators:{airQuality:{us_aqi:158,category:'Unhealthy',status:'danger',source:'CAMS',observedAt:'2026-11-04T12:00'},weather:{wind_speed_10m:8,wind_direction_10m:90,observedAt:'2026-11-04T12:00'}}});
  const item=watchItems.get('#atlas-watch-air'),value=watchItems.get('#atlas-watch-air-value').textContent;
  assert.match(value,lang==='bn'?/অস্বাস্থ্যকর/:/Unhealthy/,'colour never replaces visible category');
  assert.match(item.attrs['aria-label'],lang==='bn'?/বায়ু: AQI ১৫৮/:/Air: AQI 158/,'accessible reading and label follow current language');
  assert.match(item.attrs['aria-label'],/CAMS.*2026-11-04/,'source and valid time stay in accessible name');
}
console.log('✓ Watch behavior: visible AQI category, complete accessible evidence, Bengali/English rerender.');
