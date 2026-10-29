# Approved data foundation · 30 October 2026

Owner approved the strategy on30October. This first release implements the measurement and persistence foundation; population/facility integrations and verified agency observations follow as separate integrations, not fabricated substitutes.

## Decisions and scope
- Keep all3D/camera/lens behavior, seven existing instruments, Wada palette and bilingual parity.
- Correct tile pixel spacing, label point-window sampling, preserve native resolution as unknown unless verified, preserve solar period/source/returned coordinate.
- Replace claims of whole-district measurements and cooling rates with sampled-place comparisons.
- New scheduled collector archives upstream GIBS/POWER responses to private R2, writes normalized per-place observations and ingestion history to D1, and publishes complete snapshot objects. No public write endpoint.
- GET collage/economic corridor requests read stored snapshots; no visitor-triggered satellite/solar acquisition. Explicit fresh/stale/unavailable delivery metadata. New read-only history/source-health endpoints.
- New bounded network helper, single-flight tile retrieval, success/failure expiry. Existing short-horizon weather/air/outlook adapters retain their expiry semantics.
- Bootstrap via local scheduled handler with remote storage bindings; production cron owns subsequent collection.

## Files
Modify src/satellite.ts, solar-resource.ts, collage.ts, index.ts; public/collage.js and minimal related copy/styles; add source-fetch.ts, snapshots.ts, SQL migration, collection/verification scripts and tests. Configure private R2/D1 bindings and cron in wrangler.toml. No external credentials in code.

## Verification
Scientific regression tests: latitude pixel spacing, sampling footprint, original solar period and coordinates, no cooling-rate inference. Persistent-store tests: cold read/no upstream calls, expiry, invalid/reduced snapshot rejection, partial-source failures, concurrency and failed publication preserving last-good. Integration: local scheduled collection against remote bindings, remote D1/R2 checks, persistent history and source-age reads. All npm tests/typecheck, canonical deploy script, exact static bytes, live snapshots and bilingual browser walkthrough.

## UI task geometry
Selected-place readings and their source/sampling qualification remain in one evidence surface. Map keeps48px operating chrome and independent height>=60%viewport. Qualification must not become a new hero/band. Capture390x844,1024x900,1440x900 and1280x720 en/bn; compare old selected-place controls/readings and ensure no new overflow/clipping. Independent review closes source/behavior/render findings. No file shrink>30%.
