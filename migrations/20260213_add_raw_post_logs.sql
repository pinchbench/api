-- Raw POST request logging for debugging
CREATE TABLE IF NOT EXISTS raw_post_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  headers TEXT,
  body TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_raw_post_logs_created_at ON raw_post_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_raw_post_logs_path ON raw_post_logs(path);
