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
- **General / Unknown**: Neutral Ground `#b4b0a3` marks unclassified footprints. Streamed tiles without mapped use tags remain unknown.

Spatial Hallucination (SH) Elimination: Overlays are budgeted strictly to prevent map obstruction. The atlas menu groups its controls without clipping or shrinking readable labels; the map key fits its labels; the forecast playback panel groups model values with playback controls; and the observation HUD is tightened from 310 px to 220 px. This preserves the maximum possible operating viewport for the hero 3D map. Height provenance and Parliament courtyards remain intact.

### Satellite Observation, Atmospheric Modeling & 3D Spatial Geometry
Satellite rasters come from NASA GIBS (WMTS, `epsg3857/best`). Every layer id, tile matrix set and file format is validated against the GIBS capabilities catalogue by `scripts/test-environment-contract.mjs`, and `scripts/verify-gibs-live.mjs` confirms at release time that the tiles still return imagery over Dhaka. GIBS publishes each product on its own latency, so the observation date is resolved by probing candidate dates rather than assumed, and the resolved date is printed in the lens status strip. A layer with no observation reports `unavailable` with a `reasonCode` — it never renders an empty raster as if it were data.

GIBS also publishes a date directory before the observation behind it has been ingested, and serves that date as a fully blank placeholder tile: HTTP 200, non-empty, opaque, one uniform colour. A status check or a byte count accepts it, and painting it would cover the map with a white square. The observation date is therefore accepted only after the tile is **decoded** and shown to carry content (`src/gibs-png.ts`; the browser decodes with a canvas, the Worker with `DecompressionStream`). The browser resolves the date at runtime; the Worker uses the GIBS capabilities catalogue as its floor.

- **NASA Aerosol Optical Depth (AOD)**: NASA MODIS MAIAC L2G (1 km product, served on GIBS `GoogleMapsCompatible_Level7` tiles) daily atmospheric aerosol column density, measuring transboundary particulate loading and winter smoke over the Bengal Basin.
- **Satellite Cloud Reflectance**: NASA VIIRS NOAA-20 corrected true-colour surface reflectance (`Level9`, JPEG), daily.
- **Night-Time Radiance**: NASA VIIRS Suomi NPP Day/Night Band radiance (`Level7`), the Black Marble family product, daily.
- **Flood Inundation**: NASA VIIRS combined flood detection, 1-day window (`Level9`), daily.
- **Doppler Rain Radar Playback**: Dynamic RainViewer Doppler radar loop cycling past observation frames with BST timestamps, displaying precipitation movement across the delta.
- **Catchment Rainfall Modeling**: Modeled 24-hour precipitation accumulation across 5 Greater Dhaka drainage basins (Buriganga, Turag, Balu, Tongi North, Savar West) with intensity-coded badges and interactive hydrologic observation cards.
- **Winter Smoke Transport & Brick Kiln Arcs**: Live 10m surface wind vectors from Open-Meteo coupled with spatial kiln clusters in Savar, Gazipur, Keraniganj, and Narayanganj, illustrating seasonal particulate drift into central Dhaka.
- **3D Architectural Sun Lighting & Cinematic Camera Choreography**: Directional sun lighting (`intensity: 0.55, position: [1.3, 110, 45]`) renders authentic architectural relief and depth on 3D building extrusions. Lens transitions smoothly fly to authored scale, pitch, and bearing configurations.

Operational requirements distilled from a private delegate discussion: policy decisions, improvement without demolition/displacement, upstream-driven northeast flash floods, agricultural warning lead time, forecast accuracy and agency implementation. No private transcript is distributed. The talk's numerical accuracy claims are unvalidated and excluded.

The outlook is a model playback, paused by default. CAMS global PM2.5 uses native-scale cells, three-hour frames and a fixed concentration scale. GloFAS discharge uses daily model reaches and ensemble quartiles. Model issue time is not exposed by the provider and remains null; retrieval and valid times are separate. Missing values stay missing.

### Northeast river outlook and decision limits

The delegates' need for agricultural warning lead time is retained as a product requirement. It is not satisfied by attaching uncited channel-capacity numbers to a daily global model. The audit reproduced seven-day peaks reported as arriving within 72 hours, and absent values reported as safe. The earlier DAE/BRRI-attributed harvest/defer advice was not backed by a connected official advisory or local crop observations.

Four geographic queries remain near Sunamganj, Sylhet, Zakiganj and Tahirpur. The API can select a different river within its search radius; place names describe query context, not verified river or warning-station identity. Actual returned coordinates stay visible. All cells use a neutral categorical color, with no safe/watch/alert classification.

Each reach retains its selected daily modeled discharge and ensemble quartiles. A maximum across available daily samples is labeled as an available-series maximum with its UTC model date and usable-day count. It supplies neither flash-flood arrival time nor a local warning threshold. A declining series, a zero value and absent values all leave warning and harvest status unavailable.

Field inundation requires a calibrated terrain/hydraulic model and local validation. Operational agricultural advice also requires official warning inputs, crop maturity, embankment condition and an established advisory workflow. The interface links to FFWC for official bulletins. No generic harvest or defer recommendation is inferred.

### National instruments

The unfinished clock/economy band is integrated through a bounded national-data disclosure. Bangladesh time uses the device clock with an explicit label, independent of cached server responses. World Bank WDI values retain annual periods and source links; they do not become live economic measurements. A CC0 daily FX reference retains its data date and is never labeled a live tradable rate. Latest valid dated observations are selected after country, indicator, number and period checks. Missing feeds show reason codes and timestamps; full evidence remains available at phone widths.

### Geometry audit

A compact map toolbar remains 48px. Density cannot be achieved with 24px targets, clipped labels or unreadable microtype. Map settings use complete wrapping labels and at least 36px controls. The building key expands to its content, and the player keeps readable qualifications beside play and scrub. Populated phone, tablet, desktop, Bengali and error states are measured and independently reviewed before release.

Sources: https://open-meteo.com/en/docs/air-quality-api ; https://open-meteo.com/en/docs/flood-api ; https://github.com/fawazahmed0/exchange-api ; https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries . Official warnings: https://ffwc.gov.bd .
