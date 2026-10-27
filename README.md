# DHKx 3D Atlas & Civic Dashboard — Dhaka, block by block

**Live: [dhaka.nonarkara.org](https://dhaka.nonarkara.org)** · বাংলা / English · Phone-first

A 3D civic atlas and operational dashboard for Greater Metropolitan Dhaka where every building, river gauge, export corridor, and atmospheric sensor carries its source, collection time, reporting units, and license terms.

---

## 1. Capabilities & Lenses

DHKx bridges urban morphology, delta hydrology, macroeconomic industry, and environmental monitoring across 12 interactive lenses:

| Lens | What you see | Data Provider / Sources |
|---|---|---|
| **City in 3D** | 3D urban fabric, street grid, landmark elevations, and calculated sun lighting | OpenStreetMap, Esri Satellite, RAJUK |
| **Rivers & flood risk** | The five peripheral rivers (Buriganga, Turag, Balu, Shitalakshya, Dhaleshwari) and Tongi Khal with 6 BWDB gauge stations and surveyed danger levels (m MSL) | Bangladesh Water Development Board (BWDB) / FFWC |
| **Economic engine** | Ready-Made Garment (RMG) export corridors, Savar DEPZ, Adamjee EPZ, Motijheel financial district, and wholesale hubs (Kawran Bazar, Islampur, Chawkbazar) | Export Promotion Bureau (EPB), Bangladesh Bank, DSE |
| **Transit & Metro** | Dhaka Metro Rail (MRT Line 6) stations, Dhaka Elevated Expressway, Kamalapur central rail terminal, and Sadarghat launch terminal | DMTCL, DTCA, Bangladesh Railway, BIWTA |
| **Air & 72h timeline** | Multi-station live monitoring (Uttara, Mirpur, Gulshan, Farmgate, Motijheel, Sadarghat, Savar) with 72-hour PM2.5 & US AQI forecast curves | Copernicus CAMS / Open-Meteo |
| **Brick kilns & smoke** | Thermal anomaly fire detections across Savar/Gazipur brick kiln arcs with 10m & 925 hPa wind transport vectors | NASA FIRMS (VIIRS NOAA-20 375m), ECMWF |
| **Architectural heritage** | Mughal, colonial, and modern masterworks: Lalbagh Fort (1678), Ahsan Manzil (1872), Louis Kahn's Jatiya Sangsad Bhaban (1982), Curzon Hall (1904) | Directorate of Archaeology, Survey of Bangladesh |
| **Rain · next 24 h** | Catchment-level precipitation accumulation forecasts across the Greater Dhaka river basin | Open-Meteo High-Resolution Precipitation Models |
| **Rain radar** | Live Doppler radar precipitation loop over the Bengal Delta | RainViewer Doppler Radar Mosaic |
| **Satellite clouds** | Daily true-color atmospheric cloud reflectance | NASA GIBS / NOAA-20 VIIRS True Color |
| **Night lights** | Nighttime radiance and urban electrification patterns | NASA GIBS / Suomi NPP VIIRS Black Marble (VNP46A2) |
| **Flood inundation** | Global near-real-time surface water and flood inundation | NASA GIBS / Terra & Aqua MODIS 250m Flood Water |

---

## 2. Macroeconomic & Industrial Engine

Dhaka is the manufacturing and financial engine of Bangladesh. DHKx tracks the macroeconomic pulse through an authoritative sourced ledger:

- **Ready-Made Garments (RMG)**: Monthly Knitwear ($2.15B/mo) and Woven ($1.85B/mo) export values (EPB / Bangladesh Bank).
- **Remittance Inflows**: Official monthly inward foreign remittance ($2.4B/mo) driving urban consumption and housing.
- **Capital Markets**: Dhaka Stock Exchange (DSE) DSEX benchmark index, turnover, and market capitalization.
- **Consumer Inflation**: Bangladesh Bureau of Statistics (BBS) CPI Headline (9.92%), Food (10.40%), and Non-food inflation.
- **External Balances**: Gross Foreign Exchange Reserves & IMF BPM6 standard ($19.89B), and the crawling-peg USD/BDT exchange rate.

---

## 3. Hydrology & River Ring

Dhaka is an island city encircled by rivers. DHKx monitors 6 critical hydrological gauge stations:
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
| `/api/atlas/air-quality` | GET | 7-station PM2.5, PM10, AQI and 72-hour CAMS forecast timeline |
| `/api/atlas/rainfall` | GET | 24-hour rainfall accumulation across 5 catchment basins |
| `/api/atlas/fires` | GET | NASA FIRMS active fire hotspots in Savar/Gazipur kiln arcs |
| `/api/atlas/wind` | GET | Surface and 925 hPa wind vectors showing smoke drift trajectories |
| `/api/atlas/environment` | GET | Dated NASA GIBS WMTS endpoints and RainViewer radar metadata |
| `/api/atlas/earthquake` | GET | USGS seismic events in the Bengal Basin and Dauki Fault zone |
| `/api/atlas/search?q=` | GET | Address geocoder bounded to Greater Dhaka |
| `/api/atlas/export` | GET | GeoJSON export of landmarks, rivers, and transit features |
| `/api/atlas/watch` | GET | Real-time status indicators for flood, air, weather, and economy |
| `/api/dhaka/rivers` | GET | BWDB gauge readings, danger levels, historical peaks, and flood status |
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
