import { env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";

beforeAll(async () => {
  await env.prod_pinchbench.batch([
    env.prod_pinchbench.prepare(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        token_hash TEXT NOT NULL UNIQUE,
        claim_code TEXT,
        claim_expires_at TEXT,
        claimed_at TEXT,
        github_id INTEGER,
        github_username TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT
      )
    `),
    env.prod_pinchbench.prepare(`
      CREATE TABLE IF NOT EXISTS token_registration_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `),
    env.prod_pinchbench.prepare(`
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
        official INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (token_id) REFERENCES tokens(id)
      )
    `),
    env.prod_pinchbench.prepare(`
      CREATE TABLE IF NOT EXISTS benchmark_versions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        current INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0
      )
    `),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_submissions_model ON submissions(model)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_submissions_provider ON submissions(provider)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_submissions_timestamp ON submissions(timestamp)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_submissions_score_percentage ON submissions(score_percentage)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_submissions_official ON submissions(official)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_tokens_github_username ON tokens(github_username)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_token_registration_limits_ip ON token_registration_limits(ip)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_token_registration_limits_created_at ON token_registration_limits(created_at)`),
    env.prod_pinchbench.prepare(`
      CREATE TABLE IF NOT EXISTS raw_post_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        headers TEXT,
        body TEXT,
        ip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_raw_post_logs_created_at ON raw_post_logs(created_at)`),
    env.prod_pinchbench.prepare(`CREATE INDEX IF NOT EXISTS idx_raw_post_logs_path ON raw_post_logs(path)`),
  ]);
});

beforeEach(async () => {
  await env.prod_pinchbench.batch([
    env.prod_pinchbench.prepare("DELETE FROM submissions"),
    env.prod_pinchbench.prepare("DELETE FROM tokens"),
    env.prod_pinchbench.prepare("DELETE FROM token_registration_limits"),
    env.prod_pinchbench.prepare("DELETE FROM benchmark_versions"),
    env.prod_pinchbench.prepare("DELETE FROM raw_post_logs"),
  ]);
});
