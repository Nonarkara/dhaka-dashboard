-- Expand without deleting the original ingestion history.
CREATE TABLE IF NOT EXISTS sample_history (
  snapshot_id TEXT NOT NULL, place_id TEXT NOT NULL, layer_id TEXT NOT NULL,
  status TEXT NOT NULL, value REAL, unit TEXT NOT NULL, observation_date TEXT,
  period TEXT, coverage REAL, reason_code TEXT, metadata_json TEXT,
  PRIMARY KEY(snapshot_id,place_id,layer_id)
);
CREATE INDEX IF NOT EXISTS sample_history_place_layer ON sample_history(place_id,layer_id,snapshot_id);
INSERT OR IGNORE INTO sample_history(snapshot_id,place_id,layer_id,status,value,unit,observation_date,period,coverage,reason_code)
SELECT snapshot_id,place_id,layer_id,status,value,unit,observation_date,period,
 CASE WHEN layer_id='NASA_POWER_ALLSKY_SFC_SW_DWN' THEN NULL ELSE coverage END,reason_code FROM observations;
