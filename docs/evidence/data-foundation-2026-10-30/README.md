# Data foundation · 30 October 2026

Approved scope: docs/plans/data-foundation.md. This is the first release of the approved sequence: measurement truth and persistent collection. Population/facility coupling, agency observations, native scientific rasters and expanded historical visualizations remain subsequent integrations.

## What changed

- GIBS tile ground pixel spacing now scales by cos(latitude); this is explicitly distinct from sensor-native resolution, which remains unverified.
- The14 authored places are sampled windows, not administrative-district averages. API metadata carries the exact sampled pixel bbox and radius; the map can show it. Per-layer radius defaults survive, including the15x15 built-up sample.
- Nodata cannot dilute built-up percentages. Observed coverage counts the full pixel window, including unavailable tiles. Exact ordering excludes censored lower-bound values and separates acquisition dates/periods. Lower-bound readings retain≥.
- POWER retains the provider's25-year2001–2025 period, source, returned coordinates and1degree SYN1DEG grid where applicable. It is modeled, not a rooftop yield estimate. Observed coverage is null, not an invented100%.
- Read-only collage/corridor endpoints read immutable R2/D1 snapshots, including cold starts. No visitor starts GIBS/POWER acquisition. Other weather/air/national adapters retain their existing expiry behavior and are not claimed as migrated here.
- Scheduled collector has a15minute lease and2hour refresh interval, checked every15minutes. Four upstream requests at a time, tile single-flight, bounded tile cache with failure expiry, and expiring solar cache bound load. Successful and failed source bodies archive to private R2 with URL/status/content identities.
- Complete snapshot objects precede one transactional publication of history and pointer in D1. Under-half coverage, malformed, failed, storage-error or superseded runs cannot replace last-good. The coverage publication threshold is engineering completeness, not a hazard classification.
- Normalized history includes full original measurement metadata and a link to its immutable published snapshot. Last-good is fresh up to4hours, visibly stale up to7days, then unavailable as current. History is collected history, not fabricated backfill.
- Parliament rendering previously threw `elements.set is not a function` every frame and aborted later map layers. Actual Three.js and MapLibre6 projection transforms now render; shared map canvas remains map-owned, surrounding mapped blocks remain visible, and only the replaced Parliament extrusion is filtered. The existing procedural approximation is labeled schematic, not an architectural survey. Three.jsr168 and MIT license are local.

## Verification

All13 test suites/typecheck pass. New SQLite-backed D1/R2 tests cover cold reads with no satellite acquisition, zero/null, malformed/reduced/partial snapshots, expired/future/schema checks, R2/D1 faults, collector lease races, original metadata/history, identical-body/different-URL archive provenance and database outage envelopes. Actual indexed-PNG tests reproduce nodata dilution, negative-cache recovery and concurrent tile fetch coalescing. Censored ordering and cross-date comparison counterexamples are executable. Building tests use actual Three.js matrices and preserve surrounding-block and2D guards.

Remote preview scheduled handler seeded real production-bound private storage (no public write endpoint). `verify-snapshots-live.mjs` passed against the preview:86/98 readings; source/history checks and no GET-triggered acquisition. One complete snapshot was downloaded directly with `wrangler r2 object get --remote` and matched its stored identifier/collection time. D1 contained4 genuine bootstrap snapshots and392 history rows at verification. These are repeated collection runs, not four distinct observation dates.

## Rendered evidence and geometry

The old rail of14 full headlines plus repeated selected headline delayed the first reading. The repaired selector exposes every place and retains each reading in its selected-place surface; no map, lens or instrument was removed. Budget: first card y<=320px; selector height<=50px; first sample action visible on first screen and at least36px; page does not overflow; map starts48px down and retains at least60% viewport height.

Eight en/bn cases390x844,1024x900,1440x900,1280x720 pass in geometry.json. Selector is36px, first card y197–237px. The isolated restoredc11e916 layout fails the same budget: selector253px, first card530px. `scripts/fixtures/data-foundation.mjs` reproduces this locally and an explicit outage/recovery case; generated files are removed before deploy and excluded by .assetsignore. No synthetic observations ship.

Screenshots: before-390.png and isolated-old.png are before/restored;390/1024/1440/1280 en/bn are repaired; outage-390.png/recovered-390.png prove failure/recovery; sample-footprint.png shows the dashed Parliament window; parliament-fixed.png shows the schematic with surrounding mapped blocks. Browser errors after repaired reload were empty. Source observations have different dates; GIBS request dates are not verified overpass times, and values derived from display bins remain estimates pending native product integration.

Independent /root/flood_review closed all source, storage, scientific, rendering and geometry findings. Published-source labels, original period, lower bounds and unknown coverage remain visible. Final deployed-byte/API verification follows below.

## Final production release

Canonical `bash scripts/deploy-live.sh` completed with build `dhaka-atlas-20261029-1793297872-2192a5f`, Worker version `cd2268a3-39ac-4d20-916d-219665c4d32d` and configured schedule `*/15 * * * *`. All13 suites/typecheck/dataset checks,13 API smoke checks, exact hashes including collage.js and local Three module, four decoded GIBS products, live stored-satellite verification and persistent-source/history checks passed. Production serves86/98 available readings from snapshot `a157e167-91c9-43b6-90e7-663fab259288`. Stored response dates and the actual POWER period remain distinct from collection time.

The first deployment completed publication but its final verifier incorrectly demanded an exact rank for censored lower-bound readings. Commit2192a5f fixes the gate to require≥and a null rank for censored values, while retaining positive-rank requirements for exact values. The full canonical chain was then rerun successfully; no gate was bypassed.

Live browser confirmed source/period/scale/coverage qualifiers, lower-bound notation, history links and the first-screen reading geometry. `live-390-en.png`, `live-sources.json`, and `live-history.json` preserve evidence. Source/renderer regressions were also captured in the shared vault; durable collection architecture was logged under project Dhaka.
