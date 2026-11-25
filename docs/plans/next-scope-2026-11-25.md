# Dhaka next scope: dependable data, faster maps, complete user flows

Status: approved by the owner on 25 November 2026 (“Sure.”). Implementation and canonical release complete; actual evidence, measurement limits and remaining source gaps are recorded in docs/evidence/next-scope-2026-11-25/verification.md.

## Outcome and approval boundary

Deliver a lighter, more predictable civic atlas: a useful skyline appears without waiting for unrelated sources; every feed resolves into data or an explicit recoverable state; English and Bengali remain equally usable; release reports distinguish deployed code, data integrity and upstream availability.

Recommended approval: execute phases 0–6 in order, with small reviewed commits and a canonical release after each independently releasable change. Some work can proceed in parallel after phase 0, but shared source files have one writer. Stop at a phase gate if its behavioral evidence fails. Approval covers this bounded work, tests, merge, push and canonical deployment; it does not authorize a framework rewrite, invented geography, new paid services, destructive storage cleanup or changed scientific thresholds.

Critical decisions proposed:

1. Preserve the current satellite health policy (at most one completely quiet instrument and at least 60% measured coverage). Improve classification and reporting without lowering thresholds. A policy change requires a separate evidence-based proposal.
2. Finish and validate the existing phone watch-strip CSS work before designing another layout. Preserve the current palette, type and modular edge instruments.
3. Reuse the current vanilla JavaScript, MapLibre, Worker, D1 and R2 architecture. Add no runtime dependency unless a measured requirement cannot be met by existing code or platform APIs.
4. Prioritize reliability and usability before new feeds. Source coverage research may produce honest gaps; it does not promise a citywide height inventory or operational flood guidance.

## Evidence baseline — 25 November 2026

- Repository: `main` at `4ddf972`; one existing uncommitted change in `public/dhaka-design.css` changes phone watch readings to full-width individual rows. Its intent is preserved; visual acceptance is pending.
- Open PR #2, `cursor/viirs-noaa20-night-lights-9920`, conflicts with main. Its night-light migration appears substantially present in later main commits. It needs a file-by-file reconciliation, not an automatic merge or dismissal.
- All 24 configured `npm test` scripts and `npm run typecheck` pass in the working tree. This includes the existing CSS change; test success alone does not verify its pixels.
- Live `/api/health`: build `dhaka-atlas-20261123-1795412953-1a9ff31`, HTTP 200. Local main contains newer verifier work that is not reflected in that build stamp.
- Live `/api/atlas/collage`: HTTP 200, `partial`, 83/98 available measurements. `/api/atlas/sources`: fresh persistent snapshot, successful collection at 2026-11-25T07:01:02.668Z. These observations are a dated baseline, not a guarantee of continuing upstream availability.
- `public/app.js` waits for MapLibre `load` before loading local data. It then serially requests landmarks, rivers, transit, economy and districts; district links are last in that chain.
- Parliament detail is eagerly requested on every visit: 2,212,734 uncompressed bytes. The city-height file is 187,339 bytes. These are local file sizes, not measured compressed network transfer or user-perceived delay.
- Population manifest/assets lack bounded fetch signals. Watch and instrument refresh timers run independently; lifecycle and retry behavior are uneven across modules.
- Snapshot publication already has persistent storage, leases and guarded publication. Its validator checks counts and unique instrument names but does not establish the exact expected district/domain/instrument identities. Strengthen this boundary rather than replace storage.
- Known conservation targets: 276 source-height CBD footprints, all 4,076 Parliament footprints and courtyard rings, retained height conflicts, unknown-flat geometry, existing lenses/dialogs, source evidence and JSON exports.

## Phase 0 — Reconcile work and establish reproducible evidence

Priority: P0. Dependency: none. Relative size: small.

Proposed changes:
- Inspect the full diff of PR #2 against current main. Recover any independently useful missing work with attribution. Close the PR only if its substantive changes are proven superseded; record that verdict in the project ledger.
- Preserve the existing CSS patch and its authorship. Isolate changes into reviewable commits; do not mix it with release or source-data work.
- Record local/remote commit state, worktrees, active release writer, build stamp and production version. Account for CI auto-deployment and local deployment so two release writers cannot race.
- Capture a fixed browser baseline: default Tejgaon, Parliament link, walk link, population activation, collage, source retry and EN/BN switching at phone/tablet/desktop plus enlarged text. Record network requests, encoded transfer, first useful map, long tasks and repeated activation behavior.

Files/surfaces: existing PR, `context.md`, `docs/evidence/next-scope-*`, relevant existing tests. No product redesign in this phase.

Acceptance: no unaccounted unique work or overwritten WIP; PR reconciliation verdict; dated source/release baseline; reproducible performance profile. Existing 24 suites and typecheck pass.

## Phase 1 — Make publication and release status trustworthy

Priority: P0. Dependency: phase 0. Relative size: large; deliver as two separately reviewed increments: 1A publication integrity/historical compatibility, then 1B release receipts/CI/rollback handling.

Proposed changes:
- Share the small expected district/domain/instrument contract between acquisition, snapshot publication and live verification. Preserve the distinction between quantitative instruments and display-only imagery products.
- Reject substituted as well as missing/duplicate identities, wrong totals, invalid units, impossible values and inconsistent unavailable envelopes before publication. Reuse existing validators where their semantics match.
- Version the publication contract only if necessary. Historical snapshots keep their original product IDs, source periods and sampling metadata; use a documented legacy adapter rather than reinterpret old observations through today's registry.
- Keep a deterministic local correctness gate distinct from live source availability checks. Offline contracts use captured fixtures and explicit test time; real catalogue drift is checked separately and never hidden by invented dates.
- Make the canonical release emit one structured receipt on success or failure: source commit, build, Worker version, stages completed, byte results, data status and failure reasons. Run independent post-deploy checks to completion where safe, then aggregate failures; a failed satellite check must not conceal the state of population/planning checks.
- Preserve all exact-byte, instrument-presence, null/reason, coverage and health thresholds. A healthy collector is not proof that every observation is available.
- Record rollback eligibility and previous Worker version before release. Worker rollback cannot be assumed to restore D1/R2 data; preserve compatible schema and asset references. Do not roll back correct code merely because an upstream instrument is unavailable.

Likely files: `src/snapshots.ts`, `src/collage.ts`, relevant instrument definitions, `scripts/verify-satellite-live.mjs`, `scripts/deploy-live.sh`, `.github/workflows/deploy.yml`, focused contract/mutation tests; a small shared contract module if needed.

Acceptance: substitutions/missing instruments fail both publication and verification; valid partial snapshots remain readable; historical evidence remains intact; injected code/byte failures are release failures; genuine upstream absence remains explicit and the current health policy still controls exit status; every attempted release leaves an unambiguous receipt. Rehearse rollback compatibility without destructive production changes.

## Phase 2 — Deliver the useful map sooner with less initial work

Priority: P1. Dependency: phases 0–1. Relative size: medium.

Proposed changes:
- Start essential local layers from style readiness, independently of slow raster basemaps. Preserve the established MapLibre module-before-app boot order and loader failure behavior.
- Load independent small registries through bounded parallel requests with separate error states. District/deep-link positioning must not wait for rivers or economy.
- Demand-load Parliament detail when a Parliament/heritage entry or an intersecting viewport needs it. Share one pending request and retained result, with explicit Retry after failure. Keep streamed footprints until the entire viewport qualifies for the existing exclusive detail switch.
- Preserve a stable camera on late data, language changes and same-lens updates. Preserve skyline source inspection and 2D mode.
- Profile optional feature scripts before considering deferred loading. Implement it only where measured benefit outweighs boot-order and activation complexity; keep Three.js restricted to its existing separate reference viewer.

Likely files: `public/app.js`, `public/loader.js` only if required by the measured change, `public/index.html` only for justified optional module loading, building/lifecycle tests and browser evidence. Reuse the population module's demand-loading/integrity pattern where appropriate.

Acceptance: a default Tejgaon visit makes no Parliament-detail request, eliminating that 2.2 MB uncompressed body from the initial path; entering Parliament fetches once; repeated entry reuses it; a hung river/economy request cannot delay district positioning or known-height loading; offline failure retains real footprints; no overlap or lost courtyards. Measure actual encoded transfer and first useful map against the phase-0 profile, and reject a slower or more complex result without a clear user benefit. No tileset conversion is assumed necessary.

## Phase 3 — Finish request, retry and lifecycle ownership

Priority: P1. Dependency: phase 1; can follow phase 2 or proceed independently in different files. Relative size: medium.

Proposed changes:
- Reuse the tested transit/forecast cancellation and generation patterns for population, search and other confirmed gaps. Introduce one small shared request helper only for behavior genuinely shared by multiple callers.
- Give every user-facing operation a finite timeout and visible loading/error/retry state. Default target is 15 seconds for ordinary requests, with explicit larger limits for heavy assets if the measured baseline requires them.
- Ensure Retry starts a new attempt after timeout; cancelled or stale work cannot overwrite another lens, district, language or dialog.
- Coalesce equivalent concurrent requests and bound retries. Use one task owner for each timer/request. Pause recurring refresh/solar work on hidden pages; resume once when due, without a burst of duplicate polling.
- Preserve last-known evidence only with its real observation and retrieval ages; expired or unknown values must not become current. Never substitute zero for unavailable data.

Likely files: `public/people.js`, `public/app.js`, `public/dashboard.js`, `public/instruments.js`, `public/collage.js`, and existing request helpers/tests. Touch only callers where a behavioral gap is demonstrated.

Acceptance: a never-resolving population request becomes a recoverable failure within its timeout; Retry works; rapid EN/BN/lens/dialog changes do not repaint stale content; repeated activation creates no accumulating requests/listeners/timers; no recurring background network or solar work while hidden; a return refreshes once if due. Test abort, malformed payload, 429, 503, timeout and recovery paths.

## Phase 4 — Complete phone and enlarged-text task geometry

Priority: P1. Dependency: phase 0; integrate phase-3 state behavior. Relative size: small to medium.

Proposed changes:
- Evaluate the existing one-reading-per-row CSS patch first. Refine only if actual pixels show a remaining defect. Keep the AQI category, model tag, value, source access and associated action together.
- Consolidate only the watch/header/credit rules that currently override one another; preserve computed behavior through screenshots and geometry tests before removing redundant declarations.
- Keep the named modular edge grid: map entry → qualified reading/action at its edge → optional evidence. Preserve the palette, three semantic type sizes and bilingual scripts.
- Verify the first useful action, keyboard order, source inspection, menu/dialog focus return, 2D control and clear retry across the full task, not isolated buttons.

Likely files: existing `public/dhaka-design.css` WIP, relevant rules in `public/style.css`, `public/index.html` or rendering code only where needed, `scripts/check-ui-geometry.mjs` and behavioral tests.

Acceptance: at 390×844, 1024×768 and 1440×900 in EN/BN, normal header ≤48 px, unobscured map ≥60% of first screen, complete readings, separate reachable attribution and no horizontal overflow. At doubled semantic text size, every control/category/source is readable and reachable; specifically falsify the old stretched empty watch cells and avoid one reading covering the useful tower/action. Set the enlarged-layout budget from the measured candidate before declaring it passed. Require an independent pixel reviewer; source checks alone do not clear MSH.

## Phase 5 — Make existing evidence more useful, with bounded coverage work

Priority: P2. Dependency: phases 1, 3 and 4. Relative size: large; deliver as 5A existing-evidence health/history UX, then 5B the capped ten-candidate skyline source review. Each increment has its own evidence and review; source research may validly add no geometry.

Proposed changes:
- Expose the existing collector/source-health and delivery evidence compactly in the relevant desk: collection time, observation period, last successful check, source absence, stale delivery and method/resolution remain distinct.
- Add an optional comparison of two already-stored observations where instrument, unit, method, sampling area and reporting period are compatible. Keep raw JSON history/export. Refuse a trend across changed satellites/methods, incompatible footprints, annual values, static land-cover reference or repeated solar climatology.
- Publish a small skyline coverage register from existing captures: where geometry/height is available, source date and method, known conflicts and omitted objects. Keep the 276-footprint layer and Parliament geometry unchanged unless source evidence warrants a reviewed correction.
- Review up to ten named candidate buildings in Gulshan/Banani and Motijheel, classifying each as usable, conflicting or insufficient evidence. Import only named footprints with traceable geometry, explicit published/source height, status, reuse terms and conflict handling. If evidence is insufficient, deliver the gap report without invented metre geometry. Do not promise a target building count.
- Replace misleading active copy and duplicated source qualifications only when it obscures evidence or contradicts current behavior; preserve useful research content and provenance.

Likely files: `public/collage.js`, `public/dashboard.js` where source evidence belongs, existing history/source APIs only for additive needs, `scripts/bake-city-heights.py`, reviewed captures/data metadata, translations and source tests.

Acceptance: a user can tell 'collector fresh, observation unavailable' from 'collector overdue'; one valid comparison is reproducible from archived IDs and incompatible pairs explicitly refuse comparison; opening history starts no satellite acquisition. New height geometry requires a source/method/conflict review and conservation tests. No calibrated flood tier, shelter-readiness, evacuation or street-access claim is added.

## Phase 6 — Consolidate verified changes and close the release

Priority: P1 for each release; final close-out after phase 5. Relative size: small.

Proposed changes:
- Extract only duplicated request/lifecycle/contract logic demonstrated during the preceding phases. Keep modules narrow; a long file alone is not evidence that it needs rewriting. Preserve public IDs, URLs, globals and event contracts.
- Maintain one command index for offline tests, browser flows and live checks. Keep behavioral tests and mutation falsifiers for the actual defects; retire a redundant source-string assertion only when its behavior is covered elsewhere.
- Review package usage and pinned assets. Remove a dependency or generated duplicate only after every consumer and deployment path is accounted for and tests prove it unused. Upgrades are separate reviewable changes, not bulk maintenance.
- Update current README/context/source contracts and a compact unresolved-work ledger. Preserve dated audit receipts as history, rather than rewriting old claims into current ones.
- Run canonical release, inspect exact production bytes and real EN/BN user flows, then commit/push the final stamp/receipt. Check the actual post-push CI result so local and automated releases do not diverge.

Acceptance: clean intended working tree, reconciled PR/WIP ledger, no lost feature or >30% file reduction, full required tests/typecheck/preflight, source/geometry/motion regressions, independent UI review, exact live byte check including data assets, and an honest final state for every live gate. A degraded result is recorded as degraded; no generic 'everything live and verified' conclusion when a gate failed.

## Conservation and explicit exclusions

- Preserve all earned maps, media, charts, HUDs, lenses, research, bilingual content, keyboard/manual controls and exports. Unknown heights stay flat; source conflicts remain inspectable. No generated building shape, generic render-height fallback or floor-count conversion.
- No blanket framework, bundler, database or rendering-engine replacement. No new paid source or authentication/action-logging product in this scope.
- No archive purge, destructive migration, forced push or historical evidence deletion. Start storage capacity work with a size/restore report and a separately approved retention policy.
- No inference that rainfall is inundation, a roof is a shelter, or an OSM connection proves access. Flood/shelter operational work remains a separate validated-data programme.
- No file is reduced by more than 30% without explicit file-specific approval. No cleanup of other systems, worktrees or running services.

## Execution, proof and stopping rules

Each phase follows reproduce → targeted change → behavioral falsifier → full required checks → independent review where applicable → commit/push/canonical release → dated receipt. Reuse existing fixtures, loader rules, cancellation patterns, snapshot storage and source envelopes.

Before merge, verify original failures are caught: below-minzoom camera, eager Parliament request, stalled registry delaying area, hung population Retry, stale language response, duplicate hidden-page timers, substituted instrument, missing unavailable reason and oversized watch cells. Review failure injection as well as happy paths.

Stop dependent work and report the exact blocker if source rights/geometry are unresolved, a phase requires destructive changes, or a new architectural boundary is needed. For upstream outages, preserve all applicable checks and report unavailable evidence; do not raise thresholds or republish stale observations to manufacture a green release. Timing and resource targets are measured on the agreed baseline profile, not invented as field performance.

## Prior art and implementation references

Use patterns, not copied application architecture:
- MapLibre's [large-data guidance](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/) and [source implementation](https://github.com/maplibre/maplibre-gl-js/blob/main/src/source/geojson_source.ts): reduce unnecessary source work first, measure before changing delivery formats.
- Cloudflare's [rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) and [Workers SDK](https://github.com/cloudflare/workers-sdk): version/asset compatibility matters; rollback does not restore connected storage.
- Existing local examples: `public/people.js` demand-loaded integrity-checked assets, `public/dashboard.js` transit cancellation/recovery, `public/forecast.js` task/motion ownership, `src/snapshots.ts` persistent publication and `scripts/verify-live-bytes.mjs` exact delivery evidence.
- Owner canon and `STYLE.md` remain controlling for visual work. Read the current originals again before implementation.

Approval received for phases 0–6. Execution evidence and reconciliation are recorded in docs/evidence/next-scope-2026-11-25.
