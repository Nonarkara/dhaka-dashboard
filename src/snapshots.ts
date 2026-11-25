import type { CollageResult } from "./collage.js";
import { withSourceArchive } from "./source-fetch.js";
import { PUBLICATION_CONTRACT_VERSION, PUBLICATION_CLOCK_SKEW_MS, validateCollagePublication, recordPublicationMethods } from "./publication-contract.js";

export interface SnapshotEnv { OBSERVATION_ARCHIVE?: R2Bucket; OBSERVATION_DB?: D1Database }
export const SNAPSHOT_SCHEMA = 3;
const REFRESH_MS = 2 * 3600000;
const FRESH_MS = 4 * 3600000;
const MAX_AGE_MS = 7 * 86400000;
interface StoredSnapshot { schemaVersion: number; publicationContractVersion?: number; id: string; collectedAt: string; data: CollageResult }
export interface Delivery { status: "fresh" | "stale"; collectedAt: string; ageSeconds: number; snapshotId: string; source: "persistent-snapshot"; reasonCode: string | null }

/** Preserve the existing public validator entry point for current publications. */
export function validateCollage(data: CollageResult): void {
  validateCollagePublication(data);
}

function validateStoredSnapshot(snapshot: StoredSnapshot, now = Date.now()): void {
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA ||
      (snapshot.publicationContractVersion !== undefined && snapshot.publicationContractVersion !== PUBLICATION_CONTRACT_VERSION)) throw Error("invalid-snapshot-contract-version");
  const collectedAt = Date.parse(snapshot.collectedAt);
  if (!Number.isFinite(collectedAt) || collectedAt > now + PUBLICATION_CLOCK_SKEW_MS ||
      Date.parse(snapshot.data?.timestamp) > collectedAt + PUBLICATION_CLOCK_SKEW_MS) throw Error("invalid-snapshot-timestamp");
  validateCollagePublication(snapshot.data, { legacy: snapshot.publicationContractVersion === undefined, requireMethods: snapshot.publicationContractVersion === PUBLICATION_CONTRACT_VERSION, now });
}

export function snapshotDelivery(snapshot: StoredSnapshot, now = Date.now()): Delivery | null {
  const time = Date.parse(snapshot.collectedAt), age = now - time;
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA || !Number.isFinite(time) || age < 0 || age > MAX_AGE_MS) return null;
  return { status: age <= FRESH_MS ? "fresh" : "stale", collectedAt: snapshot.collectedAt,
    ageSeconds: Math.floor(age / 1000), snapshotId: snapshot.id, source: "persistent-snapshot",
    reasonCode: age <= FRESH_MS ? null : "collector-overdue" };
}

/** Pure storage read: a cold visitor never starts a satellite acquisition. */
export async function readSnapshot(env: SnapshotEnv): Promise<(CollageResult & { delivery: Delivery }) | null> {
  if (!env.OBSERVATION_DB || !env.OBSERVATION_ARCHIVE) return null;
  try {
    const row = await env.OBSERVATION_DB.prepare("SELECT s.id,s.object_key FROM collector_state c JOIN snapshots s ON c.published_id=s.id WHERE c.name='collage'").first<{ id: string; object_key: string }>();
    if (!row) return null;
    const object = await env.OBSERVATION_ARCHIVE.get(row.object_key);
    if (!object) return null;
    const snapshot = await object.json<StoredSnapshot>();
    if (snapshot.id !== row.id) throw Error("invalid-snapshot-identity");
    const delivery = snapshotDelivery(snapshot);
    if (!delivery) return null;
    validateStoredSnapshot(snapshot);
    return { ...snapshot.data, delivery };
  } catch { return null; }
}

export async function collectSnapshot(env: SnapshotEnv, build: () => Promise<CollageResult>, now = Date.now(), force = false): Promise<string> {
  const db = env.OBSERVATION_DB, bucket = env.OBSERVATION_ARCHIVE;
  if (!db || !bucket) throw Error("snapshot-storage-not-configured");
  const id = crypto.randomUUID(), started = new Date(now).toISOString();
  const lock = await db.prepare(`UPDATE collector_state SET lease_owner=?,lease_until=?,last_attempt_at=?
    WHERE name='collage' AND lease_until<=? AND (?=1 OR last_success_at IS NULL OR last_success_at<=?)`)
    .bind(id, now + 15 * 60000, started, now, force ? 1 : 0, new Date(now - REFRESH_MS).toISOString()).run();
  if (!lock.meta.changes) return "not-due-or-running";
  let rawCount = 0;
  try {
    await db.prepare("INSERT INTO ingestion_runs(id,started_at,status,trigger_source) VALUES (?,?,'collecting',?)").bind(id, started, force ? "manual" : "scheduled").run();
    const data = await withSourceArchive(async (url, response) => {
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(n => n.toString(16).padStart(2, "0")).join("");
      const urlDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)))).map(n => n.toString(16).padStart(2, "0")).join("");
      const key = `raw/${id}/${urlDigest}-${response.status}-${digest}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: response.headers.get("content-type") || "application/octet-stream" },
        customMetadata: { url, status: String(response.status), retrievedAt: new Date().toISOString() } });
      rawCount++;
    }, build);
    validateCollage(data);
    recordPublicationMethods(data);
    const collectedAt = new Date().toISOString();
    const key = `snapshots/v${SNAPSHOT_SCHEMA}/${id}.json`;
    const snapshot: StoredSnapshot = { schemaVersion: SNAPSHOT_SCHEMA, publicationContractVersion: PUBLICATION_CONTRACT_VERSION, id, collectedAt, data };
    await bucket.put(key, JSON.stringify(snapshot), { httpMetadata: { contentType: "application/json" } });
    // The immutable object must exist first. All published rows and the pointer
    // commit in one D1 transaction, conditional on still owning the lease.
    const guard = "EXISTS (SELECT 1 FROM collector_state WHERE name='collage' AND lease_owner=? AND lease_until>? AND (published_at IS NULL OR published_at<?))";
    const statements = [db.prepare(`INSERT INTO snapshots(id,collected_at,object_key,schema_version,measured,total)
      SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id, collectedAt, key, SNAPSHOT_SCHEMA, data.measured, data.total, id, Date.now(), collectedAt)];
    for (const place of data.districts) for (const m of place.measurements) {
      statements.push(db.prepare(`INSERT INTO sample_history(snapshot_id,place_id,layer_id,status,value,unit,observation_date,period,coverage,reason_code,metadata_json)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM snapshots WHERE id=?)`)
        .bind(id, place.id, m.layerId, m.status, m.value, m.unit, m.observationDate, m.period ?? m.vintage, m.coverage, m.reasonCode, JSON.stringify(m), id));
    }
    statements.push(db.prepare(`UPDATE collector_state SET published_id=?,published_at=?,last_success_at=?,reason_code=NULL,lease_until=0,lease_owner=NULL
      WHERE name='collage' AND lease_owner=? AND EXISTS(SELECT 1 FROM snapshots WHERE id=?)`).bind(id, collectedAt, collectedAt, id, id));
    statements.push(db.prepare("UPDATE ingestion_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM snapshots WHERE id=?) THEN 'published' ELSE 'superseded' END,finished_at=?,raw_responses=? WHERE id=?").bind(id, collectedAt, rawCount, id));
    const results = await db.batch(statements);
    if (!results[0].meta.changes) return "superseded";
    return "published";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason = /^(insufficient|invalid|duplicate)-snapshot-[a-z-]+$/.test(message) ? message : "collection-or-storage-failed";
    await db.batch([
      db.prepare("UPDATE collector_state SET lease_until=0,lease_owner=NULL,reason_code=? WHERE name='collage' AND lease_owner=?").bind(reason, id),
      db.prepare("UPDATE ingestion_runs SET status='failed',finished_at=?,reason_code=?,raw_responses=? WHERE id=?").bind(new Date().toISOString(), reason, rawCount, id),
    ]);
    return "failed";
  }
}

export async function sourceHealth(env: SnapshotEnv) {
  try {
  if (!env.OBSERVATION_DB) return { status: "unavailable", reasonCode: "snapshot-storage-not-configured", timestamp: new Date().toISOString() };
  const state = await env.OBSERVATION_DB.prepare("SELECT last_attempt_at,last_success_at,last_scheduled_at,reason_code,published_id FROM collector_state WHERE name='collage'").first();
  const runs = await env.OBSERVATION_DB.prepare("SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 10").all();
  const snapshot = await readSnapshot(env);
  return { status: snapshot?.delivery.status ?? "unavailable", reasonCode: snapshot ? snapshot.delivery.reasonCode : "published-snapshot-unavailable",
    timestamp: new Date().toISOString(), collector: state, runs: runs.results, delivery: snapshot?.delivery ?? null,
    sources: snapshot?.districts[0]?.measurements.map(m => ({ layerId: m.layerId, source: m.source, period: m.period,
      observationDate: m.observationDate, vintage: m.vintage, availablePlaces: snapshot.districts.filter(d=>d.measurements.some(x=>x.layerId===m.layerId&&x.status==='ok')).length, totalPlaces: snapshot.districts.length })) ?? [] };
  } catch { return {status:"unavailable",reasonCode:"snapshot-database-unreachable",timestamp:new Date().toISOString()}; }

}

export async function observationHistory(env: SnapshotEnv, place: string | null, signal: string | null) {
  try {
  if (!env.OBSERVATION_DB) return { status: "unavailable", reasonCode: "snapshot-storage-not-configured", timestamp: new Date().toISOString(), records: [] };
  const result = place && signal
    ? await env.OBSERVATION_DB.prepare(`SELECT o.*,s.collected_at FROM sample_history o JOIN snapshots s ON s.id=o.snapshot_id WHERE o.place_id=? AND o.layer_id=? ORDER BY s.collected_at DESC LIMIT 60`).bind(place, signal).all()
    : await env.OBSERVATION_DB.prepare("SELECT * FROM snapshots ORDER BY collected_at DESC LIMIT 30").all();
  const records = result.results.map((row: Record<string,unknown>) => ({...row,metadata:typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : null,snapshotUrl:`/api/atlas/history?snapshot=${row.snapshot_id ?? row.id}`}));
  return { status: result.results.length ? "ok" : "unavailable", reasonCode: result.results.length ? null : "no-stored-history", timestamp: new Date().toISOString(), records };
  } catch { return {status:"unavailable",reasonCode:"snapshot-database-unreachable",timestamp:new Date().toISOString(),records:[]}; }

}

/** Immutable published snapshot retains the original spatial/source contract. */
export async function historicalSnapshot(env: SnapshotEnv, id: string) {
  try {
    if (!env.OBSERVATION_DB || !env.OBSERVATION_ARCHIVE) throw Error('storage');
    const row = await env.OBSERVATION_DB.prepare("SELECT object_key FROM snapshots WHERE id=?").bind(id).first<{object_key:string}>();
    const object = row && await env.OBSERVATION_ARCHIVE.get(row.object_key);
    if (!object) return {status:"unavailable",reasonCode:"historical-snapshot-not-found",timestamp:new Date().toISOString()};
    const stored = await object.json<StoredSnapshot>();
    if (stored.id !== id) throw Error("invalid-snapshot-identity");
    validateStoredSnapshot(stored);
    return {status:"historical",schemaVersion:stored.schemaVersion,publicationContractVersion:stored.publicationContractVersion ?? null,snapshotId:stored.id,collectedAt:stored.collectedAt,data:stored.data};
  } catch (error) { return {status:"unavailable",reasonCode:error instanceof Error && error.message.startsWith("invalid-snapshot-") ? error.message : "snapshot-storage-unreachable",timestamp:new Date().toISOString()}; }
}
