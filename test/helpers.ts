import { env } from "cloudflare:test";
import type { D1Database } from "@cloudflare/workers-types";
import type { Hono } from "hono";

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomUUID(): string {
  return crypto.randomUUID();
}

export async function createTestToken(
  db: D1Database,
  overrides: {
    claimed_at?: string;
    github_username?: string;
    github_id?: number;
    claim_code?: string;
    claim_expires_at?: string;
  } = {}
): Promise<{ id: string; rawToken: string; tokenHash: string }> {
  const id = randomUUID();
  const rawToken = `pb_live_${randomHex(16)}`;
  const tokenHash = await hashToken(rawToken);

  await db
    .prepare(
      `INSERT INTO tokens (id, token_hash, claimed_at, github_username, github_id, claim_code, claim_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tokenHash,
      overrides.claimed_at ?? null,
      overrides.github_username ?? null,
      overrides.github_id ?? null,
      overrides.claim_code ?? null,
      overrides.claim_expires_at ?? null
    )
    .run();

  return { id, rawToken, tokenHash };
}

export async function createTestSubmission(
  db: D1Database,
  tokenId: string,
  overrides: {
    id?: string;
    model?: string;
    provider?: string;
    total_score?: number;
    max_score?: number;
    score_percentage?: number;
    timestamp?: string;
    tasks?: string;
    total_execution_time_seconds?: number;
    total_cost_usd?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    client_version?: string;
    openclaw_version?: string;
    run_id?: string;
    benchmark_version?: string;
    usage_summary?: string;
    metadata?: string;
    official?: number;
  } = {}
) {
  const id = overrides.id ?? randomUUID();
  const model = overrides.model ?? "anthropic/claude-sonnet-4";
  const provider = overrides.provider ?? "anthropic";
  const total_score = overrides.total_score ?? 42;
  const max_score = overrides.max_score ?? 50;
  const score_percentage = overrides.score_percentage ?? 0.84;
  const timestamp = overrides.timestamp ?? new Date().toISOString();
  const tasks =
    overrides.tasks ??
    JSON.stringify([{ task_id: "task_1", score: 8, max_score: 10 }]);

  await db
    .prepare(
      `INSERT INTO submissions (
        id, token_id, model, provider, total_score, max_score, score_percentage,
        total_execution_time_seconds, total_cost_usd, input_tokens, output_tokens,
        total_tokens, timestamp, client_version, openclaw_version, run_id,
        benchmark_version, tasks, usage_summary, metadata, official
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tokenId,
      model,
      provider,
      total_score,
      max_score,
      score_percentage,
      overrides.total_execution_time_seconds ?? null,
      overrides.total_cost_usd ?? null,
      overrides.input_tokens ?? null,
      overrides.output_tokens ?? null,
      overrides.total_tokens ?? null,
      timestamp,
      overrides.client_version ?? null,
      overrides.openclaw_version ?? null,
      overrides.run_id ?? null,
      overrides.benchmark_version ?? null,
      tasks,
      overrides.usage_summary ?? null,
      overrides.metadata ?? null,
      overrides.official ?? 0
    )
    .run();

  return {
    id,
    token_id: tokenId,
    model,
    provider,
    total_score,
    max_score,
    score_percentage,
    timestamp,
    tasks,
  };
}

export async function createTestBenchmarkVersion(
  db: D1Database,
  id: string,
  overrides: {
    current?: number;
    hidden?: number;
  } = {}
) {
  const current = overrides.current ?? 1;
  const hidden = overrides.hidden ?? 0;

  await db
    .prepare(
      `INSERT INTO benchmark_versions (id, current, hidden) VALUES (?, ?, ?)`
    )
    .bind(id, current, hidden)
    .run();

  return { id, current, hidden };
}

export async function makeRequest(
  app: Hono,
  path: string,
  options?: RequestInit
): Promise<Response> {
  return app.request(path, options, env);
}
