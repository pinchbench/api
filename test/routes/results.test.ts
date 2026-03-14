import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createTestToken } from "../helpers";

const db = env.prod_pinchbench;

const VALID_PAYLOAD = {
  submission_id: "550e8400-e29b-41d4-a716-446655440000",
  timestamp: "2026-03-13T12:00:00Z",
  model: "anthropic/claude-sonnet-4",
  provider: "anthropic",
  total_score: 42,
  max_score: 50,
  tasks: [{ task_id: "task_1", score: 8, max_score: 10 }],
};

function postResults(
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return SELF.fetch("https://example.com/api/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/results", () => {
  it("returns 201 with accepted status for valid submission", async () => {
    const token = await createTestToken(db);

    const response = await postResults(VALID_PAYLOAD, {
      "X-PinchBench-Token": token.rawToken,
    });

    expect(response.status).toBe(201);
    const body = await response.json<{
      status: string;
      submission_id: string;
      official: boolean;
      rank: number;
      percentile: number;
      leaderboard_url: string;
    }>();
    expect(body.status).toBe("accepted");
    expect(body.submission_id).toBe(VALID_PAYLOAD.submission_id);
    expect(body.official).toBe(false);
    expect(typeof body.rank).toBe("number");
    expect(typeof body.percentile).toBe("number");
    expect(body.leaderboard_url).toContain(VALID_PAYLOAD.submission_id);
  });

  it("returns 200 on duplicate submission (idempotency)", async () => {
    const token = await createTestToken(db);
    const headers = { "X-PinchBench-Token": token.rawToken };

    const first = await postResults(VALID_PAYLOAD, headers);
    expect(first.status).toBe(201);
    const firstBody = await first.json<{ status: string }>();
    expect(firstBody.status).toBe("accepted");

    const second = await postResults(VALID_PAYLOAD, headers);
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ status: string }>();
    expect(secondBody.status).toBe("accepted");
  });

  it("returns 401 when auth token is missing", async () => {
    const response = await SELF.fetch("https://example.com/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(response.status).toBe(401);
  });

  it("returns 401 when auth token is invalid", async () => {
    const response = await postResults(VALID_PAYLOAD, {
      "X-PinchBench-Token": "pb_live_invalidtoken",
    });

    expect(response.status).toBe(401);
  });

  it("returns 422 when Content-Type is missing", async () => {
    const token = await createTestToken(db);

    const response = await SELF.fetch("https://example.com/api/results", {
      method: "POST",
      headers: { "X-PinchBench-Token": token.rawToken },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(response.status).toBe(422);
  });

  it("returns 422 with detail when body is invalid JSON", async () => {
    const token = await createTestToken(db);

    const response = await SELF.fetch("https://example.com/api/results", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PinchBench-Token": token.rawToken,
      },
      body: "not-json",
    });

    expect(response.status).toBe(422);
    const body = await response.json<{ details: string[] }>();
    expect(body.details).toContain("Body must be valid JSON");
  });

  it("returns 422 when submission_id is missing", async () => {
    const token = await createTestToken(db);
    const { submission_id: _, ...payload } = VALID_PAYLOAD;

    const response = await postResults(payload, {
      "X-PinchBench-Token": token.rawToken,
    });

    expect(response.status).toBe(422);
    const body = await response.json<{ details: string[] }>();
    expect(body.details).toContain("submission_id must be a valid UUID v4");
  });

  it("returns 422 when submission_id is not a valid UUID", async () => {
    const token = await createTestToken(db);

    const response = await postResults(
      { ...VALID_PAYLOAD, submission_id: "not-a-uuid" },
      { "X-PinchBench-Token": token.rawToken },
    );

    expect(response.status).toBe(422);
  });

  it("returns 422 when model is missing", async () => {
    const token = await createTestToken(db);
    const { model: _, ...payload } = VALID_PAYLOAD;

    const response = await postResults(payload, {
      "X-PinchBench-Token": token.rawToken,
    });

    expect(response.status).toBe(422);
    const body = await response.json<{ details: string[] }>();
    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringContaining("model is required")]),
    );
  });

  it("returns 422 when tasks array is empty", async () => {
    const token = await createTestToken(db);

    const response = await postResults(
      { ...VALID_PAYLOAD, tasks: [] },
      { "X-PinchBench-Token": token.rawToken },
    );

    expect(response.status).toBe(422);
    const body = await response.json<{ details: string[] }>();
    expect(body.details).toContain("tasks must have at least one entry");
  });

  it("returns 422 when total_score exceeds max_score", async () => {
    const token = await createTestToken(db);

    const response = await postResults(
      { ...VALID_PAYLOAD, total_score: 60, max_score: 50 },
      { "X-PinchBench-Token": token.rawToken },
    );

    expect(response.status).toBe(422);
    const body = await response.json<{ details: string[] }>();
    expect(body.details).toContain(
      "total_score must be less than or equal to max_score",
    );
  });

  it("returns 422 when task score exceeds task max_score", async () => {
    const token = await createTestToken(db);

    const response = await postResults(
      {
        ...VALID_PAYLOAD,
        tasks: [{ task_id: "task_1", score: 15, max_score: 10 }],
      },
      { "X-PinchBench-Token": token.rawToken },
    );

    expect(response.status).toBe(422);
    const body = await response.json<{ details: string[] }>();
    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringContaining("tasks[0]")]),
    );
  });

  it("returns official: true when X-PinchBench-Official-Key matches", async () => {
    const token = await createTestToken(db);

    const response = await postResults(VALID_PAYLOAD, {
      "X-PinchBench-Token": token.rawToken,
      "X-PinchBench-Official-Key": "test-official-key",
    });

    expect(response.status).toBe(201);
    const body = await response.json<{ official: boolean }>();
    expect(body.official).toBe(true);
  });

  it("normalizes openrouter/ prefix from model name in DB", async () => {
    const token = await createTestToken(db);
    const submissionId = "550e8400-e29b-41d4-a716-446655440001";

    const response = await postResults(
      {
        ...VALID_PAYLOAD,
        submission_id: submissionId,
        model: "openrouter/anthropic/claude-sonnet-4",
      },
      { "X-PinchBench-Token": token.rawToken },
    );

    expect(response.status).toBe(201);

    const row = await db
      .prepare("SELECT model FROM submissions WHERE id = ?")
      .bind(submissionId)
      .first<{ model: string }>();

    expect(row?.model).toBe("anthropic/claude-sonnet-4");
  });

  it("returns 429 when submission rate limit is exceeded", async () => {
    const token = await createTestToken(db);

    // Insert 100 submissions for this token with recent created_at
    const stmts = Array.from({ length: 100 }, () =>
      db
        .prepare(
          `INSERT INTO submissions (
            id, token_id, model, provider, total_score, max_score,
            score_percentage, timestamp, tasks, official, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(
          crypto.randomUUID(),
          token.id,
          "test/model",
          "test",
          10,
          10,
          1.0,
          "2026-03-13T12:00:00Z",
          JSON.stringify([{ task_id: "t", score: 10, max_score: 10 }]),
          0,
        ),
    );

    // Batch in chunks of 50
    await db.batch(stmts.slice(0, 50));
    await db.batch(stmts.slice(50));

    const response = await postResults(
      {
        ...VALID_PAYLOAD,
        submission_id: crypto.randomUUID(),
      },
      { "X-PinchBench-Token": token.rawToken },
    );

    expect(response.status).toBe(429);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("rate_limited");
  });
});
