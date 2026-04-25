-- Rate limiting for benchmark submissions
CREATE TABLE IF NOT EXISTS submission_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (token_id) REFERENCES tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_token_id ON submission_rate_limits(token_id);
CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_ip ON submission_rate_limits(ip);
CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_created_at ON submission_rate_limits(created_at);

-- Flagging suspicious submissions
ALTER TABLE submissions ADD COLUMN is_flagged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN flag_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_is_flagged ON submissions(is_flagged);
