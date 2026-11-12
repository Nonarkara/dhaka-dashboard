// MSH dialog layout audit — measures the seven modal dialogs of the atlas.
//
// `scripts/msh-audit.mjs` measures the map surface: chrome cost, task
// visibility, type scale, preservation. The atlas also carries seven modal
// dialogs (pop-up bars of dense text) and a bottom watch strip, and those are
// where the MSH law usually breaks — a dialog that runs past the bottom of the
// screen, a clipped label, a fourth type size, a paragraph of prose the
// reader never asked for. There was no instrument that measured them.
//
// This is that instrument. It drives the product's own controls: it clicks the
// `[data-open]` button a reader clicks and never calls `dialog.showModal()`
// itself, so every number is a number a reader could actually see.
//
//   node scripts/msh-dialog-audit.mjs
//   node scripts/msh-dialog-audit.mjs --url http://localhost:8787
//   node scripts/msh-dialog-audit.mjs --out docs/evidence/msh-dialogs-2026-11-12
//   node scripts/msh-dialog-audit.mjs --lens city --no-screenshots
//
// ── Failure checks ───────────────────────────────────────────────────────────
// A case fails when any of these is true. Each one is measured, never assumed.
//
//   1. open    The dialog did not open. A dialog that cannot be opened is a
//              failure, not a skip: `opened: false` is written with the reason
//              and the case counts as failing.
//   2. bottom  The dialog box extends past the bottom of the viewport
//              (`rect.bottom > innerHeight + 1`). A pop-up that runs off the
//              screen hides its own tail and its close button.
//   3. clipped A text element inside the dialog is cut off —
//              `scrollWidth > clientWidth + 1` or
//              `scrollHeight > clientHeight + 1` while the element's overflow
//              is `hidden`/`clip`. Text that scrolls is not clipped; text
//              that is truncated with no way to reach it is.
//   4. type    More than three distinct font sizes are visible inside the
//              dialog. The project's type scale is three sizes
//              (--text-display 24px, --text-body 13px, --text-micro 11px);
//              a fourth size inside a pop-up is a false hierarchy.
//   5. block   A single text block exceeds 600 characters. Long prose in a
//              pop-up is the sprawl the law forbids — information the reader
//              must pay screen space for. The offender is named, never
//              silently passed.
//   6. escape  The dialog does not close when Escape is pressed. A modal that
//              cannot be dismissed is a trap.
//   7. page    The page never lifted its loading splash, so the measurement
//              was taken over a skeleton. This is a property of the page, so
//              it is judged once per page and reported once per page, not
//              counted seven times over the dialogs of that page.
//
// Exit code is 1 when any case fails any check.
//
// Every page is measured in its own browser. A second navigation inside one
// browser leaves the previous page's WebGL context alive; the atlas's map then
// never renders, the splash stays up and the map-backed panels stay empty.
// That is a fault of the harness, not of the product.

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const BASE = argOf('--url', 'https://dhaka.nonarkara.org').replace(/\/$/, '');
const OUT = argOf('--out', '');
// The dialogs are lens-independent, but the lens decides what the map draws
// behind them, so the audit honours the same switch as `msh-audit.mjs`.
const LENS = argOf('--lens', 'city');
const SHOTS = !args.includes('--no-screenshots');

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const LANGUAGES = ['en', 'bn'];

// The seven dialogs the atlas ships, in the order the menu lists them.
const DIALOGS = [
  'national-data-dialog',
  'collage-dialog',
  'quick-jump-dialog',
  'flood-dialog',
  'air-dialog',
  'economy-dialog',
  'transit-dialog',
];

// Call a page-side function with JSON-safe arguments.
const call = (fnSource, ...fnArgs) =>
  `(${fnSource})(${fnArgs.map(value => JSON.stringify(value)).join(', ')})`;

/**
 * The controls that open a dialog. The atlas opens its dialogs from
 * `[data-open]` buttons — three of them live inside the collapsed Map menu,
 * the rest on the watch strip — and the audit uses the same buttons a reader
 * uses, so the product's own code path runs.
 */
const FIND_CONTROLS = `((id) => {
  const list = Array.from(document.querySelectorAll('[data-open="' + id + '"]'));
  return {
    count: list.length,
    info: list.map((el, index) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        index,
        tag: el.tagName,
        id: el.id || '',
        visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05,
        x: Math.round((r.x + r.width / 2) * 100) / 100,
        y: Math.round((r.y + r.height / 2) * 100) / 100,
        inDetails: !!el.closest('details'),
        text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
      };
    }),
  };
})`;

/**
 * Open the Map menu so a control that lives inside the collapsed `<details>`
 * can be reached. This is navigation, not the audited action.
 */
const OPEN_DETAILS = `((id) => {
  const el = document.querySelector('[data-open="' + id + '"]');
  const details = el && el.closest('details');
  if (!details) return false;
  details.open = true;
  return true;
})`;

/** Is the control the topmost element at the point the audit would click? */
const HIT_TEST = `((id, index, x, y) => {
  const el = document.querySelectorAll('[data-open="' + id + '"]')[index];
  if (!el) return { hit: false, why: 'control-missing' };
  const top = document.elementFromPoint(x, y);
  if (!top) return { hit: false, why: 'nothing-at-point' };
  return {
    hit: el === top || el.contains(top),
    why: top.tagName + (top.id ? '#' + top.id : ''),
  };
})`;

/** Fallback click, dispatched on the element itself. */
const DOM_CLICK = `((id, index) => {
  const el = document.querySelectorAll('[data-open="' + id + '"]')[index];
  if (!el) return false;
  el.click();
  return true;
})`;

const IS_OPEN = `((id) => {
  const dialog = document.getElementById(id);
  return !!(dialog && dialog.open);
})`;

/** Has the dialog's own content arrived, or is it still a placeholder? */
const CONTENT_STATE = `((id) => {
  const dialog = document.getElementById(id);
  if (!dialog) return { settled: false, loading: false, chars: 0 };
  const text = (dialog.innerText || '').replace(/\\s+/g, ' ').trim();
  return { settled: text.length > 0 && !/loading/i.test(text), loading: /loading/i.test(text), chars: text.length };
})`;

/** Force the dialog shut, so the next case starts from a clean surface. */
const FORCE_CLOSE = `((id) => {
  const dialog = document.getElementById(id);
  if (!dialog) return false;
  if (dialog.open) dialog.close();
  return !dialog.open;
})`;

/**
 * The measurement, taken inside the page with the dialog open.
 *
 * It reports what the reader sees: the dialog's size against the viewport,
 * whether it runs off the screen, how many type sizes and how much text it
 * carries, the single largest block of prose in it, whether any text is cut
 * off, whether focus is inside it, and how many controls it holds.
 */
const MEASURE_DIALOG = `((id) => {
  const dialog = document.getElementById(id);
  if (!dialog) return { opened: false, reason: 'dialog-missing' };
  if (!dialog.open) return { opened: false, reason: 'dialog-not-open' };

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const visible = el => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (Number(s.opacity) <= 0.05) return false;
    return true;
  };

  // A text block is the text of a box that owns its own line. A child that
  // lays out as a block of its own — a <dl>, a <div>, a table cell — is
  // measured separately, so a paragraph inside a card is never counted twice
  // and a container never inflates the largest block.
  const INLINE_DISPLAYS = new Set(['inline', 'inline-block', 'contents', 'ruby', 'ruby-base', 'ruby-text']);

  const ownText = el => {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) { out += node.textContent; continue; }
      if (node.nodeType !== 1) continue;
      const display = getComputedStyle(node).display;
      if (display === 'none') continue;
      if (INLINE_DISPLAYS.has(display)) { out += node.textContent; continue; }
      // A block child carries its own text and is measured on its own.
    }
    return out.replace(/\\s+/g, ' ').trim();
  };

  // Every text node in the dialog, with the element that carries it.
  const textNodes = [];
  const walk = node => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const text = child.textContent.replace(/\\s+/g, ' ').trim();
        if (text) textNodes.push({ parent: child.parentElement, text });
      } else if (child.nodeType === 1) {
        if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
        walk(child);
      }
    }
  };
  walk(dialog);

  const chainVisible = el => {
    let node = el;
    while (node && node !== document.body) {
      if (!visible(node)) return false;
      if (node === dialog) return true;
      node = node.parentElement;
    }
    return false;
  };

  const visibleText = textNodes.filter(t => t.parent && chainVisible(t.parent));

  // Type scale: the sizes a reader can actually see inside the dialog.
  const sizes = new Set();
  for (const t of visibleText) sizes.add(getComputedStyle(t.parent).fontSize);

  // Blocks: elements that carry text of their own, biggest first.
  const blocks = [];
  const hasTextMemo = new Map();
  const hasText = el => {
    if (hasTextMemo.has(el)) return hasTextMemo.get(el);
    let result = ownText(el).length > 0;
    if (!result) {
      for (const child of el.children) {
        if (hasText(child)) { result = true; break; }
      }
    }
    hasTextMemo.set(el, result);
    return result;
  };
  for (const el of dialog.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const text = ownText(el);
    if (!text) continue;
    blocks.push({
      tag: el.tagName,
      id: el.id || '',
      cls: (el.getAttribute('class') || '').slice(0, 60),
      chars: text.length,
      preview: text.slice(0, 120),
    });
  }
  blocks.sort((a, b) => b.chars - a.chars);

  // Clipped text: content cut off with no way to reach it. A scrollable
  // region is not clipped; a truncated label is.
  const clipped = [];
  const overflowing = [];
  for (const el of dialog.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const scrollX = el.scrollWidth > el.clientWidth + 1;
    const scrollY = el.scrollHeight > el.clientHeight + 1;
    if (!scrollX && !scrollY) continue;
    const hiddenX = s.overflowX === 'hidden' || s.overflowX === 'clip';
    const hiddenY = s.overflowY === 'hidden' || s.overflowY === 'clip';
    if (!hasText(el)) continue;
    const entry = {
      tag: el.tagName,
      id: el.id || '',
      cls: (el.getAttribute('class') || '').slice(0, 60),
      text: ownText(el).slice(0, 80),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
    if ((scrollX && hiddenX) || (scrollY && hiddenY)) clipped.push(entry);
    else overflowing.push(entry);
  }

  // Focus: a modal dialog owns the focus while it is open.
  const active = document.activeElement;
  const focusInside = !!(active && (active === dialog || dialog.contains(active)));

  // Interactive controls the reader can reach inside the dialog.
  const controlSel = 'button, a[href], input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  const controlEls = Array.from(dialog.querySelectorAll(controlSel)).filter(visible);

  // Reader-facing structure: the headings, in order.
  const headings = Array.from(dialog.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(visible)
    .map(h => (h.innerText || h.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter(Boolean);

  const rect = dialog.getBoundingClientRect();
  const body = dialog.querySelector('.modal-body');
  const bodyRect = body ? body.getBoundingClientRect() : null;

  // The type scale, read as the pixel sizes a reader can actually see.
  const typeSizes = Array.from(sizes)
    .map(value => parseFloat(value))
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => a - b);
  const typeSizesRaw = Array.from(sizes).sort();

  return {
    opened: true,
    reason: null,
    dialog: id,
    title: (dialog.querySelector('.modal-title') || {}).textContent || null,
    viewport: { width: vw, height: vh },
    rect: {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      top: Math.round(rect.top), bottom: Math.round(rect.bottom),
      right: Math.round(rect.right),
    },
    heightPct: +(rect.height / vh * 100).toFixed(2),
    widthPct: +(rect.width / vw * 100).toFixed(2),
    extendsPastBottom: rect.bottom > vh + 1,
    extendsPastTop: rect.top < -1,
    extendsPastRight: rect.right > vw + 1,
    body: {
      present: !!body,
      scrolls: body ? body.scrollHeight > body.clientHeight + 1 : false,
      overflowPx: body ? Math.max(0, body.scrollHeight - body.clientHeight) : null,
      pastViewport: bodyRect ? bodyRect.bottom > vh + 1 : false,
    },
    typeSizes,
    typeSizesRaw,
    typeSizeCount: typeSizes.length,
    textNodes: visibleText.length,
    characters: visibleText.reduce((sum, t) => sum + t.text.length, 0),
    innerTextChars: (dialog.innerText || '').replace(/\\s+/g, ' ').trim().length,
    largestBlock: blocks.length
      ? { chars: blocks[0].chars, tag: blocks[0].tag, id: blocks[0].id, cls: blocks[0].cls, preview: blocks[0].preview }
      : null,
    topBlocks: blocks.slice(0, 5).map(b => ({ chars: b.chars, tag: b.tag, id: b.id, preview: b.preview.slice(0, 80) })),
    clipped,
    clippedCount: clipped.length,
    overflowing,
    overflowingCount: overflowing.length,
    focusInside,
    activeElement: active ? active.tagName + (active.id ? '#' + active.id : '') : null,
    controls: controlEls.length,
    controlList: controlEls.slice(0, 24).map(el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('id') || el.tagName).replace(/\\s+/g, ' ').trim().slice(0, 40)),
    headings,
    headingCount: headings.length,
    digest: headings.join(' | ').slice(0, 400),
  };
})`;

/**
 * The bottom watch strip — the other pop-up surface of the atlas. It is
 * measured once per page, before any dialog is opened, so the numbers are
 * read off the live surface rather than through a modal backdrop.
 */
const MEASURE_WATCH = `(() => {
  const strip = document.querySelector('.atlas-watch');
  if (!strip) return null;
  const visible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
  };
  const r = strip.getBoundingClientRect();
  const vh = window.innerHeight;
  const items = Array.from(strip.querySelectorAll('.atlas-watch-item')).filter(visible);
  const clipped = [];
  const sizes = new Set();
  for (const item of items) {
    const parts = [item.querySelector('.watch-symbol'), item.querySelector('.watch-label'), item.querySelector('strong')].filter(Boolean);
    for (const part of parts) {
      const s = getComputedStyle(part);
      sizes.add(s.fontSize);
      const cut = (s.overflowX === 'hidden' || s.overflowX === 'clip') && part.scrollWidth > part.clientWidth + 1
        || (s.overflowY === 'hidden' || s.overflowY === 'clip') && part.scrollHeight > part.clientHeight + 1;
      if (cut) clipped.push({
        id: item.id || '',
        cls: (item.getAttribute('class') || '').slice(0, 40),
        text: (part.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      });
    }
  }
  const typeSizes = Array.from(sizes)
    .map(value => parseFloat(value))
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => a - b);
  return {
    height: Math.round(r.height),
    width: Math.round(r.width),
    heightPct: +(r.height / vh * 100).toFixed(2),
    items: items.length,
    clipped,
    clippedCount: clipped.length,
    typeSizes,
    typeSizesRaw: Array.from(sizes).sort(),
    typeSizeCount: typeSizes.length,
    values: items.map(item => {
      const value = item.querySelector('strong');
      return {
        id: item.id || '',
        label: (item.querySelector('.watch-label') || {}).textContent || '',
        value: value ? (value.textContent || '').trim() : '',
      };
    }),
  };
})()`;

/**
 * The splash lifts on the first styled frame and the watch fills from the
 * API. The dialogs are opened on a live surface, so the audit waits for the
 * splash to lift; a watch that never fills is recorded, not waited on
 * forever. The splash's own text is kept, so a page that never lifted it
 * says why instead of only that it did not.
 */
const READY = `(() => {
  const splash = document.querySelector('#atlas-map-loading');
  const splashGone = !splash || getComputedStyle(splash).display === 'none' || splash.classList.contains('loaded');
  const watch = document.querySelector('#atlas-watch-air-value');
  const watchFilled = !!watch && watch.textContent.trim() !== '' && watch.textContent.trim() !== '—';
  const splashText = splash ? (splash.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160) : '';
  const failed = !!splash && /unavailable|failed/i.test(splash.textContent || '');
  return { splashGone, watchFilled, failed, splashText, ready: splashGone && watchFilled && !failed };
})()`;

const CONSOLE_ERRORS = `(() => {
  const sink = window.__mshConsoleErrors || [];
  return sink.slice(0, 12);
})()`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Open a dialog through the product's own control.
 *
 * The preferred route is a real mouse event at the control's centre, so the
 * atlas's own click handler runs exactly as it runs for a reader. When the
 * control cannot be reached at that point, the click is dispatched on the
 * element itself; which route was used is recorded in every row, so the
 * evidence never claims a fidelity it does not have.
 */
async function openDialog(session, id) {
  let controls = await session.evaluate(call(FIND_CONTROLS, id));
  if (!controls || !controls.count) {
    return { opened: false, reason: 'no-control-found', clickMethod: null };
  }

  let pick = controls.info.find(c => c.visible);
  if (!pick) {
    // The control lives inside the collapsed Map menu. Open the menu, then
    // look again for a control the reader could actually hit.
    await session.evaluate(call(OPEN_DETAILS, id));
    await sleep(400);
    controls = await session.evaluate(call(FIND_CONTROLS, id));
    pick = controls.info.find(c => c.visible);
  }
  if (!pick) {
    return { opened: false, reason: 'control-not-visible', clickMethod: null, controls: controls.info.length };
  }

  const hit = await session.evaluate(call(HIT_TEST, id, pick.index, pick.x, pick.y));
  let method = hit.hit ? 'cdp-mouse' : 'dom-click';

  if (method === 'cdp-mouse') {
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pick.x, y: pick.y, buttons: 0 });
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pick.x, y: pick.y, button: 'left', clickCount: 1, buttons: 1 });
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pick.x, y: pick.y, button: 'left', clickCount: 1, buttons: 0 });
  } else {
    await session.evaluate(call(DOM_CLICK, id, pick.index));
  }

  let open = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(150);
    open = await session.evaluate(call(IS_OPEN, id));
    if (open) break;
  }

  if (!open && method === 'cdp-mouse') {
    // The point was covered by something else. Fall back to a click on the
    // element itself and say so in the row.
    method = 'cdp-mouse→dom-click';
    await session.evaluate(call(DOM_CLICK, id, pick.index));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(150);
      open = await session.evaluate(call(IS_OPEN, id));
      if (open) break;
    }
  }

  return {
    opened: open,
    reason: open ? null : 'click-did-not-open',
    clickMethod: method,
    control: { tag: pick.tag, id: pick.id, text: pick.text },
  };
}

/** Close the dialog with a real Escape key, the way a reader does. */
async function closeWithEscape(session, id) {
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Escape', code: 'Escape',
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Escape', code: 'Escape',
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });

  let closed = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await sleep(100);
    closed = !(await session.evaluate(call(IS_OPEN, id)));
    if (closed) break;
  }
  if (!closed) await session.evaluate(call(FORCE_CLOSE, id));
  return closed;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = OUT || `docs/evidence/msh-dialogs-${stamp}`;
  mkdirSync(outDir, { recursive: true });

  const rows = [];
  const watchRows = [];
  const pageRows = [];

  // Each page is measured in its own browser. A second navigation inside one
  // browser leaves the previous page's WebGL context alive, and the atlas's
  // map then never renders — the splash stays up and the map-backed panels
  // stay empty. That is a fault of the harness, not of the product, so the
  // browser is thrown away and a fresh one is launched for every page.
  for (const viewport of VIEWPORTS) {
    for (const lang of LANGUAGES) {
      const { session, close } = await launch();
      try {
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
        // the API. Wait for the surface to be live before opening a dialog.
        let ready = { ready: false, splashGone: false, watchFilled: false, splashText: '' };
        for (let attempt = 0; attempt < 40; attempt += 1) {
          ready = await session.evaluate(READY);
          if (ready?.splashGone && !ready?.failed) break;
          await sleep(500);
        }
        await session.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
        await sleep(500);

        // The splash is a property of the page, not of any one dialog, so it
        // is judged once per page and reported once per page.
        const pageIssue = ready?.splashGone
          ? null
          : `splash never lifted: "${(ready?.splashText || '').slice(0, 80) || 'empty'}"`;
        pageRows.push({
          url,
          viewport: `${viewport.width}x${viewport.height}`,
          lang,
          ready: !!ready?.ready,
          splashGone: !!ready?.splashGone,
          splashText: ready?.splashText || '',
          mapFailed: !!ready?.failed,
          watchFilled: !!ready?.watchFilled,
          issue: pageIssue,
        });

        const watchStrip = await session.evaluate(MEASURE_WATCH);
        watchRows.push({
          url,
          viewport: `${viewport.width}x${viewport.height}`,
          lang,
          ready: !!ready?.ready,
          splashGone: !!ready?.splashGone,
          watchFilled: !!ready?.watchFilled,
          watchStrip,
        });

        for (const id of DIALOGS) {
          const row = {
            dialog: id,
            viewport: `${viewport.width}x${viewport.height}`,
            width: viewport.width,
            height: viewport.height,
            lang,
            url,
            lens: LENS,
            pageReady: !!ready?.ready,
            splashGone: !!ready?.splashGone,
            splashText: ready?.splashText || '',
            watchFilled: !!ready?.watchFilled,
          };

          try {
            const opened = await openDialog(session, id);
            row.opened = !!opened.opened;
            row.openReason = opened.reason;
            row.clickMethod = opened.clickMethod;
            row.control = opened.control || null;

            if (!opened.opened) {
              await session.evaluate(call(FORCE_CLOSE, id)).catch(() => {});
              row.failed = ['open'];
              row.failures = [`open: ${opened.reason}`];
              rows.push(row);
              console.log(`  ${id} ${viewport.width}x${viewport.height} ${lang}: NOT OPENED — ${opened.reason}`);
              continue;
            }

            // Let the dialog's own content arrive before it is measured.
            let content = { settled: false, loading: false, chars: 0 };
            for (let attempt = 0; attempt < 12; attempt += 1) {
              content = await session.evaluate(call(CONTENT_STATE, id));
              if (content?.settled) break;
              await sleep(500);
            }
            row.contentSettled = !!content?.settled;
            row.contentStillLoading = !!content?.loading;

            const measured = await session.evaluate(call(MEASURE_DIALOG, id));
            Object.assign(row, measured);
            row.watchStrip = watchStrip;
            // A dialog that opened but showed almost nothing is reported as
            // the measurement it is, not as a pass with a caveat.
            row.contentEmpty = row.characters < 50;

            if (SHOTS) {
              const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
              const file = `${outDir}/${id}-${viewport.width}x${viewport.height}-${lang}.png`;
              writeFileSync(file, Buffer.from(shot.data, 'base64'));
              row.screenshot = file;
            }

            const closed = await closeWithEscape(session, id);
            row.closedWithEscape = closed;

            // The checks, in the order the header comment defines them.
            const failures = [];
            if (!row.opened) failures.push('open');
            if (row.extendsPastBottom) failures.push(`bottom: dialog bottom ${row.rect?.bottom} > viewport ${row.height}`);
            if (row.clippedCount > 0) failures.push(`clipped: ${row.clippedCount} text element(s)`);
            if (row.typeSizeCount > 3) failures.push(`type: ${row.typeSizeCount} distinct font sizes (${row.typeSizes.join(', ')})`);
            if (row.largestBlock && row.largestBlock.chars > 600) failures.push(`block: ${row.largestBlock.chars} chars in one ${row.largestBlock.tag}${row.largestBlock.id ? '#' + row.largestBlock.id : ''}`);
            if (!row.closedWithEscape) failures.push('escape: dialog did not close');

            row.failed = failures.length > 0;
            row.failures = failures;
            rows.push(row);

            console.log(
              `  ${id} ${viewport.width}x${viewport.height} ${lang}: ` +
              `${row.rect?.height}px (${row.heightPct}% of ${row.height}) · ` +
              `${row.typeSizeCount} sizes · ${row.characters} chars / ${row.textNodes} nodes · ` +
              `max block ${row.largestBlock?.chars ?? 0} · ${row.controls} controls · ` +
              `focus ${row.focusInside ? 'in' : 'OUT'} · escape ${row.closedWithEscape ? 'closed' : 'FAILED'}` +
              (row.contentEmpty ? ' · EMPTY' : '') +
              (row.failed ? ` · ✗ ${failures.join(' | ')}` : ''),
            );
          } catch (error) {
            row.opened = row.opened ?? false;
            row.failed = true;
            row.failures = [`measurement-error: ${error.message}`];
            row.openReason = row.openReason || error.message;
            rows.push(row);
            console.log(`  ${id} ${viewport.width}x${viewport.height} ${lang}: ERROR — ${error.message}`);
            await session.evaluate(call(FORCE_CLOSE, id)).catch(() => {});
          }
        }
      } finally {
        await close();
      }
    }
  }

  const payload = {
    auditedAt: new Date().toISOString(),
    url: BASE,
    viewports: VIEWPORTS.map(v => `${v.width}x${v.height}`),
    languages: LANGUAGES,
    lens: LENS,
    dialogs: DIALOGS,
    checks: {
      open: 'the dialog must open through its own [data-open] control',
      bottom: 'the dialog box must not extend past the bottom of the viewport',
      clipped: 'no text element inside the dialog may be clipped (cut off with no way to reach it)',
      type: 'no more than three distinct font sizes inside the dialog',
      block: 'no single text block inside the dialog may exceed 600 characters',
      escape: 'the dialog must close when Escape is pressed',
      page: 'the page must have lifted its loading splash before measurement (judged once per page, not once per dialog)',
    },
    cases: rows.length,
    failingCases: rows.filter(r => r.failed).length,
    pages: pageRows,
    watch: watchRows,
    rows,
  };
  writeFileSync(`${outDir}/geometry.json`, `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(`${outDir}/msh-record.json`, `${JSON.stringify(payload, null, 2)}\n`);

  const failures = rows.filter(r => r.failed);
  const pageFailures = pageRows.filter(p => p.issue);
  console.log(`\n✓ Measured ${rows.length} dialog cases → ${outDir}/geometry.json`);
  console.log(`✓ ${watchRows.length} watch-strip measurements → ${outDir}/msh-record.json`);
  if (pageFailures.length) {
    console.log(`✗ ${pageFailures.length} of ${pageRows.length} page(s) did not reach a live surface:`);
    for (const page of pageFailures) {
      console.log(`    ${page.viewport} ${page.lang} — ${page.issue}`);
    }
  }
  if (failures.length) {
    console.log(`✗ ${failures.length} of ${rows.length} case(s) failed:`);
    for (const row of failures) {
      console.log(`    ${row.dialog} ${row.viewport} ${row.lang} — ${(row.failures || []).join(' | ')}`);
    }
    process.exitCode = 1;
  } else if (pageFailures.length) {
    process.exitCode = 1;
  } else {
    console.log('✓ every case passed every check');
  }
}

main().catch(error => {
  console.error(`MSH dialog audit failed: ${error.message}`);
  process.exitCode = 1;
});
