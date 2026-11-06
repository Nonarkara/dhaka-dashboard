// What does the walk lens actually do?
//
// The walkthrough claims a camera height and a building count. Both are
// read back here from the rendered page — the camera from the walk's own
// measurement, the count from the panel — so a claim and a reading can be
// compared instead of assumed equal.
import { launch } from './lib/cdp.mjs';

const url = (process.env.ATLAS_URL || 'http://localhost:8787') + '/?lang=en&lens=walk';
const width = Number(process.env.PROBE_WIDTH || 1440);
const height = Number(process.env.PROBE_HEIGHT || 900);
const zoom = process.env.PROBE_ZOOM ? Number(process.env.PROBE_ZOOM) : null;

const { session, close } = await launch();
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = session.once('Page.loadEventFired', 60000);
  await session.send('Page.navigate', { url });
  await loaded.catch(() => {});
  await wait(4000);

  // The districts arrive after the map does. The walk is standing only
  // once they have, so the probe waits for that rather than for a fixed
  // number of milliseconds.
  const deadline = Date.now() + 40000;
  let standing = false;
  while (Date.now() < deadline) {
    standing = await session.evaluate(`(() => {
      const m = window.AtlasMap && window.AtlasMap.instance;
      return !!m && m.getZoom() > 15 && m.getPitch() > 80
        && document.querySelectorAll('#atlas-walk-route .atlas-walk-stop').length > 0;
    })()`);
    if (standing) break;
    await wait(1000);
  }
  await wait(3500);

  const report = await session.evaluate(`(() => {
    const m = window.AtlasMap && window.AtlasMap.instance;
    const walk = window.AtlasWalk;
    const measured = walk && walk.measure ? walk.measure() : null;
    const panel = document.getElementById('atlas-walk');
    const mapRect = document.getElementById('atlas-map')?.getBoundingClientRect();
    const panelRect = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    const covered = [];
    if (mapRect && panelRect) {
      const x = Math.max(mapRect.left, panelRect.left);
      const y = Math.max(mapRect.top, panelRect.top);
      const w = Math.min(mapRect.right, panelRect.right) - x;
      const h = Math.min(mapRect.bottom, panelRect.bottom) - y;
      covered.push({ x, y, w, h });
    }
    const area = mapRect ? mapRect.width * mapRect.height : 0;
    const over = covered.reduce((sum, r) => sum + Math.max(0, r.w) * Math.max(0, r.h), 0);
    return {
      lens: document.getElementById('atlas-lens')?.value,
      zoom: m ? +m.getZoom().toFixed(3) : null,
      pitch: m ? +m.getPitch().toFixed(2) : null,
      bearing: m ? +m.getBearing().toFixed(1) : null,
      centre: m ? { lat: +m.getCenter().lat.toFixed(6), lng: +m.getCenter().lng.toFixed(6) } : null,
      status: document.getElementById('atlas-walk-status')?.textContent,
      counts: document.getElementById('atlas-walk-counts')?.textContent,
      stops: document.querySelectorAll('#atlas-walk-route .atlas-walk-stop').length,
      itineraryOpen: document.getElementById('atlas-walk-itinerary')?.open ?? null,
      panelHeight: panelRect ? Math.round(panelRect.height) : null,
      mapHeight: mapRect ? Math.round(mapRect.height) : null,
      unobscured: area ? +(1 - over / area).toFixed(4) : null,
      measured: measured && {
        heightM: +measured.heightM.toFixed(2),
        horizonY: +measured.horizonY.toFixed(1),
        focalPx: Math.round(measured.focalPx),
        rows: measured.rows,
      },
      walkMassing: m && m.getLayer ? m.getLayoutProperty('walk-massing', 'visibility') : null,
      scout: document.getElementById('atlas-walk-scout')?.getAttribute('href'),
    };
  })()`);

  console.log(JSON.stringify(report, null, 1));

  if (zoom !== null) {
    await session.evaluate(`window.AtlasMap.instance.jumpTo({ zoom: ${zoom} })`);
    await wait(2500);
    const after = await session.evaluate(`(() => {
      const measured = window.AtlasWalk.measure();
      return {
        zoom: +window.AtlasMap.instance.getZoom().toFixed(2),
        status: document.getElementById('atlas-walk-status')?.textContent,
        measured: measured && { heightM: +measured.heightM.toFixed(2), focalPx: Math.round(measured.focalPx) },
      };
    })()`);
    console.log('after zoom override:', JSON.stringify(after));
  }
} finally {
  await close();
}
