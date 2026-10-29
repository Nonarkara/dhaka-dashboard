# Flood assessment correction · 29 October 2026

Scope: remove unsupported rainfall-derived flood warning tiers, preserve point rainfall forecasts, repair corrupted Bengali, and protect unknown/zero behavior. The unrelated satellite/collage/instruments/solar-resource changes in the primary checkout are excluded by a clean worktree based on481746b.

## Findings and corrections

Production called all six stations normal even though Narayanganj had no linked rainfall query. Unsupported30/60/100mm thresholds labeled point rainfall normal/watch/alert/danger; registry danger levels never entered that calculation. Both the watch API and station responses now explicitly report unavailable flood assessment with a reason code. Current river levels remain null. Registry levels are labeled unverified.

Five point rainfall queries retain a complete24-value sum in mm, returned UTC interval, retrieval time, source, requested coordinates and unvalidated station matching. No sixth query is invented. Missing, null, negative, wrong-unit, nonconsecutive and expired series remain unavailable. Real zero remains zero. Rate-limiting has a distinct reason code. Query coordinates do not claim to be the model's returned grid centre or a catchment spatial average.

Open-Meteo hourly precipitation is a preceding-hour sum, per https://open-meteo.com/en/docs (checked29October2026). Thus first endpoint minus1h through last endpoint bounds the24-value sum. This is a descriptive model interval, not a forecast of flooding.

The river desk shows one complete qualification before the first reading, with source and period beside its reading. English/Bengali parity is retained and the mixed Gujarati/Korean text is removed. The AQI helper is retained; its pre-existing undefined isBn argument was removed because the helper uses the actual language selector.

## Tests and independent review

All12 npm test suites and tsc --noEmit pass. Data behavior now exercises zero, extreme rain, unmapped station, mixed/all-null, incomplete24hours, negative value, wrong unit, duplicate timestamp, expired series, offline requests and watch assessment status. Tests assert exact interval endpoints and null retrieval time for the unmapped query. Existing satellite13-check suite and 3D tests remain intact.

Independent reviewer /root/flood_review ran all12 suites and typecheck and examined English/Bengali rendered captures. Four findings were corrected: accidentally removed AQI helper, unrelated rainfall fallback edit,1h interval error, invented attempted time on unmapped query. Final verdict: no remaining source or rendered-state blockers.

## Geometry evidence

Human task: distinguish unknown flood assessment from the nearby rainfall evidence and inspect its period/source. The unnecessary expansion was a separate reference-intro paragraph followed by a second qualification paragraph and unsupported tier-count band. The corrected panel keeps one complete qualification. Longer station details earn their scroll with period, retrieval and coordinate evidence.

Task budget: at most one qualification paragraph before readings; first reading y<=250px; no page overflow; dialog within viewport; map begins at48px with at least60% viewport height. The map retains independent sizing and earned3D content. Eight populated cases cover390x844,1024x900,1440x900,1280x720 in both languages. All pass in geometry-final.json. Local upstream rate limiting is captured separately in390-bn.png/390-en.png; unavailable is explicit.

A local isolated fixture restores481746b HTML, dashboard JavaScript and design CSS. Same budget fails: two intro paragraphs and first row y307px at390x844. Corrected first row y212px, a95px reduction before the first reading, with full qualifications preserved. The final JSON records dimensions, repeated-row size, header, map and page geometry; screenshots show preserved source reading paths.

Reproduce fixtures with `node --import ./scripts/lib/ts-resolver.mjs scripts/fixtures/flood-correction/preview.mjs`, run a local worker, then open `/__river-values.html?lang=en&area=parliament` and `/__river-before.html?lang=en&area=parliament`. Generated public/__river-* files are temporary and must be removed before deployment. The positive/zero fixture numbers are synthetic test data, never production observations. Screenshots named *values* show fixtures; before screenshots show the old implementation. None are claims of observed flood conditions.

## Deployed verification

Canonical `bash scripts/deploy-live.sh` completed successfully. Build: `dhaka-atlas-20261029-1793283707-c3eee18`; Worker version: `c1e426c1-54a8-4c7a-9c0e-56a99c03df27`. All12 suites, typecheck, datasets,13 API smoke checks, exact live SHA-256 assets, four decoded GIBS products and live satellite verification (72/84 measurements) passed.

Direct production checks assert six unavailable assessments, five available rainfall queries and one unmapped query with null value/retrieval time. Production browser shows the full rainfall period, source and unvalidated gauge match. `live-api.json` and `live-en.png` preserve that evidence. The initial browser request briefly retained the previous60-second cached API shape; reloading after cache expiry retrieved the new fields. No cache-busting keys were used.

MSH captured the verified regression and correction in `Scars/Debug-Logs/2026-10-29-rainfall-proxies-must-not-turn-unmapped-river-queries-into-normal-flood-assessments.md`.
