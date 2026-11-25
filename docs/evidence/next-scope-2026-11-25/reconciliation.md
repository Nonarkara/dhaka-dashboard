# Approved scope reconciliation · 25 November 2026

Owner approved phases 0–6 of docs/plans/next-scope-2026-11-25.md with “Sure.” Baseline main: 4ddf972. One checkout and one pre-existing uncommitted patch, public/dhaka-design.css; its phone watch-row work is preserved for separate pixel review and commit. The local development server for this task uses port 8796 and inspector 9246; unrelated services are untouched.

## PR #2

Independent full-diff review found all substantive work superseded by newer main:

| PR file | Present-day equivalent |
|---|---|
| docs/DESIGN-OUTLOOK.md | NOAA-20 and the retirement date already documented |
| public/app.js | English/Bengali NOAA-20 overlay/product/provider already active |
| scripts/refresh-gibs-catalogue.mjs | NOAA-20 overlay and quantitative radiance counterpart tracked |
| scripts/test-building-behavior.mjs | NOAA-20 expected by behavior tests |
| src/gibs-catalogue.ts | Newer November 23 catalogue dates retained |
| src/index.ts | NOAA-20 registry/provider retained |

No unique source fix needs recovering. Close as superseded without deleting its branch. Do not merge obsolete catalogue dates or overwrite later height/lifecycle changes. Historical PR description remains historical evidence.

## Release writer and baseline

Push CI currently runs the canonical deployment only if a token is configured; recent green runs alone do not establish deployment. Current production build is the November 23 source 1a9ff31. Approved work makes push CI validation-only and production release explicit, with concurrency/active-writer checks and durable receipts. A local directory lock alone is not a distributed lock; retain one authorized release writer and refuse when a known CI release is active.

All 24 baseline suites and typecheck pass. Live source collection is fresh and the collage is partial; retain source health independently from software correctness. Existing snapshot/lease/archive behavior is conserved.

Browser baseline records the actual live map and existing local 390px Bengali CSS candidate. The browser's restricted read-only evaluator cannot access performance entries; no cold/4G timing or compressed-transfer claim is made from that tool. The deterministic startup harness and local fixture instrumentation will record source request order/body costs and reproducible delays; real pixel evidence remains separate from network timing. The eager Parliament body is 2,212,734 uncompressed bytes, not a measured transfer cost.
