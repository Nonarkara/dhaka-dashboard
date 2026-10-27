# Dhaka: map first, decisions with evidence

The first task is to locate and inspect a place. The old four-band header consumed about 181 px at 390 px width. Budget: a single 48 px toolbar at 390, 1024 and 1440 px; no horizontal reading rail. Lens descriptions and source qualifications remain in a map-side disclosure. Settings stay beside the lens choice. Expanded evidence may occupy space deliberately; default map must start at y=48, and retain at least 60% of viewport height. Full Bengali labels, keyboard controls, source failures and playback must be checked, including 1280×720.

Typography: Barlow Semi Condensed 400/500/600 for Latin; Hind Siliguri 400/500/600 for Bengali, locally served, SIL OFL licenses in public/fonts. Compact infrastructural lettering gives Dhaka its own voice. Values use tabular numerals, not a third decorative face.

Building categories use actual OSM tags, never height, proximity or random color. Sanzo Wada Plate 001 (Palette 1: English Red #d96629 and Cerulian Blue #0093a5) sets the tone for the entire system:
- **Civic & Government (Palette 1 Anchor 1)**: English Red `#d96629`
- **Commerce & Corporate Office (Palette 1 Anchor 2)**: Cerulian Blue `#0093a5`
- **Retail & Markets**: Warm Amber `#e2953b`
- **Apartments & Towers**: Terracotta Brick `#d17b58`
- **Houses & Residential**: Isabella Sand `#c5a56e`
- **Mosques & Places of Worship**: Mosque Jade Teal `#2d8a88`
- **Education & Campuses**: Academic Lapis `#2563a8`
- **Healthcare & Hospitals**: Medical Celadon `#10b981`
- **Industry & RMG Factories**: Industrial Slate `#5a6772`
- **General / Unknown**: Neutral Ground `#b4b0a3` marks unclassified footprints. Streamed OpenFreeMap vector tiles map available class/use tags.

Spatial Hallucination (SH) Elimination: Overlays are budgeted strictly to prevent map obstruction. The atlas menu bar is halved from 300 px to 150 px with single-column vertical micro-controls; the map key is budgeted to 150 px; the forecast playback panel is halved from 560 px to 280 px; and the observation HUD is tightened from 310 px to 220 px. This preserves the maximum possible operating viewport for the hero 3D map. Height provenance and Parliament courtyards remain intact.

Operational requirements distilled from a private delegate discussion: policy decisions, improvement without demolition/displacement, upstream-driven northeast flash floods, agricultural warning lead time, forecast accuracy and agency implementation. No private transcript is distributed. The talk's numerical accuracy claims are unvalidated and excluded.

The outlook is a model playback, paused by default. CAMS global PM2.5 uses native-scale cells, three-hour frames and a fixed concentration scale. GloFAS discharge uses daily model reaches and ensemble quartiles. Model issue time is not exposed by the provider and remains null; retrieval and valid times are separate. Missing values stay missing.

### Northeast Agricultural Early Warning & Harvest Decision Advisory
In the Northeast Haor Basin (Sunamganj, Sylhet, Netrokona, Kishoreganj), Boro rice is the sole annual crop. Pre-monsoon flash floods originate from heavy rainfall over the Meghalaya/Assam hills (Cherrapunji) and enter through 4 gateway reaches:
- **Jadukata River · Tahirpur / Lorergorh**: Tanguar & Shanir Haor entry (Bankfull 350 m³/s, Alert 600 m³/s).
- **Surma River · Sunamganj Sadar**: Dekhar & Karchar Haor depression (Bankfull 550 m³/s, Alert 900 m³/s).
- **Kushiyara River · Amalshid / Zakiganj**: Hakaluki Haor corridor (Bankfull 1,200 m³/s, Alert 1,800 m³/s).
- **Upper Surma · Sylhet Sadar**: Upper Surma Valley (Bankfull 400 m³/s, Alert 700 m³/s).

From the 10-day GloFAS v4 hydrograph, the system calculates peak surge magnitude, peak arrival timestamp ($T_{peak}$), and lead hours. This drives an agricultural decision advisory matching Department of Agricultural Extension (DAE) and Bangladesh Rice Research Institute (BRRI) protocols:
- **Surge Alert (<72h lead time, discharge > alert/bankfull)**: Emergency early harvest of Boro paddy ≥80% ripe immediately to prevent 100% submersion loss from overtopping submersible dykes (ডুবন্ত বাঁধ).
- **Flood Watch (3–5 days lead time)**: Mobilize combine harvesters and community labor; track Cherrapunji upstream rainfall.
- **Normal Flow**: Defer harvesting; allow grain filling to reach 100% full ripening for maximum agricultural yield.

### Scientific Demarcation: Channel Discharge vs Field Inundation
River discharge ($m^3/s$) establishes upstream volume, rate of rise, and arrival lead time ($T_{arrival}$). However, whether individual agricultural plots or roads flood depends on local Digital Elevation Models (DEM) and the crest elevation and condition of BWDB submersible dykes (ডুবন্ত বাঁধ). When river flow exceeds bankfull capacity, submersible dykes face overtopping. Official surveyed water levels and warning stages are maintained by BWDB / FFWC at https://ffwc.gov.bd .

Sources: https://open-meteo.com/en/docs/air-quality-api ; https://open-meteo.com/en/docs/flood-api ; https://global-flood.emergency.copernicus.eu/general-information/about-glofas/ . Official warnings: https://ffwc.gov.bd .
