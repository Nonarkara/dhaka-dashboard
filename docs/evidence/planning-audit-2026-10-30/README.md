# Planning provenance audit · 30 October 2026

## Confirmed findings and corrections

- Nemotron's new study extent exactly matched the population manifest, but was called a reviewed DNCC+DSCC extent derived from authored area points. Geometry is retained; source, name and derivation now identify the 1 km UTM46N population grid. It establishes no municipal or evacuation boundary.
- Six legacy river references were promoted to official inventory/reviewed geocodes with surveyed thresholds despite null source retrieval and no authoritative record match. Values/codes/coordinates remain available as explicitly unverified references. Unsupported sourceFeatureId assertions and MSL datum claims are removed; the gauge HUD has no invented fallback river/code.
- DDM's table omitted coordinate columns, but the actual HTML embeds a shelter JSON array used by its map. Independently parsed 1,950 records with 1,950 finite non-origin valid pairs; five lie inside the population-grid extent. The HTML SHA256 matches the public aggregate review. No source records/coordinates/contacts were imported or republished. The 0 imported records / 0 pins are separate from source counts and readiness.
- Shelter response retrieval time was request time despite no source fetch. It now records actual capture time 2026-10-30T06:39:00.858Z and separately stamps the response. Source observation/update time is unknown. The refresh CLI requires actual capture time and rejects ambiguous declarations.
- Korean/Spanish fragments in Bengali API metadata were corrected and guarded.
- Satellite checks invoked async cases without awaiting/serializing them; the cache failure experiment used external network and allowed 0 failures. Cases now run sequentially, the deterministic offline experiment proves a real failure/cache hit/expiry/retry, and stats exclude expired failures. All 13 mutations were caught, including the long-failure-TTL mutant.
- Browser testing found static planning metadata blocked behind rainfall. It now renders independently; old language responses cannot overwrite detached/current slots. Source outage/retry clears stale machine reasons and retains explicit unknown readiness.

## Gates and browser proof

All 15 configured npm test suites and TypeScript pass. The satellite suite contains 16 awaited cases; check counts are not suite counts. Planning tests cover exact boundary provenance, API metadata, frozen source retrieval, parser privacy/shape/ambiguity, invalid/half/outside coordinates, location/publication review gates, contact/reviewer field projection, offline/retry and delayed-rain/language races. The actual imported register remains empty. Mapping eligibility never establishes readiness.

Eight real browser cases in geometry.json: 390×844,1024×900,1440×900,1280×720, en/bn. Header 48 px; underlying map 796/852/672 px; disclosure summary and close targets 36 px. Expanded prose is bounded, readable and scrolls only with the existing dialog. The source link and qualifiers are preserved. Oversized local fixture summary 179.59 px fails the same 64 px cap. Outage and recovered screenshots show actual UI retry. No preview pages remain in public/.

Independent planning_review checked source/code/contracts, recomputed the private HTML counts/hash without disclosing records, and viewed phone/Bengali/desktop/error/recovery screenshots. No blockers remain. cache_gate_fix implemented/tested the bounded satellite fix. No dependency or cache-policy changes were introduced.

## Source and privacy

Official page: https://rapid.ddm.gov.bd/service/shelter_info . Public review: public/data/ddm-source-review.json; reproducible parser: scripts/review-ddm-source.mjs. The page inspection establishes structure, numeric coordinate presence and a point-in-extent count, not positional accuracy, municipal coverage, licence permission or safe shelter availability. Raw HTML/private contacts remain outside this repository. FFWC browser fetches returned timeout/502; no gauge adapter or calibrated warning is claimed.

Live baseline response files preserve the before-audit claims. Production deployment/exact-byte/API/browser proof is appended after release. All existing 3D/Parliament, population, satellite/history and other lenses are preserved.
