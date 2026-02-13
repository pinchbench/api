-- Tokens registered for API access
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  claim_code TEXT,
  claim_expires_at TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS token_registration_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Benchmark submissions
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT,
  total_score REAL NOT NULL,
  max_score REAL NOT NULL,
  score_percentage REAL NOT NULL,
  total_execution_time_seconds REAL,
  total_cost_usd REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  timestamp TEXT NOT NULL,
  client_version TEXT,
  openclaw_version TEXT,
  run_id TEXT,
  benchmark_version TEXT,
  tasks TEXT NOT NULL,
  usage_summary TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (token_id) REFERENCES tokens(id)
);

CREATE TABLE IF NOT EXISTS benchmark_versions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  current INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_submissions_model ON submissions(model);
CREATE INDEX IF NOT EXISTS idx_submissions_provider ON submissions(provider);
CREATE INDEX IF NOT EXISTS idx_submissions_timestamp ON submissions(timestamp);
CREATE INDEX IF NOT EXISTS idx_submissions_score_percentage ON submissions(score_percentage);
CREATE INDEX IF NOT EXISTS idx_token_registration_limits_ip ON token_registration_limits(ip);
CREATE INDEX IF NOT EXISTS idx_token_registration_limits_created_at ON token_registration_limits(created_at);
