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
  await wait(14000);

  const out = await session.evaluate(`(() => {
    const m = window.AtlasMap.instance;
    const rasters = m.getStyle().layers.filter(l => l.type === 'raster').map(l => l.id);
    const info = {};
    for (const id of rasters) {
      info[id] = {
        visibility: m.getLayoutProperty(id, 'visibility'),
        opacity: m.getPaintProperty(id, 'raster-opacity'),
        brightnessMax: m.getPaintProperty(id, 'raster-brightness-max'),
        saturation: m.getPaintProperty(id, 'raster-saturation'),
      };
    }
    const net = performance.getEntriesByType('resource')
      .filter(e => /arcgisonline/.test(e.name))
      .map(e => ({ url: e.name.slice(-60), z: (e.name.match(/\/tile\/(\d+)\//) || [])[1], status: e.responseStatus, bytes: e.transferSize, dur: Math.round(e.duration) }));
    const byZ = {};
    for (const n of net) {
      const k = n.z + ':' + n.status;
      byZ[k] = (byZ[k] || 0) + 1;
    }
    return {
      pitch: m.getPitch(), zoom: m.getZoom(),
      rasters: info,
      rasterRequests: net.length,
      byZoomStatus: byZ,
      sample: net.filter(n=>n.z==='19').slice(0,4),
      footprintOpacity: m.getLayer('city-footprints') ? m.getPaintProperty('city-footprints', 'fill-opacity') : null,
      footprintVisible: m.getLayer('city-footprints') ? m.getLayoutProperty('city-footprints', 'visibility') : null,
    };
  })()`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await close();
}
