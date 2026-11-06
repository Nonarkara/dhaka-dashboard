# MiniMax follow-up audit · 6 November 2026

The reported passing contracts concealed source-height and interaction defects. Streamed provider render_height is no longer treated as an explicit source height. Unknown footprints stay flat; all 4,076 local footprints and 14 Parliament courtyard rings remain. The low-angle lens is a map exploration tool, not a street position or walking route. Counts deduplicate visible stable feature IDs and describe rendered footprints, not a census.

Manual movement now owns keyboard input exclusively, corrects strafe direction, runs frames only during held input, and stops on hidden page, blur, manual map input, task/modal changes and exit. The model-plane camera fit is tested against independent synthetic geometry and refuses an invalid fit. External exploration links use the map centre.

Transit now distinguishes 17 mapped registry stations (including the extension) from operating service, with Bengali extension parity, bounded/cancelled requests, visible reason/time and a working Retry. Export validates actual GeoJSON rather than silently publishing empty or malformed source layers as complete. Release stamping, preflight and exact-byte verification include walk.js.

## Verification

- All 23 configured npm test suites pass; full output in tests.log. Typecheck and local preflight pass. No GitHub PRs exist in the repository at this audit.
- Executable tests cover source-height conservation, unique rendered counts, movement ownership/lifecycle, camera fit, malformed export matrices, transit failure/recovery and language/request races. Mutation probes catch reversed strafe, missing hidden-page stop, incorrect camera math, missing export partial markers and removed stale-request guards.
- Actual browser screenshots cover 390×844, 1024×768 and 1440×900, English and Bengali. geometry.json passes the project geometry checker: normal header 41px, phone panel approximately197–202px, unobscured map over64% of first screen. Source attribution remains separate.
- Enlarged text uses doubled semantic type tokens (26px body), not a viewport screenshot enlargement. Optional tools scroll above the dynamically measured watch strip; enlarged-tools-bottom-390-bn.png proves the last actions and sources remain reachable.
- Transit outage/recovery screenshots use a temporary local fetch fixture returning503 until Retry. Enlarged text also uses a temporary local fixture. Generated fixture pages were removed before release preflight.
- A separate reviewer inspected final source, behavior tests and actual normal/enlarged/retry pixels: PASS, no remaining source/UI blocker in this scope.

Screenshots are the repaired **local preview**, except live-before-walk-390-bn.png, which records the previous production state. They do not establish a deployment. See release.txt for the actual release outcome. No validated flood classification, shelter geometry or pedestrian access claim was added.
