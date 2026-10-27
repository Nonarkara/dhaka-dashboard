// Put the pinned MapLibre module on window before app.js runs.
import * as maplibregl from '/vendor/maplibre-6.4.1/maplibre-gl.mjs';
window.maplibregl = maplibregl;
