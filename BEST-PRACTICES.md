# Best Practices — Dr Non's Codebases

> **Cross-project code rules, distilled.** Every project in this workspace reads
> this on first open. Sits next to `AGENTS.md` (agent law) and `CLAUDE.md` (deep
> canon). Where a project overrides a rule below, it is named in that project's
> `context.md` or `CLAUDE.md`. Where a rule conflicts with `AGENTS.md`, AGENTS wins.
>
> Source of these rules: real failures across HCMC, Jakarta, KL, TKC, BKKx,
> Kuching IOC, BKKxCulture, ASCN, Kuching-IOC, Phuket, Yala. Each rule cites
> the failure it prevents.

---

## 1 · Cache stamp, not `Date.now()`

Use a build-time stamp committed to source, never `Date.now()` in code that
ships to both SSR and hydration. The same `const id = "hcmc-2026-10-15-..."`
shows on server and client; `Date.now()` diverges and React logs a hydration
mismatch on every cold load.

```ts
// ❌ crashes hydration
const id = `hcmc-${Date.now()}`;

// ✅ build:cf script runs `node scripts/stamp-build-id.mjs` before the build
export const buildId = "hcmc-2026-10-15-1792051669-2478224";
```

**Failure this prevents:** HCMC dashboard initially used `Date.now()` in the
atlas iframe cache buster; every cold load logged a hydration warning.

---

## 2 · Inline what the minifier can dead-code-eliminate

A helper component that `return null`'s and only uses its `useState` inside
`useEffect` callbacks **can be DCE'd by SWC/terser** in production builds.
The optimization sees the helper produces no UI, so the effects are "unused."

If a helper's only job is to wire `useSearchParams` into parent state,
**inline the hook + effects + state into the consuming component.**

```tsx
// ❌ helper gets DCE'd, useSearchParams never called
function ScenarioParamBridge({ onChange }) {
  const params = useSearchParams();
  useEffect(() => onChange(params.get("scenario")), []);
  return null;
}

// ✅ inline — minifier can't remove a component that returns JSX
export default function WarRoomApp() {
  const params = useSearchParams();
  const [scenario, setScenario] = useState(params.get("scenario"));
  useEffect(() => setScenario(params.get("scenario")), [params]);
  return <WarRoomShell scenario={scenario} />;
}
```

**Failure this prevents:** HCMC `/?scenario=…` and `?lens=…` URL params
silently failed on production builds. The dev build worked; prod didn't.

---

## 3 · Every feed has a provenance tier — never fake green

`measured | modeled | simulated | reference | unavailable`. The tier is
required metadata on every cached or fetched value, surfaced all the way to
the UI. A status endpoint that says "operational" while half its feeds are
unavailable is a lie.

```ts
// ❌
{ status: "operational", feeds: { weather: { ok: true } } }

// ✅ — skipped vs unavailable vs stale are three different states
{
  status: "operational",
  feeds: {
    weather:    { status: "ok",     ageMinutes: 5 },
    airQuality: { status: "ok",     ageMinutes: 5 },
    news:       { status: "ok",     ageMinutes: 92 },
    vntt:       { status: "stale",  ageMinutes: 0, note: "tier=modeled" }
  }
}
```

A feed is "ok" only if (a) the source answered recently AND (b) the source
is at tier `live` or `cached` AND (c) the data is not older than the feed's
freshness horizon. Any one fails → not ok.

**Failure this prevents:** Dashboard reported green while the cron was
dead, while news was on a fallback, while weather was 14 hours old.

---

## 4 · Distinct reason codes for distinct failure modes

When an upstream call can fail in different ways, the response should
distinguish them with a machine-readable `reasonCode`, not just prose.
Quotas, data-shape mismatches, auth failures and network errors all need
different operator responses.

```ts
// ❌
return Response.json({ status: "unavailable", reason: "could not fetch" });

// ✅
return Response.json({
  status: "unavailable",
  reason: "ECMWF IFS pressure-level winds unreachable from the open provider",
  reasonCode: limited ? "provider-rate-limited"
            : allUnreachable ? "upstream-unreachable"
            : "invalid-wind-grid",
  retryAt: limited ? new Date(until).toISOString() : null,
  source: "ECMWF IFS 0.25° via Open-Meteo",
  sourceUrl: "https://open-meteo.com/en/docs"
}, { status: 503 });
```

**Failure this prevents:** HCMC haze-origin endpoint always returned the
same generic reason; the daily Open-Meteo quota cap and a real model
rename looked identical to monitoring.

---

## 5 · Build then deploy — one chain, gated on success

The deploy script runs `build` first, then `deploy`. A failed build must
abort before `wrangler deploy`. A successful `wrangler deploy` with stale
assets is the worst outcome — the live URL serves yesterday's bytes.

```sh
# ❌ — wrangler deploy can ship the previous build
npm run build || true
npx wrangler deploy

# ✅ — chain so a failed log redirect or build can't slip past
node scripts/stamp-build-id.mjs \
  && node scripts/fixup-opennext-load-manifest.mjs \
  && rm -rf .open-next \
  && npx @opennextjs/cloudflare build \
  && node scripts/fixup-opennext-og.mjs \
  && npx wrangler deploy
```

If the chain fails anywhere, the previous build is left in `.open-next/`,
and the deploy simply does not run. The build dir is the source of truth
for what gets shipped.

**Failure this prevents:** HCMC dashboard once shipped an old build after
a log-redirect failure short-circuited the build.

---

## 6 · Two systems, one URL — service binding + unified entry

When a dashboard and an atlas (or any two related surfaces) live in
separate Workers, the dashboard is the **canonical entry**. The atlas
Worker is bound as a service. A small router decides what hits atlas vs.
what stays on the dashboard.

```ts
// dashboard/custom-worker.ts
const openNext = handler as OpenNextWorker;
export default {
  fetch(request, env, ctx) {
    return unifiedEntry(request, env.ATLAS, (r) => openNext.fetch(r, env, ctx));
  },
};

// dashboard/src/lib/unified-entry.ts
if (url.pathname.startsWith("/api/atlas/") || atlasFiles.has(url.pathname.slice(1))) {
  return atlas.fetch(request);  // service binding, not a public round trip
}
if (url.pathname === "/operations" || url.searchParams.has("scenario")) {
  return legacyFetch(new Request(new URL("/", url), request));
}
return legacyFetch(request);
```

The atlas service binding means the dashboard reads atlas APIs over the
Workers internal network — no CORS, no extra latency, no public exposure.

**Failure this prevents:** Jakarta, KL, HCMC all started as two URLs
(`nonarkara.org` + `atlas.nonarkara.org`). The 308 redirect worked but
the iframe inside the dashboard couldn't share cookies or auth with its
own atlas backend. The service binding fixed that.

---

## 7 · Forward URL params through embedded iframes/wrappers

If your dashboard embeds an atlas (or any iframe), the iframe `src` must
forward every relevant URL param explicitly. A redirect inside the parent
that drops the query string breaks deep links.

```tsx
// ❌ — params silently lost when user lands on /operations
<iframe src={`https://atlas.example.com/?lang=${lang}`} />

// ✅ — forward what the inner app actually honors, with a length cap
const lens = searchParams.get("lens");
const research = searchParams.get("research") === "1";
const safe = (v: string | null) => (v && v.length <= 32 ? v : null);
const inner = new URLSearchParams({
  v: buildId,
  lang: lang ?? "vi",
  showcase: "1",
  ...(safe(lens) && { lens: safe(lens)! }),
  ...(research && { research: "1" }),
});
<iframe src={`https://atlas.example.com/?${inner}`} />
```

Always include a build-stamp query param (`?v=<buildId>`) so the iframe
caches never go stale behind a long-lived `max-age`.

**Failure this prevents:** HCMC `/?lens=air-model&research=1` worked on
the atlas directly but not when reached through the dashboard.

---

## 8 · Read the file before cherry-picking any closed branch

A 6-week-old branch was closed with comments saying the runbook was
"factually wrong." I cherry-picked it as a "net-new file" and shipped a
460-line doc that said the GitHub Actions cron was the scheduler (it
had moved to a Worker Cron Trigger six weeks earlier). The right move
was to read the file first, then either fix the doc inline or
cherry-pick just the non-stale parts.

**Rule:** before any `git cherry-pick` of a closed or stale branch,
read every file in the diff, mark every fact that depends on
implementation choices, and verify those choices still hold.

**Failure this prevents:** HCMC `docs/RECREATE.md` shipped with a
section saying "GitHub Actions runs the cron every 5 minutes" when in
fact a Cloudflare Cron Trigger has done that since 11 October.

---

## 9 · Privacy comments are contracts — enforce them in code

A comment that says "we never call X unless Y" must be enforced by the
source. A test must read the served bytes and confirm the gate precedes
the third-party call. The comment is a promise; the test is the proof.

```js
// ❌ — comment says "we only fetch ipwho.is if VISITOR_BEACON_URL is set"
//      but the lookup is unconditional
const ip = await fetch("https://ipwho.is/");
if (process.env.VISITOR_BEACON_URL) sendBeacon(ip);

// ✅ — gate the lookup, not just the send
if (!process.env.VISITOR_BEACON_URL) return;
const ip = await fetch("https://ipwho.is/");
sendBeacon(ip);

// Test:
// assert.ok(src.indexOf("if(!SH)return") < src.indexOf("ipwho.is"))
```

**Failure this prevents:** Kuching IOC visitor-beacon code sent every
visitor's IP to a third party the moment a SyntaxError elsewhere was
fixed and the script began running. The comment said it didn't.

---

## 10 · Empty values must parse — never `window.""` or `setSql("")` raw

A template literal that interpolates an empty env value into JavaScript
produces `window.""` — a syntax error that throws on parse, before any
try/catch can catch it. The fix is either a top-of-function guard that
validates the value, or a default.

```js
// ❌ — empty env var → SyntaxError on every page load
const beacon = `var SH=window.${envVar}||'';`;

// ✅ — top-of-function guard precedes substitution
const beacon = `
  var SH = "${envVar || ""}";
  if (!SH) return;
  // ... third-party call ...
`;
```

The same rule applies to SQL placeholders, JSON.stringify into HTML
script tags, and URLSearchParams fed to `new URL`.

**Failure this prevents:** Kuching IOC beacon script broke every page
load with `Unexpected token '<'` because the empty env var produced
malformed JS.

---

## 11 · Every audit finding becomes a gate test

If you find a bug in production, write a `test-*.mjs` that reproduces
it and fails if the regression returns. Don't leave audits in
ad-hoc markdown logs; every finding is a future test.

```
scripts/
  test-canonical-entry.mjs   # the 308 redirect preserves query
  test-flood-briefing.mjs    # the bilingual dialog honors opt-in
  test-lens-ownership.mjs    # the subsidence fill doesn't leak
  test-haze-reading.mjs      # quota vs data-shape returns distinct reasons
```

Each test is a small, single-purpose Node script that exits 0 on pass.
They run in CI, locally, and after every deploy. The diff is the audit;
the test is the memory.

**Failure this prevents:** HCMC, Jakarta, KL all had audit findings that
returned weeks later because the fixes were committed but never asserted.

---

## 12 · Three-tier loader for every external feed

Every feed has three fallbacks, in order:

1. **Live API** — same-origin or upstream.
2. **Baked snapshot** — JSON in `public/data/`, refreshed by cron.
3. **Deterministic fallback** — constant values in `data.js`, labeled as
   such in the UI (e.g. `tier: "reference"` or `tier: "simulated"`).

A panel that disappears when the live API is down is a regression. The
fallback must always render — and the UI must show which tier it's on.

```ts
async function loadDashboardPayload() {
  try {
    const live = await fetch("/api/dashboard");
    if (live.ok) return await live.json();
  } catch {}
  try {
    const snapshot = await fetch("./api/dashboard.json");
    if (snapshot.ok) return await snapshot.json();
  } catch {}
  return buildFallbackDashboard(); // tier: "reference"
}
```

**Failure this prevents:** Kuching IOC, HCMC, Jakarta all had panels go
blank when the live API was 502. The three-tier loader keeps the page
honest.

---

## 13 · Static assets ignore dotfiles and editor cruft

Add `public/.assetsignore` (or its equivalent) to your static host. A
`.DS_Store` file in the project root, served at `/`, leaks the entire
directory tree to anyone with a browser.

```
# public/.assetsignore
.DS_Store
._*
Thumbs.db
*.swp
```

Verify with `curl -sI https://your.site/.DS_Store` — must be 404.

**Failure this prevents:** HCMC was serving `.DS_Store` at `/` for
months before anyone noticed.

---

## 14 · Lock the build path against silent staleness

A long-lived HTML page with `s-maxage=31536000` references chunk hashes
that the next deploy deletes. Result: cached HTML, missing JS, "Application
error" on load. Force dynamic rendering for any page that depends on
runtime data.

```ts
// every page that uses runtime data
export const dynamic = "force-dynamic";
```

For build-time assets you DO want to cache, version the URL with a
content hash, not a counter. `sha256(contents).slice(0,10)` is enough.

**Failure this prevents:** KL and HCMC dashboards had prerendered pages
that referenced chunk hashes from previous deploys. One week after a
deploy, users saw blank pages.

---

## 15 · When in doubt, render the failure

If a feed is unavailable, **render a Skeleton or a "feed unavailable"
pill on the affected panel**, not a silent omission. The user should
know what they are not seeing.

```tsx
// ❌ — empty array means empty UI, looks like "no data"
{news.length === 0 && <p>No news.</p>}

// ✅ — explicit unavailable state, with the reason
{news.length === 0 && (
  <p className="status-pill stale">
    News feed unavailable: {newsError || "upstream 503"}
    <a href="/api/status">status</a>
  </p>
)}
```

**Failure this prevents:** Kuching IOC, HCMC news panel looked empty
for 12 hours during a Longdo outage. Operators thought the system was
fine; it wasn't.

---

## 16 · One canonical hostname per system, every other URL is a 308

The atlas lives at `atlas.host`, the dashboard lives at `host` (the
canonical one). All requests to `atlas.host` 308-redirect to
`host?atlas=1` (or equivalent) with the query preserved. The
service binding handles internal atlas traffic; the public alias exists
only for backwards compatibility with shared links.

```ts
// atlas wrangler.toml routes
{ "pattern": "atlas.nonarkara.org", "custom_domain": true }
// atlas src/index.ts
if (url.hostname === "atlas.nonarkara.org") {
  return Response.redirect(
    `https://nonarkara.org/?atlas=1${url.search}`,
    308
  );
}
```

Use 308 (not 301) so the method and body are preserved on redirect.

**Failure this prevents:** HCMC, Jakarta, KL all had `atlas.*` aliases
that diverged from the main entry. Users with stale bookmarks saw an
older version of the atlas.

---

## 17 · Wrangler storage commands need `--remote`, then check the live bytes

In Wrangler 4 (this repo pins `wrangler` ^4.107.0), `npx wrangler r2 object put|get|delete`, `wrangler d1 execute`, and `wrangler kv key` / `wrangler kv bulk`
talk to the **local emulator** under `.wrangler/state` unless you pass
`--remote`. `wrangler kv namespace` is an account API call and has no local
mode. An R2 put still prints `Upload complete.` and `Resource location: local`,
so it looks like the upload worked when production never saw it.

```bash
# ❌ writes to the local emulator, prints "Upload complete"
npx wrangler r2 object put hcmc-twin-assets/models/landmark-81.glb --file=public/models/landmark-81.glb

# ✅ writes to the real bucket
npx wrangler r2 object put hcmc-twin-assets/models/landmark-81.glb \
  --file=public/models/landmark-81.glb --content-type=model/gltf-binary --remote

# ✅ then prove it from outside: the live byte count must equal the file
curl -s -o /dev/null -w '%{size_download}\n' \
  https://hcmc.nonarkara.org/api/hcmc/3d/v2/models/landmark-81.glb
stat -f %z public/models/landmark-81.glb   # macOS; Linux: stat -c %s
```

A 200 on that URL proves the route can read the object. No mounted page
requests the hero GLBs. The only caller is unused `BorderMap.tsx`.

Keep the Cache-Control on routes that read R2 short (`max-age=300`), so a
corrected upload shows within five minutes instead of a day.

**Failure this prevents:** HCMC, October 2026. Thirteen hero GLBs were
"uploaded" three times without `--remote`. Production R2 kept the 732-byte
placeholders and a 24 h edge cache hid them further; the fix needed a new
`/api/hcmc/3d/v2/models` URL.

---

## Appendix — Where these rules come from

| Rule | System | Failure |
|---|---|---|
| 1 (Date.now) | HCMC | Hydration warning on every cold load |
| 2 (inline DCE) | HCMC | `?scenario=` URL param silently dropped in prod |
| 3 (no fake green) | HCMC, TKC | Status showed "operational" while feeds dead |
| 4 (distinct reasons) | HCMC | Quota cap indistinguishable from data-shape mismatch |
| 5 (chained build) | HCMC | Old build shipped after a log redirect failed |
| 6 (service binding) | HCMC, Jakarta, KL | Two-URL system with auth/cookie mismatch |
| 7 (forward params) | HCMC | Deep links lost through iframe |
| 8 (read before cherry-pick) | HCMC | 460-line runbook from a closed PR shipped stale |
| 9 (privacy contract) | Kuching IOC | Visitor IPs sent to third party the moment a SyntaxError elsewhere was fixed |
| 10 (empty parses) | Kuching IOC | Page broken on every load when env var unset |
| 11 (audit as test) | HCMC, Jakarta, KL | Bugs returned weeks after the fix was committed |
| 12 (three-tier loader) | Kuching IOC, HCMC | Panels went blank on upstream 502 |
| 13 (dotfile ignore) | HCMC | `.DS_Store` publicly served for months |
| 14 (force-dynamic) | KL, HCMC | Prerendered pages referenced dead chunk hashes |
| 15 (render failures) | Kuching IOC | 12-hour outage looked like empty news |
| 16 (canonical hostname) | HCMC, Jakarta, KL | Stale bookmarks served older code |
| 17 (wrangler `--remote`) | HCMC | GLB uploads went to the local emulator; live served 732-byte placeholders |

When a new system is born in this workspace, copy this file into it as
`BEST-PRACTICES.md` and reference it from the project's `CLAUDE.md`.
When a new failure is diagnosed, append its rule here with the
provenance.
