import { launch } from '/Users/nonarkara/Projects/dashboards/Dhaka/scripts/lib/cdp.mjs';

const url = (process.env.ATLAS_URL || 'http://localhost:8787') + '/?lang=en&lens=walk';
const { session, close } = await launch();
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  const loaded = session.once('Page.loadEventFired', 60000);
  await session.send('Page.navigate', { url });
  await loaded.catch(() => {});
  await wait(12000);

  const out = await session.evaluate(`(() => {
    const m = window.AtlasMap.instance;
    const MERC_R = 20037508.34;
    const canvas = m.getCanvas();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const mid = h / 2, cx = w / 2;
    const centre = m.getCenter();
    const k = Math.cos(centre.lat * Math.PI / 180);
    const bearing = m.getBearing() * Math.PI / 180;
    const mercX = p => (MERC_R * p.lng) / 180;
    const mercY = p => MERC_R * Math.log(Math.tan(Math.PI / 4 + p.lat * Math.PI / 360));
    const along = p => {
      const dE = (mercX(p) - mercX(centre)) * k;
      const dN = (mercY(p) - mercY(centre)) * k;
      return { fwd: dN * Math.cos(bearing) + dE * Math.sin(bearing),
               side: dE * Math.cos(bearing) - dN * Math.sin(bearing) };
    };
    const rows = [];
    for (const fraction of [0.16, 0.26, 0.36, 0.45]) {
      const s = fraction * h;
      const y = mid + s;
      const p = m.unproject([cx, y]);
      const a = along(p);
      rows.push({ fraction, s: +s.toFixed(1), lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7),
                  fwd: +a.fwd.toFixed(2), side: +a.side.toFixed(2),
                  sideRatio: +(Math.abs(a.side) / Math.max(Math.abs(a.fwd), 1)).toFixed(4) });
    }
    // horizon: find where the unprojected points stop being monotonic
    const scan = [];
    for (let y = 0; y < h; y += 20) {
      const p = m.unproject([cx, y]);
      scan.push({ y, lat: +p.lat.toFixed(7) });
    }
    return { canvas: { w, h }, pitch: m.getPitch(), bearing: m.getBearing(),
             zoom: m.getZoom(), rows };
  })()`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await close();
}
