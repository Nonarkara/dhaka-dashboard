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

## Release gate findings

Cloudflare account API503 was reproduced early in the session, then recovered. The first canonical attempt deployed but stopped at an inherited smoke check for obsolete research headings. The check now verifies the actual methods/source-register/honesty sections plus named source/provenance/unavailable content; a separate reviewer passed it.

The next canonical attempt passed exact live bytes and all13API smoke checks, then independently detected a uniform JPEGHTTP200 incorrectly advertised as an observation. The aerosol probe briefly returned404 and recovered on the same advertised date. The gate was preserved: Worker JPEG content-length acceptance is replaced by bounded actual decoding; browser blob/bitmap/canvas failures refuse availability rather than claiming usable imagery. Availability gets a short lifetime with actual check times and no shared stale-cache publication. Final receipt records the subsequent full release result.
