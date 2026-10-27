# Dhaka runtime repair · 28 October 2026

The original live phone viewport (366×802) had a 496px header and a 661px watch inside 366px and 342px regions. Basemap/menu controls and readings were clipped. The failure starts with a single unwrapping header row and grid tracks allowed to size to their content.

The task is to choose a geographic lens, operate the map, and open the relevant evidence desk. The map is the dominant working region. All four watch actions must remain visible alongside their readings; source qualifications must remain readable.

## Rendered evidence

Measurements were generated from the actual app DOM inside same-origin iframes, driven through CUA. The iframe viewport is the stated size. PNGs are **scaled to fit the available 366×802 browser pane**, not full-resolution desktop screenshots. JSON is measured, not handwritten. The horizontal lens rail is intentionally scrollable and excluded from the overflow budget; header/watch are not.

| Viewport/state | Combined chrome | Map | Watch | Gate |
|---|---:|---|---|---|
| 390×844 Bengali city | 180.84px | 390×663.16 | 374×121.40 | pass |
| 1024×900 English city | 91.95px | 1024×808.05 | 900×70.90 | pass |
| 1440×900 English city | 91.95px | 1440×808.05 | 900×70.90 | pass |
| 1280×720 English city | 91.95px | 1280×628.05 | 900×70.90 | pass |
| 390×844 original CSS restored | 122.84px | 390×721.16 | 366×119.22 | **fail** |

The old phone header extends to x496, including a basemap ending at x429 and menu ending at x496. The original CSS therefore fails the same bounds test; passing overflow checks on the page alone would have missed it. The repaired phone spends more height on usable controls and complete qualifications. That added height is earned by the task.

Budgets: header/watch content and control rectangles stay within the viewport; their scroll width cannot exceed their own width by more than one rounding pixel; map height ≥60% of viewport; watch bottom remains at least 20px above the viewport edge for attribution. Controls are grouped with the map, and watch readings are themselves the evidence actions (zero separation). This gate verifies declared city states, not every possible layout/state.

To reproduce: copy `scripts/fixtures/geometry.html` to `public/__geometry.html`, write `git show a00ea3c:public/style.css > public/__old-style.css`, run `npm run dev`, then open `/__geometry.html?w=390&h=844&lang=bn` (add `&old=1` to falsify). Read `#measure` after model loading; capture the view. Remove both temporary public files before release. Other sizes use the same w/h query. The fixture only scales the iframe presentation; its internal CSS viewport remains unchanged.

## Behavioral evidence and independent review

`npm test` now includes a mocked worker runtime suite: offline weather/air/wind/FIRMS/rain/seismic responses, null river/economy readings, malformed model payloads, and six AQI category boundaries. The original seven contracts continue to pass. `npm run typecheck` and `npm run verify` are required by canonical deployment.

Independent reviewer checked the source, ran all eight suites, and inspected the phone PNG. Findings closed: clipped header/watch; labels leaking between lenses; controls waiting for GeoJSON; hardcoded watch/readings; missing 3D extrusion; language refresh; 48-vs-72 chart; hidden phone qualifications; blocked watch on map failure; chart time positions; wrong PM-based health colors; missing AQI defaulting green. Old-layout falsification now reports false in `390-old.json`.

Limits: gauge observations, dated economic bulletins and FIRMS retrieval remain unconnected and explicitly unavailable. Air data is a city-center CAMS model, not seven measured sensors. Building heights may be inferred by the tile producer. NASA overlays/radar coverage and full keyboard/assistive-technology coverage are not certified by the geometry gate. Source review and scaled captures do not constitute exhaustive browser coverage.

## Final live result

Canonical `bash scripts/deploy-live.sh` passed type checks, dataset validation, all eight suites and seven live API checks. `verify-live-bytes.mjs` confirmed matching SHA-256 for entry HTML, runtime scripts, styles, translations and modified GeoJSON at dhaka.nonarkara.org. The final browser run exercised English/Bengali switching, opened the timestamped 72-hour air desk, opened the fully translated district dialog, jumped to Motijheel, and confirmed the menu closes on modal open. Live building extrusions rendered after the jump; no browser warning/error entries were recorded in the inspected path. The accompanying live screenshot is `live-motijheel.png`.
