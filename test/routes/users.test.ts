import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  createTestToken,
  createTestSubmission,
  createTestBenchmarkVersion,
} from "../helpers";

describe("GET /api/users/:github_username/submissions", () => {
  it("returns 404 when user is not found", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/users/nonexistent/submissions",
    );

    expect(response.status).toBe(404);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("not_found");
  });

  it("returns submissions for a user", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    await createTestSubmission(db, tokenId, {
      model: "claude-sonnet-4-20250514",
      score_percentage: 0.85,
    });
    await createTestSubmission(db, tokenId, {
      model: "claude-haiku-3",
      score_percentage: 0.72,
    });

    const response = await SELF.fetch(
      "https://example.com/api/users/testuser/submissions",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      github_username: string;
      submissions: unknown[];
      total: number;
      summary: {
        total_submissions: number;
        best_score_percentage: number | null;
      };
    }>();
    expect(body.github_username).toBe("testuser");
    expect(body.submissions).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.summary.total_submissions).toBe(2);
    expect(body.summary.best_score_percentage).toBe(0.85);
  });

  it("matches username case-insensitively", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    await createTestSubmission(db, tokenId);

    const response = await SELF.fetch(
      "https://example.com/api/users/TestUser/submissions",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ github_username: string }>();
    expect(body.github_username).toBe("testuser");
  });

  it("supports limit and offset pagination", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    for (let i = 0; i < 5; i++) {
      await createTestSubmission(db, tokenId, {
        score_percentage: 0.5 + i * 0.1,
      });
    }

    const response = await SELF.fetch(
      "https://example.com/api/users/testuser/submissions?limit=2&offset=0",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      submissions: unknown[];
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    }>();
    expect(body.submissions).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
    expect(body.has_more).toBe(true);

    // Fetch next page
    const response2 = await SELF.fetch(
      "https://example.com/api/users/testuser/submissions?limit=2&offset=4",
    );
    const body2 = await response2.json<{
      submissions: unknown[];
      has_more: boolean;
    }>();
    expect(body2.submissions).toHaveLength(1);
    expect(body2.has_more).toBe(false);
  });

  it("supports sort=score (default)", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    await createTestSubmission(db, tokenId, { score_percentage: 0.5 });
    await createTestSubmission(db, tokenId, { score_percentage: 0.9 });
    await createTestSubmission(db, tokenId, { score_percentage: 0.7 });

    const response = await SELF.fetch(
      "https://example.com/api/users/testuser/submissions?sort=score",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      submissions: Array<{ score_percentage: number }>;
    }>();
    expect(body.submissions[0].score_percentage).toBe(0.9);
    expect(body.submissions[1].score_percentage).toBe(0.7);
    expect(body.submissions[2].score_percentage).toBe(0.5);
  });

  it("supports sort=recent", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    await createTestSubmission(db, tokenId, {
      timestamp: "2024-01-01T00:00:00.000Z",
    });
    await createTestSubmission(db, tokenId, {
      timestamp: "2024-06-01T00:00:00.000Z",
    });
    await createTestSubmission(db, tokenId, {
      timestamp: "2024-03-01T00:00:00.000Z",
    });

    const response = await SELF.fetch(
      "https://example.com/api/users/testuser/submissions?sort=recent",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      submissions: Array<{ timestamp: string }>;
    }>();
    expect(body.submissions[0].timestamp).toBe("2024-06-01T00:00:00.000Z");
    expect(body.submissions[2].timestamp).toBe("2024-01-01T00:00:00.000Z");
  });

  it("supports sort=oldest", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    await createTestSubmission(db, tokenId, {
      timestamp: "2024-06-01T00:00:00.000Z",
    });
    await createTestSubmission(db, tokenId, {
      timestamp: "2024-01-01T00:00:00.000Z",
    });

    const response = await SELF.fetch(
      "https://example.com/api/users/testuser/submissions?sort=oldest",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      submissions: Array<{ timestamp: string }>;
    }>();
    expect(body.submissions[0].timestamp).toBe("2024-01-01T00:00:00.000Z");
    expect(body.submissions[1].timestamp).toBe("2024-06-01T00:00:00.000Z");
  });

  it("filters by benchmark version", async () => {
    const db = env.prod_pinchbench;
    await createTestBenchmarkVersion(db, "v1.0.0", { current: 0 });
    await createTestBenchmarkVersion(db, "v2.0.0", { current: 1 });
    const { id: tokenId } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });
    await createTestSubmission(db, tokenId, { benchmark_version: "v1.0.0" });
    await createTestSubmission(db, tokenId, { benchmark_version: "v1.0.0" });
    await createTestSubmission(db, tokenId, { benchmark_version: "v2.0.0" });

    const response = await SELF.fetch(
      "https://example.com/api/users/testuser/submissions?version=v1.0.0",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      submissions: Array<{ benchmark_version: string }>;
      total: number;
      benchmark_version: string;
    }>();
    expect(body.total).toBe(2);
    expect(body.submissions).toHaveLength(2);
    expect(body.benchmark_version).toBe("v1.0.0");
    for (const sub of body.submissions) {
      expect(sub.benchmark_version).toBe("v1.0.0");
    }
  });
});
