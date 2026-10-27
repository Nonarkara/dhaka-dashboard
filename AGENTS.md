# Dhaka Dashboard Agent Instructions

Read `README.md`, `BEST-PRACTICES.md`, and `context.md` before making changes.

Apply the `anti-slop-design` skill before any UI work. `npm test` is mandatory before any release or commit. It validates objective contracts, including:
- `test-release-contract.mjs`
- `test-client-contract.mjs`
- `test-theme-contract.mjs`
- `test-environment-contract.mjs`
- `test-i18n-contract.mjs`
- `test-dhaka-contract.mjs`
- `test-anti-slop-design.mjs`

### Permanent Constraints:
- Preserve Wada Sanzo Delta & Terracotta palette, Dieter Rams functional geometry, and sharp modernist hairlines.
- Never fake green or 0. If an upstream service is down, report `unavailable` with a machine-readable `reasonCode` and timestamp.
- Preserve bilingual English / Bengali (বাংলা) parity.
- Never reduce a file by more than 30% without owner approval.
- Keep secrets in environment variables.
- Done means commit, push, canonical `bash scripts/deploy-live.sh`, exact deployed bytes and live verification at `dhaka.nonarkara.org`.
