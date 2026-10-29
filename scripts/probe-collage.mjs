/**
 * Live probe of the collage builder.
 * Not part of the test suite — this is the instrument used to read the
 * collage as an operator would, before it goes anywhere near the UI.
 */
import { readFileSync } from "node:fs";
import { buildCollage } from "../src/collage.ts";

const areas = JSON.parse(readFileSync("public/dhaka-areas.json", "utf8"));
const districts = areas.map((a) => ({
  id: a.id,
  name: a.name,
  name_bn: a.name_bn,
  category: a.category ?? "",
  lat: a.lat,
  lng: a.lng,
}));

console.log(`measuring ${districts.length} districts × 5 signals…`);
const collage = await buildCollage(districts);
console.log(`status ${collage.status} · ${collage.measured}/${collage.total} measurements ok`);

for (const d of collage.districts) {
  console.log(`\n── ${d.name}  (${d.name_bn})`);
  for (const m of d.measurements) {
    console.log(
      `   ${m.label.padEnd(24)} ${m.status === "ok" ? `${String(m.value).padStart(9)} ${m.unit.padEnd(12)} cov ${(m.coverage * 100).toFixed(0)}%  ${m.observationDate}${m.censored ? " (censored)" : ""}` : `unavailable · ${m.reasonCode}`}`,
    );
  }
  for (const r of d.readings) {
    if (r.status === "ok") console.log(`   [${r.domain}] ${r.reading}`);
  }
}
