# MiniMax takeover audit · 28 October 2026

Scope: main at 5809db4 plus four uncommitted instrument-band files. There was no separate branch to merge; the reviewed pending work is integrated into main. Existing dated GIBS rasters, all 13 lenses, local Parliament courtyards, native 3D fallback and bilingual operation remain.

## Confirmed failures and fixes

- A seven-day model maximum produced “arrives within 72h” and emergency-harvest advice. Missing discharge could produce “safe, defer harvest.” Uncited capacity constants and nearest-cell station names drove the recommendations. The API now exposes descriptive available-series maxima with dates, geographic query context, and explicit unavailable warning/harvest/extent status. There is no inferred safe/watch/alert classification.
- Model-map click handlers accumulated on lens round trips and inspection values survived changes of frame or language. A single delegated forecast handler and explicit inspection ownership close stale views. Dynamic rain/haze handlers are removed when their layers are cleared.
- Population 170M formatted as 1.70B. GDP/other band values lacked labels, units or periods; a provenance typo removed dates. National data now carries complete labels, annual periods, units, source links and retrieval times. Compact million/billion scales are deterministic in English and Bengali, including browser ICU differences.
- Daily FX was called live, without freshness/base/positive-rate validation. A CC0 daily reference provider replaces the restricted open endpoint. Annual WDI, daily FX and device time are distinct; partial failures remain visible. Country, indicator, date, numerical values and FX freshness are validated. Upstream work is cached and coalesced; failures use a short cache.
- A 24–26px control treatment clipped labels and reduced readability. The toolbar remains 48px, but operating controls are at least 36px with complete labels. National evidence opens in its own dialog; an intermediate nested disclosure was rejected because it pushed settings below the first screen.
- Reapplying a lens reset the authored Parliament camera, including on language refresh. Same-lens updates now retain the camera; the forecast controller owns its regional framing.
- Legend categories had no corresponding classifier branches. Actual tagged schools, healthcare, apartments, retail and religious buildings now receive the declared colors. Unknown use and height qualifications match in both languages. External map-tag text is escaped in inspection HTML.
- Haze context contained invented kiln counts and asserted transport to central Dhaka from a single surface-wind reading. Counts/technology are now unverified, source attribution is not claimed, and missing wind direction cannot become north.

## Evidence and budgets

Real browser viewports include 390×844, 1024×900, 1440×900, 1280×720 and neighbors of the 600, 1200 and 1440px breakpoints. These use the browser viewport override; they are not scaled iframe approximations except the explicitly labeled isolated fixture captures. measurements.json contains actual DOM rectangles. The final settings controls fit the phone's first screen; the longer national-data dialog earns scrolling with nine dated reference series and sources. Both languages retain source/model qualifications.

The gate requires 48px top chrome, at least 60% map height, bounded width, on-screen primary controls at least 36px high and a player above watch. The production 26px control treatment fails. Restoring the exact prior design CSS in an isolated local fixture also fails. Updated controls pass without widening the budget. The rejected intermediate national disclosure is retained as failure evidence, not presented as the final composition.

Reproduce the isolated case using scripts/fixtures/geometry.html as public/__geometry.html and scripts/fixtures/geometry/before-controls.css as public/__before-controls.css. Visit /__geometry?w=390&h=844&lang=en&lens=rivers&oldControls=1; read #measure. error=1 injects an outlook-only network rejection. Temporary public fixtures must be removed before deployment.

New regression tests execute the actual model normalizer, forecast player, national-data parser/cache/formatter, and map camera/inspection code. They cover seven-day peaks, all-null reaches, zero values, invalid dates/units/quartiles, click-handler counts, stale inspection closure, number scales, Bengali digits, wrong-country/indicator values, outdated FX, partial outages, concurrent requests, camera preservation and map-tag escaping. Independent review runs the full suite and checks populated captures before release.

Primary source contracts: [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api), [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries), [CC0 daily currency reference](https://github.com/fawazahmed0/exchange-api). Model reach selection and daily output do not validate local flood arrival, warning stages or crop decisions.

Independent review closed after source, all 11 suites, typecheck and populated English/Bengali captures. The final national-data dialog resolves the rejected nested-disclosure layout. Final 390px menu controls end near y=601, inside the first screen. Twenty recorded cases include the original failure, restored-CSS failure and rejected intermediate disclosure; final cases pass. The isolated outage displays unavailable with a retry control and no inferred safe state. Public temporary fixtures were removed before release.

## Release and MSH closeout

Canonical deployment succeeded with Worker version `452b41da-d8ff-4015-a7ee-71033915ee52`, build `dhaka-atlas-20261028-1793175241-aedab64`. All 11 test suites, typecheck, datasets, seven existing live API checks, exact SHA-256 asset matching and four decoded NASA GIBS products passed. Production's new river response contains ten daily frames and explicit unavailable warning/harvest/extent status, without risk classification or harvest directives. National data returned eight dated annual series and a dated daily FX reference; population was 175,686,899, not an inflated billion-scale value. The live browser verified day scrubbing, changed discharge values, the explicit unknown warning status, and full labels/units/periods/source links in the national-data dialog.

The browser connection became stale when work resumed and recovered after resetting the computer-use session. This does not establish the cause of the user's earlier interruption. Saved commits and release files remained available.

MSH: captured the verified lesson “Daily river maxima and green tests do not validate flood or harvest warnings.” Two earlier entries were marked superseded, with correction links and historical claims retained as audit evidence. Recall self-test returns the verified correction and labels the older entry superseded.
