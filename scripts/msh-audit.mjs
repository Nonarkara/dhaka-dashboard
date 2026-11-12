// MSH layout audit — measures the rendered atlas, not the source.
//
// The MSH law requires evidence from the real interface: chrome cost, task
// visibility, geometry failures, hierarchy and preservation, captured at
// 390 / 1024 / 1440. Earlier audits of this project produced those numbers
// but kept no script that could reproduce them, so the claim could not be
// re-checked by anyone else. This script is that instrument.
//
// It writes the same `geometry.json` shape that `check-ui-geometry.mjs`
// verifies, plus the wider MSH record, and it saves the frames it measured.
//
//   node scripts/msh-audit.mjs                       # audit production
//   node scripts/msh-audit.mjs --url http://localhost:8787
//   node scripts/msh-audit.mjs --out docs/evidence/msh-2026-11-05

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const BASE = argOf('--url', 'https://dhaka.nonarkara.org').replace(/\/$/, '');
const OUT = argOf('--out', '');
// Which lens to audit. The walkthrough lens is its own surface with its own
// chrome, and it needs its own measurement rather than the city lens's.
const LENS = argOf('--lens', 'city');
const SHOTS = !args.includes('--no-screenshots');

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LANGUAGES = ['en', 'bn'];

// The measurement runs inside the page. It reports what the reader sees:
// where the chrome sits, whether the first task is visible, whether any
// reading is cut off, how many type sizes exist, and whether the lenses
// and the watch survived.
const MEASURE = `(() => {
  const box = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      width: Math.round(r.width), height: Math.round(r.height),
      bottom: Math.round(r.bottom),
    };
  };
  const visible = sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };

  const readings = Array.from(document.querySelectorAll('.atlas-watch-item')).map(item => {
    const parts = [item.querySelector('.watch-symbol'), item.querySelector('.watch-label'), item.querySelector('strong')];
    const clipped = parts
      .filter(Boolean)
      .some(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    return {
      text: (item.innerText || '').replace(/\\r\\n/g, '\\n').trim(),
      label: item.getAttribute('aria-label') || '',
      tier: item.dataset.tier || null,
      clipped,
      visible: visible('#' + item.id),
    };
  });

  // Type scale: the number of distinct sizes a reader can actually see.
  const sizes = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible('#' + (el.id || 'none'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.getBoundingClientRect().width === 0) continue;
    }
    const hasOwnText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasOwnText) continue;
    sizes.add(getComputedStyle(el).fontSize);
  }

  const header = box('.atlas-header');
  const map = box('#atlas-map');
  const watch = box('.atlas-watch');
  const key = box('.atlas-map-key');
  const credit = box('.maplibregl-ctrl-attrib');
  const splash = document.querySelector('#atlas-map-loading');

  const inFirstScreen = el => !!el && el.y >= -1 && el.bottom <= window.innerHeight + 1;

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    lang: document.documentElement.lang,
    lens: document.getElementById('atlas-lens')?.value || null,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    header, map, watch, key, credit,
    creditText: credit ? (document.querySelector('.maplibregl-ctrl-attrib')?.innerText || '').trim() : '',
    splashVisible: !!splash && getComputedStyle(splash).display !== 'none',
    chromeCostPct: header ? +(header.height / window.innerHeight * 100).toFixed(2) : null,
    walk: (() => {
      const panel = document.getElementById('atlas-walk');
      if (!panel) return null;
      const counts = document.getElementById('atlas-walk-counts');
      const link = document.getElementById('atlas-walk-scout');
      return {
        panelVisible: !panel.hidden,
        panelRect: (() => { const r = panel.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) }; })(),
        counts: counts ? counts.textContent.trim() : null,
        linkHref: link ? link.getAttribute('href') : null,
      };
    })(),
    taskVisible: {
      lens: visible('#atlas-lens'),
      watch: !!watch && watch.bottom <= window.innerHeight + 1,
      map: !!map && map.height > 0,
      allInFirstScreen: inFirstScreen(header) && inFirstScreen(watch) && inFirstScreen(map),
    },
    unobscuredRatio: (map && watch && key && credit)
      ? +(((map.width * map.height) - (watch.width * watch.height) - (key.width * key.height) - (credit.width * credit.height)) / (map.width * map.height)).toFixed(4)
      : null,
    readings,
    typeSizes: Array.from(sizes).map(Number).sort((a, b) => a - b),
    typeSizeCount: sizes.size,
    preservation: {
      lenses: document.querySelectorAll('#atlas-lens option').length,
      watchItems: readings.length,
      parliamentLink: !!document.getElementById('parliament-reference-link'),
      mapControls: document.querySelectorAll('.maplibregl-ctrl').length,
      footerCredit: !!document.querySelector('.maplibregl-ctrl-attrib'),
    },
    consoleErrors: window.__mshErrors || [],
  };
})()`;

const READY = `(() => {
  const splash = document.querySelector('#atlas-map-loading');
  const splashGone = !splash || getComputedStyle(splash).display === 'none' || splash.classList.contains('loaded');
  const watch = document.querySelector('#atlas-watch-air-value');
  const watchFilled = !!watch && watch.textContent.trim() !== '' && watch.textContent.trim() !== '—';
  const failed = !!splash && /unavailable|failed/i.test(splash.textContent || '');
  return { splashGone, watchFilled, failed, ready: splashGone && watchFilled && !failed };
})()`;

/**
 * The map's own state: what it is showing and whether it has finished
 * drawing it. A street-level lens pulls z19 tiles the city lens never asks
 * for, and a measurement taken before they arrive describes a black
 * rectangle rather than the surface a reader would see.
 */
const TILES = `(() => {
  const m = window.AtlasMap?.instance;
  try {
    if (!m) return { tilesLoaded: false, zoom: null, pitch: null };
    const counts = document.getElementById('atlas-walk-counts');
    return {
      tilesLoaded: !!(m.areTilesLoaded && m.areTilesLoaded()),
      // The map's own word for "the camera has stopped and the tiles it
      // shows have arrived". Tiles alone are not enough: MapLibre reports
      // them loaded before it has asked for the next zoom's tiles.
      idle: !!window.AtlasMap?.idle,
      zoom: +m.getZoom().toFixed(2),
      pitch: +m.getPitch().toFixed(1),
      walkCounts: counts ? counts.textContent.trim() : null,
      sun: (() => { try { return window.AtlasMap.sun ? window.AtlasMap.sun() : null; } catch { return null; } })(),
    };
  } catch { return { tilesLoaded: false, zoom: null, pitch: null }; }
})()`;

/**
 * Console errors seen on the page.
 *
 * A harness that silently renders a broken surface would hand the audit a
 * clean-looking measurement. The error text is kept beside the numbers so
 * a failure is never mistaken for a pass.
 */
const CONSOLE_ERRORS = `(() => {
  const sink = window.__mshConsoleErrors || [];
  return sink.slice(0, 12);
})()`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = OUT || `docs/evidence/msh-${stamp}`;
  mkdirSync(outDir, { recursive: true });

  const { session, close } = await launch();
  const rows = [];

  // Console errors are captured on every document, before the page's own
  // scripts run, so a failure cannot hide behind a clean-looking layout.
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__mshConsoleErrors = [];
      const push = level => (...args) => {
        try {
          window.__mshConsoleErrors.push(level + ': ' + args.map(a => (a && a.message) ? a.message : String(a)).join(' ').slice(0, 300));
        } catch {}
      };
      const error = console.error.bind(console);
      console.error = (...args) => { push('error')(...args); error(...args); };
      window.addEventListener('error', e => push('uncaught')(e.message || 'error'));
      window.addEventListener('unhandledrejection', e => push('unhandled')(e.reason && e.reason.message ? e.reason.message : String(e.reason)));
    })();`,
  });

  try {
    for (const viewport of VIEWPORTS) {
      for (const lang of LANGUAGES) {
        await session.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: false,
        });

        const url = `${BASE}/?lang=${lang}`;
        // The load listener is registered before the navigation, or the event
        // can arrive before anyone is listening and the audit waits forever.
        const loaded = session.once('Page.loadEventFired', 45000);
        await session.send('Page.navigate', { url });
        await loaded.catch(() => {});

        // Select the lens under audit. The picker is the atlas's own control
        // for it, so driving the picker drives the product.
        if (LENS && LENS !== 'city') {
          await session.evaluate(`(() => {
            const select = document.getElementById('atlas-lens');
            if (!select) return false;
            select.value = ${JSON.stringify(LENS)};
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })()`);
          await sleep(1500);
        }

        // The splash lifts on the first styled frame and the watch fills from
        // the API. Wait for both, so the measurement is of a live surface and
        // not of a skeleton.
        let ready = { ready: false };
        for (let attempt = 0; attempt < 60; attempt += 1) {
          ready = await session.evaluate(READY);
          if (ready?.ready) break;
          await sleep(500);
        }

        await session.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
        // Wait for the map to finish drawing what it is showing. A
        // street-level lens pulls z19 tiles the city lens never asks for,
        // and a frame taken before they arrive is a black rectangle, not
        // evidence of anything.
        const settleDeadline = Date.now() + 60000;
        let settle = { tilesLoaded: false };
        let settled = false;
        while (Date.now() < settleDeadline) {
          settle = await session.evaluate(TILES);
          const cameraReady = LENS === 'city' || (settle?.zoom ?? 0) >= 17;
          // The walkthrough publishes its count only once the map has
          // settled and two readings agree. A frame taken before that
          // shows a panel saying it is still reading — the honest state
          // of the product, but not the surface a reader waits to see.
          const countReady = LENS !== 'walk'
            || !/Reading the street|পড়া হচ্ছে/.test(settle?.walkCounts || '');
          if (settle?.tilesLoaded && settle?.idle && cameraReady && countReady) {
            settled = true;
            break;
          }
          await sleep(500);
        }
        const row = await session.evaluate(MEASURE);
        row.url = url;
        row.ready = !!ready?.ready;
        row.tilesLoaded = !!settle?.tilesLoaded;
        row.settled = settled;
        row.settle = settle;
        row.consoleErrors = await session.evaluate(CONSOLE_ERRORS);
        rows.push(row);

        if (SHOTS) {
          const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          const file = `${outDir}/${LENS}-${viewport.width}-${lang}.png`;
          writeFileSync(file, Buffer.from(shot.data, 'base64'));
          row.screenshot = file;
        }

        const flag = row.ready ? 'ready' : 'NOT-READY';
        console.log(
          `  ${LENS} ${viewport.width}x${viewport.height} ${lang}: chrome ${row.chromeCostPct}% · ` +
          `watch ${row.watch?.height}px · map ${row.unobscuredRatio} · ${row.typeSizeCount} sizes · ${flag} · ` +
          `tiles ${row.tilesLoaded ? 'loaded' : 'UNLOADED'} · settled ${row.settled ? 'yes' : 'NO'}` +
          (row.walk?.panelVisible ? ` · walk panel ${row.walk.panelRect.height}px · "${row.walk.counts}"` : ''),
        );
      }
    }
  } finally {
    await close();
  }

  const payload = {
    auditedAt: new Date().toISOString(),
    url: BASE,
    viewports: VIEWPORTS.map(v => `${v.width}x${v.height}`),
    languages: LANGUAGES,
    lens: LENS,
    rows,
  };
  writeFileSync(`${outDir}/geometry.json`, `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(`${outDir}/msh-record.json`, `${JSON.stringify(payload, null, 2)}\n`);

  const failures = rows.filter(r => !r.ready || r.overflow || !r.tilesLoaded || !r.settled);
  console.log(`\n✓ Measured ${rows.length} viewport/language cases → ${outDir}/geometry.json`);
  if (failures.length) {
    console.log(`✗ ${failures.length} case(s) not ready, overflowing, unsettled, or measured on unloaded tiles — treat the numbers as unverified`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`MSH audit failed: ${error.message}`);
  process.exitCode = 1;
});
