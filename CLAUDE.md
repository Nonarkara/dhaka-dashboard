# CLAUDE.md

## Commands
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm run verify` — Local file and GeoJSON syntax verification
- `npm test` — Run full test contract suite
- `npm run stamp` — Stamp build ID into source files
- `npm run deploy` / `npm run deploy:live` — Canonical release to `dhaka.nonarkara.org`

## Guidelines
- Follow `BEST-PRACTICES.md` and `AGENTS.md`.
- Never fake green or 0. Report `unavailable` with reasonCode if upstream fails.
- Maintain bilingual English and Bengali (বাংলা) translations.
- 0px border-radius, zero box-shadows, zero decorative gradients.
