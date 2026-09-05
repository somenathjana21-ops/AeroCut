CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  filepath TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  type TEXT NOT NULL,
  tag TEXT NOT NULL,
  duration_sec REAL,
  width INTEGER, height INTEGER, fps REAL,
  has_audio INTEGER,
  mtime INTEGER NOT NULL,           -- cache key for re-probing
  scanned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  prompt TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  voice TEXT,
  edl_json TEXT,                    -- persisted for resume + debugging
  audio_timeline_json TEXT,
  props_json TEXT,
  output_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  stage TEXT NOT NULL,
  level TEXT NOT NULL,              -- info | warn | error
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
