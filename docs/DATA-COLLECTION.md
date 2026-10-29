# Collection and recovery

The collage is collected by the Worker scheduled handler. Cron checks every15minutes; it exits without acquisition if a snapshot succeeded within2hours or another collector holds the15minute lease. Visitors read private R2 through the Worker; no R2 public domain or anonymous write endpoint is enabled.

D1 migrations run before canonical deployment. R2 archives upstream response bodies under raw/run-id/url-hash-status-body-hash and snapshots under snapshots/v3/run-id.json. D1 snapshot publication and normalized history commit together after the immutable object exists. Failed attempts retain the previous pointer. Unpublished raw/orphan objects are private forensic evidence, not served as observations. Monitor /api/atlas/sources for last_attempt_at, last_success_at, failure reason, available-place counts and original source dates.

For a deliberate bootstrap/recollection, run `npx wrangler dev --remote --test-scheduled --port 8792`, wait for Ready, then `curl 'http://localhost:8792/__scheduled?cron=manual'`. This invokes the preview's scheduled handler with remote bindings; it is not a production HTTP write endpoint. Manual collection ignores the2hour due guard but cannot override another lease. Stop the preview after verification. Ordinary deployed cron uses the configured schedule and cannot be forced by a public query parameter.

Scheduler provenance is recorded separately from successful publication. `collector.last_scheduled_at` is the platform scheduled time for the last automatic wake, including no-op wakes when a snapshot is not due. `runs[].trigger_source` distinguishes `scheduled`, `manual`, and `legacy-unknown`; old bootstrap rows are not retrospectively called automatic. A wake is not proof of a new acquisition or publication. A failed collector rejects the scheduled handler so the platform records failure, while source health retains the run reason and previous publication.

The population/facilities lens is a separately dated static reference, not part of this automatic satellite collector. See [PEOPLE-DATA.md](PEOPLE-DATA.md) for its source licences, metric aggregation, explicit rebuild and private raw-input restore path.

Read APIs:
- /api/atlas/collage: published data plus collection age/fresh-or-stale envelope.
- /api/atlas/sources: collection and source health, including unavailable failures.
- /api/atlas/history: latest30 collected snapshot records.
- /api/atlas/history?place=parliament&signal=VIIRS_SNPP_DayNightBand_At_Sensor_Radiance: up to60 original records.
- /api/atlas/history?snapshot=UUID: original immutable snapshot, explicitly historical.

Data older than4hours is stale; older than7days is unavailable as current but remains historical. A fresh collection is not a new acquisition: source observation dates, climatology period and static vintage remain separate. No interval interpolation or inferred local flood warning is supplied. The collector's minimum-half completeness gate is not a hazard threshold. History begins with this release; equal acquisition values across multiple collection runs are not independent observations.

Remote resource operations require --remote. A local emulator success does not prove production persistence. Use `node scripts/verify-snapshots-live.mjs` after deployment and inspect a remote R2 object plus D1 rows when testing restores. Keep both bindings configured: a partially available store yields an explicit unavailable view instead of triggering visitor acquisition.
