ALTER TABLE collector_state ADD COLUMN last_scheduled_at TEXT;
ALTER TABLE ingestion_runs ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'legacy-unknown';
