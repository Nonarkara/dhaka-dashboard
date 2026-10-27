// Load the pinned MapLibre module before the atlas client; keep text fallback on failure.
const atlasClientUrl = document.currentScript.dataset.app || '/app.js';
import('/vendor/maplibre-6.4.1/maplibre-gl.mjs')
  .then((library) => {
    window.maplibregl = library.default || library;
  })
  .catch((error) => {
    console.error('MapLibre module unavailable', error);
  })
  .finally(() => {
    const script = document.createElement('script');
    script.src = atlasClientUrl;
    document.body.appendChild(script);
  });
