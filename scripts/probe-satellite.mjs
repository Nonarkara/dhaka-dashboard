/**
 * Live probe of the satellite measurement engine.
 * Not part of the test suite — this is the instrument used to check that the
 * engine reads real physical values out of real GIBS tiles.
 */
import { measureLayerAt, MEASURED_LAYERS, groundResolutionM, tileForPoint } from "../src/satellite.ts";

const POINTS = [
  { id: "motijheel", lat: 23.733, lng: 90.4172 },
  { id: "savar-ashulia", lat: 23.8583, lng: 90.2667 },
  { id: "narayanganj", lat: 23.6238, lng: 90.5 },
];

for (const layer of MEASURED_LAYERS) {
  console.log(`\n══ ${layer.id}  (${layer.unit}, level ${layer.tileLevel}) ══`);
  const t = tileForPoint(POINTS[0].lat, POINTS[0].lng, layer.tileLevel);
  console.log(
    `   resolution ${Math.round(groundResolutionM(layer.tileLevel, POINTS[0].lat))} m/px · tile ${t.x}/${t.y} · pixel ${t.pixelX},${t.pixelY}`,
  );
  for (const p of POINTS) {
    const m = await measureLayerAt(layer, p, 2);
    console.log(
      `   ${p.id.padEnd(16)} ${m.status.padEnd(11)} ${
        m.status === "ok"
          ? `mean ${m.mean} ${m.unit} (min ${m.min} max ${m.max}) cov ${(m.coverage * 100).toFixed(0)}% date ${m.observationDate}`
          : `reason ${m.reasonCode}`
      }`,
    );
  }
}
