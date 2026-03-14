import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  createTestToken,
  createTestSubmission,
  createTestBenchmarkVersion,
} from "../helpers";

const db = env.prod_pinchbench;

// ---------------------------------------------------------------------------
// GET /api/submissions
// ---------------------------------------------------------------------------
describe("GET /api/submissions", () => {
  it("returns empty list when no submissions exist", async () => {
    const res = await SELF.fetch("https://example.com/api/submissions");
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.submissions).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.has_more).toBe(false);
  });

  it("returns submissions with expected shape", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id);

    const res = await SELF.fetch("https://example.com/api/submissions");
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.submissions).toHaveLength(1);

    const sub = body.submissions[0];
    expect(sub).toHaveProperty("id");
    expect(sub).toHaveProperty("model");
    expect(sub).toHaveProperty("provider");
    expect(sub).toHaveProperty("score_percentage");
    expect(sub).toHaveProperty("total_score");
    expect(sub).toHaveProperty("max_score");
    expect(sub).toHaveProperty("timestamp");
    expect(sub).toHaveProperty("claimed");
    expect(sub).toHaveProperty("official");
  });

  it("paginates with limit and offset", async () => {
    const token = await createTestToken(db);
    for (let i = 0; i < 5; i++) {
      await createTestSubmission(db, token.id, {
        score_percentage: (5 - i) / 10,
      });
    }

    const res1 = await SELF.fetch(
      "https://example.com/api/submissions?limit=2&offset=0"
    );
    const body1 = await res1.json<any>();
    expect(body1.submissions).toHaveLength(2);
    expect(body1.total).toBe(5);
    expect(body1.has_more).toBe(true);

    const res2 = await SELF.fetch(
      "https://example.com/api/submissions?limit=2&offset=4"
    );
    const body2 = await res2.json<any>();
    expect(body2.submissions).toHaveLength(1);
    expect(body2.has_more).toBe(false);
  });

  it("filters by model", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, {
      model: "anthropic/claude-sonnet-4",
    });
    await createTestSubmission(db, token.id, {
      model: "openai/gpt-4o",
    });

    const res = await SELF.fetch(
      "https://example.com/api/submissions?model=anthropic/claude-sonnet-4"
    );
    const body = await res.json<any>();
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].model).toBe("anthropic/claude-sonnet-4");
  });

  it("filters by provider", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, { provider: "anthropic" });
    await createTestSubmission(db, token.id, { provider: "openai" });

    const res = await SELF.fetch(
      "https://example.com/api/submissions?provider=anthropic"
    );
    const body = await res.json<any>();
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].provider).toBe("anthropic");
  });

  it("sorts by score descending by default", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, { score_percentage: 0.5 });
    await createTestSubmission(db, token.id, { score_percentage: 0.9 });
    await createTestSubmission(db, token.id, { score_percentage: 0.7 });

    const res = await SELF.fetch("https://example.com/api/submissions");
    const body = await res.json<any>();

    const scores = body.submissions.map(
      (s: any) => s.score_percentage
    );
    expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
  });

  it("sorts by recent when sort=recent", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, {
      timestamp: "2025-01-01T00:00:00Z",
      score_percentage: 0.9,
    });
    await createTestSubmission(db, token.id, {
      timestamp: "2025-06-01T00:00:00Z",
      score_percentage: 0.5,
    });
    await createTestSubmission(db, token.id, {
      timestamp: "2025-03-01T00:00:00Z",
      score_percentage: 0.7,
    });

    const res = await SELF.fetch(
      "https://example.com/api/submissions?sort=recent"
    );
    const body = await res.json<any>();

    const timestamps = body.submissions.map((s: any) => s.timestamp);
    expect(timestamps).toEqual(
      [...timestamps].sort(
        (a: string, b: string) =>
          new Date(b).getTime() - new Date(a).getTime()
      )
    );
  });

  it("sorts by oldest when sort=oldest", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, {
      timestamp: "2025-01-01T00:00:00Z",
      score_percentage: 0.5,
    });
    await createTestSubmission(db, token.id, {
      timestamp: "2025-06-01T00:00:00Z",
      score_percentage: 0.9,
    });
    await createTestSubmission(db, token.id, {
      timestamp: "2025-03-01T00:00:00Z",
      score_percentage: 0.7,
    });

    const res = await SELF.fetch(
      "https://example.com/api/submissions?sort=oldest"
    );
    const body = await res.json<any>();

    const timestamps = body.submissions.map((s: any) => s.timestamp);
    expect(timestamps).toEqual(
      [...timestamps].sort(
        (a: string, b: string) =>
          new Date(a).getTime() - new Date(b).getTime()
      )
    );
  });

  it("filters by verified=true (only claimed tokens)", async () => {
    const claimed = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    const unclaimed = await createTestToken(db);

    await createTestSubmission(db, claimed.id);
    await createTestSubmission(db, unclaimed.id);

    const res = await SELF.fetch(
      "https://example.com/api/submissions?verified=true"
    );
    const body = await res.json<any>();
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].claimed).toBe(1);
  });

  it("filters by official=true", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, { official: 1 });
    await createTestSubmission(db, token.id, { official: 0 });

    const res = await SELF.fetch(
      "https://example.com/api/submissions?official=true"
    );
    const body = await res.json<any>();
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].official).toBe(1);
  });

  it("response includes weights and hf_link metadata fields", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id);

    const res = await SELF.fetch("https://example.com/api/submissions");
    const body = await res.json<any>();
    const sub = body.submissions[0];

    expect(sub).toHaveProperty("weights");
    expect(sub).toHaveProperty("hf_link");
  });
});

// ---------------------------------------------------------------------------
// GET /api/submissions/:id
// ---------------------------------------------------------------------------
describe("GET /api/submissions/:id", () => {
  it("returns submission details", async () => {
    const token = await createTestToken(db);
    const sub = await createTestSubmission(db, token.id);

    const res = await SELF.fetch(
      `https://example.com/api/submissions/${sub.id}`
    );
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.submission).toBeDefined();
    expect(body.submission.id).toBe(sub.id);
    expect(body.submission).toHaveProperty("model");
    expect(body.submission).toHaveProperty("provider");
    expect(body.submission).toHaveProperty("score_percentage");
    expect(body.submission).toHaveProperty("total_score");
    expect(body.submission).toHaveProperty("max_score");
    expect(body.submission).toHaveProperty("tasks");
    expect(body.submission).toHaveProperty("usage_summary");
    expect(body.submission).toHaveProperty("metadata");
    expect(body.submission).toHaveProperty("verified");
    expect(body.submission).toHaveProperty("official");
    expect(body.submission).toHaveProperty("verified_by");
    expect(body.submission).toHaveProperty("weights");
    expect(body.submission).toHaveProperty("hf_link");
    expect(body).toHaveProperty("rank");
    expect(body).toHaveProperty("total_submissions");
    expect(body).toHaveProperty("percentile");
  });

  it("returns 404 for non-existent submission", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/submissions/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status).toBe(404);

    const body = await res.json<any>();
    expect(body.error).toBe("not_found");
  });

  it("returns tasks as parsed JSON array", async () => {
    const token = await createTestToken(db);
    const sub = await createTestSubmission(db, token.id, {
      tasks: JSON.stringify([
        { task_id: "t1", score: 5, max_score: 10 },
        { task_id: "t2", score: 8, max_score: 10 },
      ]),
    });

    const res = await SELF.fetch(
      `https://example.com/api/submissions/${sub.id}`
    );
    const body = await res.json<any>();

    expect(Array.isArray(body.submission.tasks)).toBe(true);
    expect(body.submission.tasks).toHaveLength(2);
    expect(body.submission.tasks[0].task_id).toBe("t1");
  });

  it("shows verified_by for claimed token submissions", async () => {
    const token = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "octocat",
      github_id: 99999,
    });
    const sub = await createTestSubmission(db, token.id);

    const res = await SELF.fetch(
      `https://example.com/api/submissions/${sub.id}`
    );
    const body = await res.json<any>();

    expect(body.submission.verified).toBe(true);
    expect(body.submission.verified_by).toBe("octocat");
  });
});

// ---------------------------------------------------------------------------
// GET /api/model-submissions
// ---------------------------------------------------------------------------
describe("GET /api/model-submissions", () => {
  it("returns 400 when model param is missing", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/model-submissions"
    );
    expect(res.status).toBe(400);
  });

  it("returns submissions for specified model", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, {
      model: "anthropic/claude-sonnet-4",
    });
    await createTestSubmission(db, token.id, {
      model: "openai/gpt-4o",
    });

    const res = await SELF.fetch(
      "https://example.com/api/model-submissions?model=anthropic/claude-sonnet-4"
    );
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.model).toBe("anthropic/claude-sonnet-4");
    expect(body.submissions).toBeDefined();
    expect(Array.isArray(body.submissions)).toBe(true);
    for (const sub of body.submissions) {
      expect(sub).toHaveProperty("id");
      expect(sub).toHaveProperty("score_percentage");
    }
  });

  it("marks the best submission with is_best", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id, {
      model: "anthropic/claude-sonnet-4",
      score_percentage: 0.6,
    });
    await createTestSubmission(db, token.id, {
      model: "anthropic/claude-sonnet-4",
      score_percentage: 0.95,
    });
    await createTestSubmission(db, token.id, {
      model: "anthropic/claude-sonnet-4",
      score_percentage: 0.8,
    });

    const res = await SELF.fetch(
      "https://example.com/api/model-submissions?model=anthropic/claude-sonnet-4"
    );
    const body = await res.json<any>();

    const best = body.submissions.filter((s: any) => s.is_best === true);
    const notBest = body.submissions.filter((s: any) => s.is_best === false);

    expect(best).toHaveLength(1);
    expect(best[0].score_percentage).toBe(0.95);
    expect(notBest).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/me/submissions
// ---------------------------------------------------------------------------
describe("GET /api/me/submissions", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/me/submissions"
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid token", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/me/submissions",
      {
        headers: { "X-PinchBench-Token": "pb_live_invalid_token" },
      }
    );
    expect(res.status).toBe(401);
  });

  it("returns own submissions", async () => {
    const token = await createTestToken(db);
    const sub1 = await createTestSubmission(db, token.id, {
      model: "anthropic/claude-sonnet-4",
    });
    const sub2 = await createTestSubmission(db, token.id, {
      model: "openai/gpt-4o",
    });

    const res = await SELF.fetch(
      "https://example.com/api/me/submissions",
      {
        headers: { "X-PinchBench-Token": token.rawToken },
      }
    );
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.submissions).toHaveLength(2);

    const ids = body.submissions.map((s: any) => s.id);
    expect(ids).toContain(sub1.id);
    expect(ids).toContain(sub2.id);
  });

  it("does not return other users' submissions", async () => {
    const token1 = await createTestToken(db);
    const token2 = await createTestToken(db);

    await createTestSubmission(db, token1.id, { model: "model-a" });
    await createTestSubmission(db, token2.id, { model: "model-b" });

    const res = await SELF.fetch(
      "https://example.com/api/me/submissions",
      {
        headers: { "X-PinchBench-Token": token1.rawToken },
      }
    );
    const body = await res.json<any>();

    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].model).toBe("model-a");
  });

  it("returns token_claimed false for unclaimed token", async () => {
    const token = await createTestToken(db);
    await createTestSubmission(db, token.id);

    const res = await SELF.fetch(
      "https://example.com/api/me/submissions",
      {
        headers: { "X-PinchBench-Token": token.rawToken },
      }
    );
    const body = await res.json<any>();
    expect(body.token_claimed).toBe(false);
  });

  it("returns token_claimed true for claimed token", async () => {
    const token = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "claimeduser",
      github_id: 55555,
    });
    await createTestSubmission(db, token.id);

    const res = await SELF.fetch(
      "https://example.com/api/me/submissions",
      {
        headers: { "X-PinchBench-Token": token.rawToken },
      }
    );
    const body = await res.json<any>();
    expect(body.token_claimed).toBe(true);
  });

  it("paginates with limit and offset", async () => {
    const token = await createTestToken(db);
    for (let i = 0; i < 5; i++) {
      await createTestSubmission(db, token.id, {
        score_percentage: (5 - i) / 10,
      });
    }

    const res1 = await SELF.fetch(
      "https://example.com/api/me/submissions?limit=2&offset=0",
      {
        headers: { "X-PinchBench-Token": token.rawToken },
      }
    );
    const body1 = await res1.json<any>();
    expect(body1.submissions).toHaveLength(2);
    expect(body1.total).toBe(5);
    expect(body1.has_more).toBe(true);

    const res2 = await SELF.fetch(
      "https://example.com/api/me/submissions?limit=2&offset=4",
      {
        headers: { "X-PinchBench-Token": token.rawToken },
      }
    );
    const body2 = await res2.json<any>();
    expect(body2.submissions).toHaveLength(1);
    expect(body2.has_more).toBe(false);
  });
});
