# Approved population/facility release · 30 October 2026

The owner approved the follow-up: correct the two overclaiming domain questions, verify automatic scheduled collection, and add dated population/facility data with clear limits.

## Scope and decisions
- Energy asks about regional long-term solar resource; Economy asks about sampled night brightness, in English/Bengali. Serve current presentation questions independently of archived source measurements so copy fixes do not require a new acquisition.
- Add a People & facilities map lens. WorldPop2025 R2025A Bangladesh100m constrained count model is aggregated by native pixel centres into a1km UTM46N metric grid, exported in EPSG4326. Explicitly a model sum over valid pixels, not a census or administrative district population. Keep no-data distinct from zero and expose modeled-area coverage; uncertainty intervals are not supplied.
- Pair each cell with OSM school/hospital/clinic mapped objects from a dated bounded query. Do not infer capacity, opening status, completeness, travel time or service adequacy. Preserve source IDs, bilingual names and source links; no private contact details.
- Static reproducible derived layers under500KB each, loaded only for the new lens. A compact legend/filter and selected-cell evidence show both source dates/scales. Click map cells/facility objects for details. Preserve all existing3D, landmarks, lenses, palettes and English/Bengali behavior.
- Verify the actual production cron wake-up and next due publication separately from manual test triggers. Record observed check time so no-op scheduled runs are visible. No public ingestion endpoint.

## Files
New scripts/refresh-people.py and pure aggregation helpers/tests; raw-input manifest with hashes; public/data/people-grid.json, facilities.geojson and manifest; public/people.js; small additions in app/index/styles/translations. Worker read-only API for data and source metadata; scheduled heartbeat schema addition if needed. Regression gates, source notices, context/evidence.

## Verification and geometry
Rebuild from fixed public source URLs and IDs; assert count-conserving aggregation, valid zero versus nodata, metric grid/coordinate order, unique OSM IDs and bounded geometry. Client switching/offline/language/selection tests; API unknown states. New legend targets>=36px, combined controls do not obscure the map task; map keeps48px chrome and independent height>=60%viewport. Inspect390x844,1024x900,1440x900,1280x720 en/bn, selected/empty/error/filter states. Restore oversized controls in a local fixture to prove the same gate fails; independent review. npm test/typecheck, canonical deploy, exact bytes and actual live data/cron verification.
