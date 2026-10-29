# Free satellite and open-data sources

**A working catalogue for the Dhaka Civic Atlas.** Every entry below was
verified against the provider on 2026-10-28 from this machine. Where a source
could not be reached, that is recorded rather than smoothed over.

The question this answers: *what can a city do with satellite data it can
actually get, for free, without a licence negotiation?*

---

## 1 · The rule that decides everything

A satellite raster is not a number. It is a picture in which the picture
carries no units — the quantity lives in a separate **colour map** that maps
each pixel's palette index to a physical range.

So a measurement travels this chain:

```
capabilities  →  colour map  →  palette index  →  physical value
     ↑              ↑                ↑                ↑
  does it      what unit is      what is this      what is the
  exist?       this index?       pixel worth?      answer?
```

Break any link and you get a number, not an error. A layer id that does not
exist renders nothing. A colour map from the wrong product yields the right
shape in the wrong unit. A pixel that means "no observation" averaged into a
mean becomes a fabricated low value.

Two failure modes have already bitten this project and are now guarded by
tests:

- **The blank placeholder.** GIBS publishes a date directory before the
  observation behind it is ingested, and serves that date as a flat, opaque,
  single-colour tile. It is HTTP 200, non-empty, and looks exactly like data
  to a status check or a byte count. Only decoding it and asking how much of
  the window actually carries an observation tells the truth.
- **The open-ended bin.** A colour map's top bin is often written
  `[38.2,999999.0)`. Its midpoint is 500,018 — a colour-map artefact, not a
  radiance. Such a bin is reported as the lower bound it guarantees.

---

## 2 · NASA GIBS — the workhorse

**Global Imagery Browse Services.** 1,330 layers, no key, no registration, no
rate limit that we hit. Every layer is a WMTS tile service in EPSG:3857 with
`GoogleMapsCompatible` tile matrices, so the tile arithmetic is the standard
web-mercator pyramid.

- Capabilities: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml`
- Tiles: `…/best/{layer}/default/{date}/GoogleMapsCompatible_Level{N}/{z}/{y}/{x}.png`
- Colour maps: `https://gibs.earthdata.nasa.gov/colormaps/v1.3/{file}.xml`

The capabilities document is the authority: it names each layer's tile
matrix sets, its formats, its time dimension and its colour map. A layer's
availability and its observation dates are read from it, never guessed.

### The layers this atlas measures

| Layer | Quantity | Unit | Level | Ground resolution over Dhaka | Cadence |
|---|---|---|---|---|---|
| `VIIRS_SNPP_DayNightBand_At_Sensor_Radiance` | Night-time radiance | nW/(cm² sr) | 8 | 668 m | daily |
| `MODIS_Terra_Land_Surface_Temp_Day_TES` | Land surface temperature, day | K | 7 | 1.34 km | daily |
| `MODIS_Terra_Land_Surface_Temp_Night_TES` | Land surface temperature, night | K | 7 | 1.34 km | daily |
| `MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth` | Aerosol optical depth | 1 | 7 | 1.34 km | daily |
| `MODIS_Terra_L3_NDVI_16Day` | Vegetation index | 1 | 9 | 334 m | 16-day |
| `Landsat_Human_Built-up_And_Settlement_Extent` | Built-up and settlement | class | 12 | 42 m | static (2010) |

Night radiance is the interesting one: it is a measurement of how much
artificial light a place leaves on after dark, which makes it a proxy for
where economic activity is, and it is the same instrument for every district,
so districts can be compared.

The night-time land surface temperature is the other: the difference between
a district's day and night temperature is the urban heat island, measured
rather than asserted.

### Other GIBS layers worth knowing about

| Layer | Use | Level |
|---|---|---|
| `OPERA_L3_Dynamic_Surface_Water_Extent-Sentinel-1` | Flood extent, radar, day and night | 12 |
| `OPERA_L3_Dynamic_Surface_Water_Extent-HLS` | Flood extent, optical | 12 |
| `VIIRS_Combined_Flood_1/2/3-Day` | Multi-sensor flood detection | 9 |
| `MODIS_Combined_Flood_1/2/3-Day` | MODIS flood detection | 9 |
| `VIIRS_Black_Marble` | Night lights, gap-filled, VNP46A2 | 8 |
| `VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance` | Night radiance, NOAA-20 | 8 |
| `MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual` | Land cover classification | 8 |
| `MODIS_Aqua_L3_NDVI_Monthly`, `MODIS_Terra_L3_NDVI_16Day` | Vegetation | 7, 9 |
| `OMI_Aerosol_Optical_Depth` | Aerosol, higher precision | 6 |
| `GHRSST_L4_MUR_Sea_Surface_Temperature` | Sea surface temperature | 7 |
| `CERES_EBAF_TOA_Incoming_Solar_Flux_Monthly` | Solar flux | 6 |

**Licence.** NASA data is generally free and open; GIBS serves imagery for
scientific and public use. Attribute NASA EOSDIS / GIBS and the individual
mission.

---

## 3 · The other free sources, verified

### ESA WorldCover — land cover at 10 m

`https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N21E090_Map.tif`

- 10 m global land cover, 2021, in 3°×3° tiles named by their south-west
  corner (`N21E090` covers Dhaka).
- Free, open, CC-BY-4.0. The S3 bucket lists without a key.
- **Verified:** tile listing and the Dhaka tile both resolve.
- **Not wired in yet:** a GeoTIFF must be parsed before it can be measured,
  and that is a different decoder from the palette-PNG one. The honest
  answer today is that the atlas measures GIBS and reports this as
  available-but-unmeasured, rather than shipping a claim it cannot back.

### JRC GHSL — population and built-up

`https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/`

- Global Human Settlement Layer: population, built-up surface, degree of
  urbanisation. 100 m and 1 km grids, Mollweide and geographic projections.
- Free, open, CC BY 4.0. The FTP-style directory listing works anonymously.
- **Verified:** the directory tree enumerates; tiles ship as
  `…_R{row}_C{col}.zip` per row/column of the Mollweide grid.
- **Not wired in yet:** the zips are large and the grid is not Web Mercator,
  so it needs its own sampling path. `dhaka-areas.json` has district centres
  but no district polygons, which a raster grid also does not need — the
  inverse-distance-weighted surface from a GHSL tile is straightforward.

### NASA POWER — the free climate and solar API

`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=90.4125&latitude=23.8103&format=JSON`

- No key. Climatology and point and daily endpoints.
- **Verified:** annual all-sky surface shortwave at Dhaka is 4.50 kWh/m²/day,
  clear-sky 5.71 kWh/m²/day — a real solar resource figure, useful for the
  Energy domain and for rooftop-PV potential.
- Caveat: POWER is a reanalysis, not a satellite observation. It is
  `modeled`, never `measured`, and must be labelled that way.

### USGS / Earth Search — Landsat scenes and STAC

- `https://stacapi.usgs.gov/stac` — **did not respond** from this machine.
- `https://earth-search.aws.element84.com/v1/search` — **responded**, and
  carries real Landsat Collection 2 Level-2 scenes over Dhaka.
- The USGS collection id is `landsat-c2l2-sr` (not `landsat-c2-l2-sr`).

### NOAA NDBC — the Bay of Bengal buoys

`https://www.ndbc.noaa.gov/data/realtime2/{id}.txt`

- Buoy 23019 returns live wind and sea-surface temperature.
- Buoys 23008 and 23219 returned 404 on the day of checking — station ids
  change, so the station list must be read live rather than assumed.

### World Bank WDI — national statistics, no key

`https://api.worldbank.org/v2/country/BGD/indicator/{CODE}?format=json&mrv=3`

- **Verified:** one indicator per call — the multi-indicator `;` form does
  not work. `lastupdated` is part of the payload.
- Indicators used: GDP, population, CPI inflation, remittances, exports,
  industry share, unemployment, official FX average, plus adult literacy,
  secondary enrolment, life expectancy, physicians per 1000, urban
  population share, tax revenue and electricity access.
- These are `reference`, not `measured`, and each keeps its own period.

### Open-Meteo — weather and air quality

- `https://api.open-meteo.com/v1/forecast` and
  `https://air-quality-api.open-meteo.com/v1/air-quality`. No key.

### Currency

- `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`
  — works, daily, CC0, with a `date` field the atlas validates.
- `https://open.er-api.com/v6/latest/USD` — works, daily.

### Overpass / OpenStreetMap — facilities

- **At capacity on the day of checking** (HTTP 502 on `overpass-api.de`, and
  the mirrors timed out). This is the honest reason the People and Smart
  living domains have no facility counts: the source exists and is free, but
  it did not answer. When it answers, the district facility counts are a
  straightforward query against the district centres.

---

## 4 · What was tried and did not work

Recorded so the next person does not repeat it.

| Attempt | Outcome |
|---|---|
| `gibs.earthdata.nasa.gov/colormaps/v1.3/GT1_BlackMarble_Default.xml` | 404 — the colour map filename is not the layer name; read the href from the capabilities document instead. |
| `jeodpp.jrc.ec.europa.eu/…/GHS_POP_E2020_…_4326_3ss_V1_0_23N090E.tif` | 404 — GHSL ships zipped row/column bundles, not per-city GeoTIFFs. |
| `data.worldpop.org/GIS/Population/…/2020_BGD_1km_Aggregated.tif` | 404 — the path has changed. |
| `data-api.globalforestwatch.org/dataset` | 404 without a version parameter. |
| `ghsl.jrc.ec.europa.eu/download.php` | 302 to a form; not an API. |
| `stacapi.usgs.gov/stac` | No response from this machine. |
| `overpass-api.de/api/interpreter` | 502 — at capacity, not down. |
| A multi-indicator World Bank request (`A;B`) | Silently ignored; one indicator per call. |

---

## 5 · What the collage is for

Seven domains, each answered by a different instrument, all measured over the
same districts on the same acquisitions:

| Domain | Signal | What it actually measures |
|---|---|---|
| Environment | day + night land surface temperature | the heat island, as a difference between two instruments |
| Environment | aerosol optical depth | how much particulate is in the column above the district |
| Environment | vegetation index | how much of the ground is still growing things |
| Energy | night radiance | how much light the district leaves on after dark |
| Economy | night radiance, ranked | where the city's work is happening, relative to the city |
| Mobility | built-up extent | how much of the ground is built, at 42 m |
| People | vegetation index, ranked | the inverse of built-up: the space left for people |
| Smart living | night heat + aerosol | where an ordinary day is most at risk |
| Governance | aerosol + built-up | where the city can see, and how sharply |

The value is not in any single row. It is in the disagreement: a district can
be hot at night, bright at midnight and almost bare of vegetation, and none
of those three facts means much on its own.

### What the satellite cannot do

Worth stating plainly, because these are the things the atlas used to claim
and no longer does:

- It cannot count workers, output or turnover. The old corridor figures —
  `workforce: 450000`, `annual_export: "$7.5B"`, `daily_turnover: "400M BDT"` —
  were typed in with no upstream and no date. They are replaced by a measured
  night radiance with an observation date and a resolution, which is a
  different and defensible claim.
- It cannot count people directly. Population needs a population product
  (GHSL, WorldPop) and a grid, not a brightness.
- It cannot read a building's use. Night radiance says a place is lit, not
  what the light is for.

---

## 6 · Keeping this honest

- `scripts/refresh-gibs-catalogue.mjs` — refreshes the 1,330-layer catalogue
  and the per-layer observation dates.
- `scripts/refresh-gibs-colormaps.mjs` — walks the capabilities document,
  follows each layer's colour-map href, and writes the value tables.
- `scripts/test-satellite-contract.mjs` — checks every layer id, level and
  unit against the catalogue, the tile arithmetic, the colour-map lookup, the
  coverage rule, the city-wide ranking, and the absence of unsourced figures.
- `scripts/mutation-check-satellite.mjs` — breaks the code each assertion
  guards and requires the test to fail every time.
- `scripts/audit-prose-numbers.mjs` — lists every number in the atlas's prose
  fields, so each one can be judged as a sourced fact or a fabrication.

---

## 7 · Sources

- NASA GIBS — https://gibs.earthdata.nasa.gov/
- NASA EOSDIS — https://www.earthdata.nasa.gov/
- NASA POWER — https://power.larc.nasa.gov/
- ESA WorldCover — https://esa-worldcover.org/
- JRC GHSL — https://ghsl.jrc.ec.europa.eu/
- NASA GIBS capabilities — https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
- USGS Landsat — https://www.usgs.gov/landsat-missions/landsat-collection-2
- Earth Search STAC — https://earth-search.aws.element84.com/
- NOAA NDBC — https://www.ndbc.noaa.gov/
- World Bank Open Data — https://data.worldbank.org/
- Open-Meteo — https://open-meteo.com/
- Fawaz Ahmed Currency API — https://github.com/fawazahmed0/exchange-api
- OpenStreetMap Overpass — https://overpass-api.de/
