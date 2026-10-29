# Dhaka Dashboard Context & Architecture Decisions

## Initial Architecture & Release · 27 October 2026

- **Domain**: `dhaka.nonarkara.org` (Zone: `nonarkara.org`, Account ID: `74ad6bf8dfaaccf82de6f0847f7d2d54`).
- **Stack**: Cloudflare Worker (`src/index.ts`) serving typed public API endpoints (`/api/atlas/*`, `/api/dhaka/*`) and static front-end assets from `public/`.
- **Core capabilities ported & expanded**:
  - Learned from Bangkok (BKKx), Ho Chi Minh City (HCMC), Jakarta (JKTx), and Kuala Lumpur (KLx).
  - Expanded beyond existing twins by introducing a **dedicated Macroeconomic and Industrial Engine** (`/api/dhaka/economy` and on-map economic cluster lens), capturing Bangladesh's $47B+ Ready-Made Garments (RMG) export economy, inward remittances, DSE stock index, CPI inflation, and EPZs (DEPZ Savar, Adamjee EPZ, Ashulia, Hemayetpur Leather City, Tejgaon, Kawran Bazar).
  - Full **Five Rivers Hydrological Ring** (`/api/dhaka/rivers`): Buriganga, Turag, Balu, Shitalakshya, Tongi Khal, and Dhaleshwari with 6 official BWDB gauge stations and surveyed danger levels (m MSL).
  - Multi-station **Air Quality & 72-Hour CAMS Timeline** (`/api/atlas/air-quality`): 7 strategic zones (Uttara, Mirpur, Gulshan, Farmgate, Motijheel, Sadarghat, Savar) with NASA FIRMS brick kiln active fire detections and 925 hPa smoke transport wind vectors.
  - Complete **MRT Line 6 (Metro Rail)** alignment and all 16 stations from Uttara North to Kamalapur, plus Dhaka Elevated Expressway.
  - 14 authored districts and 16 architectural/historic monuments (Lalbagh Fort, Ahsan Manzil, Louis Kahn Parliament, Curzon Hall, Tara Masjid, Armenian Church, Central Shaheed Minar).
  - 100% bilingual parity (Bengali বাংলা / English).
- **Design DNA**: Dieter Rams 0-radius geometry, Wada Sanzo Delta & Terracotta palette, mobile-first 390px viewport without horizontal overflow.

## Runtime audit · 28 October 2026

Browser inspection disproved the initial release claims: watch readings were constants; no building extrusion existed; phone header controls overflowed; the 72-hour chart rendered 48 bars. Eight source-presence contracts did not prove these behaviors.

The repair connects watch to city-center modeled air/weather, adds OSM/OpenFreeMap building extrusion at zoom 14+, keeps unavailable gauge/economic/FIRMS readings null, and makes surface-wind/precipitation/seismic failures explicit. Expired model cache is no longer passed off as current. Seven air locations remain a reference registry, not seven measured stations. Numeric economic/corridor claims were removed from public responses and map attributes until dated source evidence exists.

Phone header uses two rows; watch values wrap in bounded grid tracks; the map remains independent of evidence length. Geometry evidence and limitations are in docs/verification/README.md. Runtime regression tests supplement the original presence contracts; deployment now fails on API smoke failure or mismatched public bytes.

## Persistent 3D and Kahn complex · 28 October 2026

Mapped blocks persist in all lenses when 3D is selected. A self-hosted OSM Parliament-area snapshot preserves 4,076 building footprints, including National Parliament relation 18085267 with 14 courtyard rings. Heights are explicitly mapped/estimated (levels×3m or 6 m fallback), not architectural survey claims. Native and snapshot layers switch as whole layers only when the entire viewport fits safely inside loaded local coverage; no unsupported polygon-within masking or batched-ID deletion is used. See docs/verification/parliament/README.md for regeneration and evidence. `?area=parliament` opens the authored close view;2D remains respected by quick jumps.

## Map-first design and regional outlook · 28 October 2026

The two-row header is superseded by a 48px operating row. Barlow Semi Condensed/Hind Siliguri replace the active typography; Palette plate241 colors mapped OSM building uses while unknown use remains neutral. The Parliament snapshot retains actual use/amenity/office tags, courtyards and exclusive native/detail switching.

`/api/atlas/outlook?kind=air|flood` supplies validated CAMS global PM2.5 (native three-hour steps, ~45km cells) or GloFAS v4 daily discharge at northeast reference queries. Playback starts paused, supports scrub/retry, labels valid/retrieval times, suppresses missing cells and invalid quartile pairs, deduplicates returned coordinates and rejects expired horizons. Run issue time/local accuracy are unavailable. These are not ground observations, calibrated inundation extents or flash-flood arrival predictions. Daily northeast model reaches are not yet validated against FFWC stations. Private delegate material is not distributed. See docs/DESIGN-OUTLOOK.md and docs/evidence/2026-10-28.

## Audit correction: northeast warning inference · 28 October 2026

The earlier harvest-warning implementation was not scientifically validated. Tests reproduced a seven-day maximum described as arriving within 72 hours, and missing discharge classified as safe with advice to defer harvest. The hardcoded bankfull/alert values had no cited calibration. A passing byte check proved deployment, not the validity of these recommendations.

- Geographic labels now identify query context near places, never an authoritative warning-station match.
- The available daily series maximum and its UTC model date are descriptive statistics, not surge arrival or warning lead time.
- Warning thresholds, field inundation, local crop-stage guidance and arrival predictions remain explicitly unavailable until validated official inputs are connected.
- Reach playback, ensemble ranges, clickable inspection, valid/retrieval times and missing-data behavior are preserved. Inspection closes on frame/lens/language changes to avoid stale values.
- National instruments retain a device clock, dated World Bank WDI annual series and CC0 daily FX reference data. Full labels, periods, source links and unavailable states are accessible from Map → Bangladesh data on phones. No population billion/million conversion or live-FX claim is inferred.

## Rainfall / flood regression correction · 29 October 2026

A later release inferred normal/watch/alert/danger from unsupported 30/60/100 mm point-rain thresholds. It also classified the unmapped Narayanganj query as normal and excluded it from unavailable counts. This is superseded: all six station flood assessments remain unavailable until validated inputs exist. Five nearby query points retain complete 24-hour modeled rainfall totals with UTC interval bounds, retrieval time, units, source and an unvalidated station-match label; the sixth remains explicitly unmapped. Open-Meteo precipitation is a preceding-hour sum, so the interval starts one hour before the first returned timestamp and ends at the last. Missing, partial, negative, wrong-unit, nonconsecutive and expired series cannot become zero or normal.

This release excludes the unrelated uncommitted satellite, collage, instruments and solar-resource changes present in the primary checkout.

## Persistent sampled-place evidence · 30 October 2026

Approved follow-up: Population lens adds WorldPop 2025 R2025A native counts aggregated by pixel centre into 1 km UTM46N cells, plus dated OSM school/hospital/clinic objects from fixed Geofabrik 261028 PBF. These are valid-pixel model sums and mapped objects, not census totals, live facilities, capacity or catchments. Unknown stays null; zero and positive tiny counts are distinct. Separate licences, source hashes, browser SHA verification, private R2 raw-input archive and exact-byte restore are documented in docs/PEOPLE-DATA.md. Current presentation questions now describe regional long-term solar resource and sampled night brightness independently of immutable archived questions. Automatic scheduler heartbeat/trigger provenance is separate from manual bootstraps and publication. Release evidence is in docs/evidence/people-2026-10-30; check its scheduler evidence before claiming an automatic publication.

Natural automatic publication verified: the 20:15 UTC cron archived 36 source responses and published snapshot 47b81fea-574b-4d29-950a-39e963d3c507 at 2026-10-29T20:16:08.250Z, with trigger_source=scheduled and platform outcome=ok on Worker abf40126-2a6c-4024-b88d-7d566252e01f. Current/history pointers, 86/98 readings and exact deployed bytes were checked afterward. No manual production recollection was used in this release. Data reference remains separately dated/static.

The collage/industrial radiance now read immutable snapshots from private R2 and transactional D1 publication. Cron runs every15minutes, collecting when the last successful publication is at least2hours old. GET visitors never start GIBS/POWER acquisition. A15minute lease prevents concurrent collectors; raw responses archive before a validated snapshot and its normalized history publish atomically. A substantially incomplete run (under half of98 readings) cannot replace last-good. Snapshots are fresh up to4hours, explicitly stale up to7days, then unavailable as current; older immutable history remains readable. The publish coverage gate is an engineering completeness rule, never a hazard threshold.

Sampling windows are shown by a map outline and are not administrative-district averages. Tile pixel spacing uses cosine(latitude); sensor-native resolution is separately unknown. Built-up fractions exclude nodata while coverage retains the full window. POWER retains its original averaging period/source/returned coordinates, is modeled, and has null observed coverage. Lower-bound bins show≥and do not enter exact-value rankings; acquisition dates/periods partition comparisons. No cooling-rate inference. Source/status and history endpoints: /api/atlas/sources, /api/atlas/history, /api/atlas/history?place=...&signal=..., immutable /api/atlas/history?snapshot=... . History starts with this collection release; it is not invented backfill.

A browser walkthrough also found a pre-existing Parliament custom-layer frame crash. The repaired MapLibre6/Three integration uses the supplied projection matrix and local Mercator metre scale; shared canvas remains map-owned. The schematic model is local MIT Three.jsr168; only its own OSM extrusion is filtered, neighbours remain mapped. 2D/outside-detail model visibility is respected.
