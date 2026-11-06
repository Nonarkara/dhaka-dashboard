import {readFileSync} from 'node:fs';
import {sha256,verifyAsset} from './lib/verify-asset.mjs';
const base=process.env.ATLAS_URL || 'https://dhaka.nonarkara.org';
for(const file of ['index.html','research.html','theme.js','i18n.js','dhaka-landmarks.geojson','dhaka-mrt.geojson','parliament-reference.html','parliament-reference.js','parliament-reference.css','vendor/three-0.168.0/three.module.js','app.js','walk.js','loader.js','design.js','forecast.js','instruments.js','collage.js','people.js','data/ddm-source-review.json','data/people-manifest.json','data/people-grid.json','data/facilities.geojson','dashboard.js','style.css','dhaka-design.css','translations.js','dhaka-rivers.geojson','dhaka-economy.geojson','dhaka-areas.json','data/parliament-buildings.geojson',...['BarlowSemiCondensed','HindSiliguri'].flatMap(f=>['Regular','Medium','SemiBold'].map(w=>`fonts/${f}-${w}.woff2`))]) {
  const url=new URL(file==='index.html'?'/':`/${file}`,base);
  await verifyAsset(url,sha256(readFileSync(new URL(`../public/${file}`,import.meta.url))),{notice:console.log});
}
console.log('✓ Live SHA-256 matches for HTML, client scripts, styles, translations and reference layers');
