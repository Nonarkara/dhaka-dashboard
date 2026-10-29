# DHKx 3D Atlas & Civic Dashboard — Dhaka, block by block

**Live: [dhaka.nonarkara.org](https://dhaka.nonarkara.org)** · বাংলা / English · Phone-first

A 3D civic atlas and operational dashboard for Greater Metropolitan Dhaka where every building, river gauge, export corridor, and atmospheric sensor carries its source, collection time, reporting units, and license terms.

---

## 1. Capabilities & Lenses

DHKx bridges urban morphology, delta hydrology, macroeconomic industry, and environmental monitoring across 13 interactive lenses:

| Lens | What you see | Data Provider / Sources |
|---|---|---|
| **City in 3D** | OSM building extrusions at zoom 14+ in every 3D lens; local Parliament-area footprints preserve courtyards (mapped or estimated heights), plus satellite imagery and landmark references | OpenStreetMap / OpenFreeMap, Esri Satellite |
| **River outlook** | Northeast GloFAS daily model reaches with ensemble quartiles and available-series maxima; Dhaka reference station registry has no connected observations or calibrated warnings | Bangladesh Water Development Board (BWDB) / FFWC |
| **Economic engine** | Ready-Made Garment (RMG) export corridors, Savar DEPZ, Adamjee EPZ, Motijheel financial district, and wholesale hubs (Kawran Bazar, Islampur, Chawkbazar) | Export Promotion Bureau (EPB), Bangladesh Bank, DSE |
| **Transit & Metro** | Dhaka Metro Rail (MRT Line 6) stations, Dhaka Elevated Expressway, Kamalapur central rail terminal, and Sadarghat launch terminal | DMTCL, DTCA, Bangladesh Railway, BIWTA |
| **Air forecast** | Regional CAMS PM2.5 playback at approximately 45 km in native three-hour steps for the next 48 hours; city-center 72-hour timeline remains in the air desk | Copernicus CAMS / Open-Meteo |
| **Brick kilns & smoke** | Explicit unavailable state until FIRMS retrieval is configured; surface wind only, no 925 hPa field | NASA FIRMS (VIIRS NOAA-20 375m), ECMWF |
| **Architectural heritage** | Mughal, colonial, and modern masterworks: Lalbagh Fort (1678), Ahsan Manzil (1872), Louis Kahn's Jatiya Sangsad Bhaban (1982), Curzon Hall (1904) | Directorate of Archaeology, Survey of Bangladesh |
| **Rain · next 24 h** | Catchment-level precipitation accumulation forecasts across the Greater Dhaka river basin | Open-Meteo High-Resolution Precipitation Models |
| **Rain radar** | Live Doppler radar precipitation loop over the Bengal Delta | RainViewer Doppler Radar Mosaic |
| **Satellite clouds** | Daily true-color atmospheric cloud reflectance | NASA GIBS / NOAA-20 VIIRS True Color |
| **Night lights** | Nighttime radiance and urban electrification patterns | NASA GIBS / Suomi NPP VIIRS Black Marble (VNP46A2) |
| **Satellite flood detection** | Dated VIIRS combined one-day flood-detection imagery; not a forecast of local arrival or field impacts | NASA GIBS |
| **Satellite aerosol (AOD)** | Dated MODIS MAIAC atmospheric aerosol column; not ground-level PM2.5 | NASA GIBS |

---

## 2. Macroeconomic & Industrial Engine

The eight macroeconomic indicator definitions and industrial corridors are retained as a reference registry. Numeric values are unavailable because the original implementation supplied undated constants rather than retrieved bulletins. The interface links to providers and explicitly shows the missing dated bulletin. It must not be used as a live market or inflation monitor.

Rivers likewise retain station geography and threshold references, but current levels and trends are null until a verified observation feed is connected. Registry thresholds are unverified and are not an operational flood warning service.

---

## 3. Hydrology & River Ring

Dhaka is an island city encircled by rivers. DHKx retains six reference station locations. The benchmarks below are unverified registry entries; current observations are not connected:
- **Buriganga River at Dhaka (Mill Barrage)**: Danger Level 5.55 m MSL
- **Turag River at Mirpur**: Danger Level 5.50 m MSL
- **Balu River at Demra**: Danger Level 5.75 m MSL
- **Shitalakshya River at Narayanganj**: Danger Level 5.50 m MSL
- **Tongi Khal at Tongi**: Danger Level 6.08 m MSL
- **Dhaleshwari River at Rekabi Bazar**: Danger Level 5.18 m MSL

---

## 4. Architecture & API Endpoints

The dashboard runs on a Cloudflare Worker serving a zero-bundle-overhead static application and a public read-only API with native rate limiting (600 req/min):

| Endpoint | Method | Response & Description |
|---|---|---|
| `/api/health` | GET | Liveness, build stamp, and runtime status |
| `/api/atlas/areas` | GET | 14 curated districts with bilingual descriptions and camera coordinates |
| `/api/atlas/districts` | GET | DNCC & DSCC municipal divisions and administrative thanas |
| `/api/atlas/at-this-point?lat=&lng=` | GET | Nearest weather station, river gauge, and geographic bbox containment |
| `/api/atlas/weather` | GET | Current weather, humidity, apparent temp, and 3-day forecast |
| `/api/atlas/air-quality` | GET | City-center CAMS model timeline; seven locations are a reference registry |
| `/api/atlas/rainfall` | GET | 24-hour rainfall accumulation across 5 catchment basins |
| `/api/atlas/fires` | GET | NASA FIRMS active fire hotspots in Savar/Gazipur kiln arcs |
| `/api/atlas/wind` | GET | Modeled surface wind; pressure-level transport and pollution attribution unavailable |
| `/api/atlas/outlook?kind=air` or `kind=flood` | GET | Regional CAMS PM2.5 / GloFAS daily discharge playback; warning/arrival/harvest guidance unavailable |
| `/api/atlas/instruments` | GET | Dated national World Bank annual series and daily CC0 FX references; partial failure metadata |
| `/api/atlas/people` | GET | WorldPop 2025 population model and dated OSM facility reference manifest; asset hashes and source limits |
| `/api/atlas/environment` | GET | Dated NASA GIBS WMTS endpoints and RainViewer radar metadata |
| `/api/atlas/earthquake` | GET | USGS seismic events in the Bengal Basin and Dauki Fault zone |
| `/api/atlas/search?q=` | GET | Address geocoder bounded to Greater Dhaka |
| `/api/atlas/export` | GET | GeoJSON export of landmarks, rivers, and transit features |
| `/api/atlas/sources` | GET | Persistent collector status, source coverage and last successful collection |
| `/api/atlas/history` | GET | Stored snapshots or per-place/per-instrument history; links to original metadata |
| `/api/atlas/collage` | GET | Seven instruments near sampled places; stored snapshot with age and sampling footprint |
| `/api/atlas/watch` | GET | Real-time status indicators for flood, air, weather, and economy |
| `/api/dhaka/rivers` | GET | Reference station registry; current readings unavailable |
| `/api/dhaka/economy` | GET | Sourced macroeconomic indicators and EPZ industrial clusters |
| `/api/dhaka/transit` | GET | MRT Line 6 stations, elevated expressway, and transit hubs |

---

## 5. Design DNA & Anti-Slop Discipline

Following Dieter Rams' ten principles of good design and Sanzo Wada's color theory:
- **Palette**: Wada Sanzo Delta Night (`#0d171d`), Bengal River Cobalt (`#257da4`), Terracotta Brick (`#d9583b`), and Pale Parchment Cream (`#f5f0dc`).
- **Sharp Modernist Hairlines**: 0px border-radius, zero box-shadows, zero decorative gradients.
- **Responsive Geometry**: Tested phone-first at 390px viewport width with zero horizontal overflow.
- **Bilingual**: Instant toggle between Bengali (বাংলা) and English.

---

## 6. Build, Test & Deployment

```bash
# Typecheck
npm run typecheck

# Verify datasets and schema
npm run verify

# Run test contract suite
npm test

# Stamp deterministic build ID
npm run stamp

# Deploy to Cloudflare Workers edge (dhaka.nonarkara.org)
npm run deploy:live
```

---

## 7. Institutional Attribution

Built by **Dr Non Arkaraprasertkul**, Senior Expert in Smart City Promotion at the Digital Economy Promotion Agency (DEPA) of Thailand. Dedicated to sustainable delta urbanism, civic open data, and smart city twin comparative research across Southeast Asia and South Asia.
