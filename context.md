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
