CREATE TABLE IF NOT EXISTS collector_state (
  name TEXT PRIMARY KEY, lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  published_id TEXT, published_at TEXT, last_attempt_at TEXT,
  last_success_at TEXT, reason_code TEXT
);
INSERT OR IGNORE INTO collector_state(name) VALUES ('collage');
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY, collected_at TEXT NOT NULL, object_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL, measured INTEGER NOT NULL, total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
  snapshot_id TEXT NOT NULL, place_id TEXT NOT NULL, layer_id TEXT NOT NULL,
  status TEXT NOT NULL, value REAL, unit TEXT NOT NULL, observation_date TEXT,
  period TEXT, coverage REAL NOT NULL, reason_code TEXT,
  PRIMARY KEY(snapshot_id, place_id, layer_id)
);
CREATE INDEX IF NOT EXISTS observations_place_layer ON observations(place_id,layer_id,snapshot_id);
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL, reason_code TEXT, raw_responses INTEGER NOT NULL DEFAULT 0
);
