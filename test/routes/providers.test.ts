import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  createTestToken,
  createTestSubmission,
  createTestBenchmarkVersion,
} from "../helpers";

describe("GET /api/providers", () => {
  it("returns empty list when no submissions exist", async () => {
    const response = await SELF.fetch("https://example.com/api/providers");

    expect(response.status).toBe(200);
    const body = await response.json<{ providers: string[]; count: number }>();
    expect(body.providers).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("returns providers from submissions", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db);
    await createTestSubmission(db, tokenId, { provider: "anthropic" });
    await createTestSubmission(db, tokenId, { provider: "openai" });

    const response = await SELF.fetch("https://example.com/api/providers");

    expect(response.status).toBe(200);
    const body = await response.json<{ providers: string[]; count: number }>();
    expect(body.providers).toContain("anthropic");
    expect(body.providers).toContain("openai");
    expect(body.count).toBe(2);
  });

  it("excludes null providers", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db);
    // Insert submissions: one with provider, one with NULL provider
    await db.batch([
      db
        .prepare(
          `INSERT INTO submissions (id, token_id, model, provider, total_score, max_score, score_percentage, timestamp, tasks, official)
           VALUES (?, ?, ?, ?, 42, 50, 0.84, datetime('now'), '[]', 0)`,
        )
        .bind(crypto.randomUUID(), tokenId, "claude-sonnet", "anthropic"),
      db
        .prepare(
          `INSERT INTO submissions (id, token_id, model, provider, total_score, max_score, score_percentage, timestamp, tasks, official)
           VALUES (?, ?, ?, NULL, 10, 20, 0.5, datetime('now'), '[]', 0)`,
        )
        .bind(crypto.randomUUID(), tokenId, "some-model"),
    ]);

    const response = await SELF.fetch("https://example.com/api/providers");

    expect(response.status).toBe(200);
    const body = await response.json<{ providers: string[]; count: number }>();
    expect(body.providers).toEqual(["anthropic"]);
    expect(body.count).toBe(1);
  });

  it("returns providers sorted alphabetically", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db);
    await createTestSubmission(db, tokenId, { provider: "openai" });
    await createTestSubmission(db, tokenId, { provider: "anthropic" });
    await createTestSubmission(db, tokenId, { provider: "google" });

    const response = await SELF.fetch("https://example.com/api/providers");

    expect(response.status).toBe(200);
    const body = await response.json<{ providers: string[]; count: number }>();
    expect(body.providers).toEqual(["anthropic", "google", "openai"]);
  });
});

describe("GET /api/providers/:provider/models", () => {
  it("returns models for a provider", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db);
    await createTestSubmission(db, tokenId, {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      score_percentage: 0.9,
    });
    await createTestSubmission(db, tokenId, {
      provider: "anthropic",
      model: "claude-haiku-3",
      score_percentage: 0.7,
    });

    const response = await SELF.fetch(
      "https://example.com/api/providers/anthropic/models",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      provider: string;
      models: Array<{
        model: string;
        submission_count: number;
        best_score: number;
        average_score: number;
      }>;
    }>();
    expect(body.provider).toBe("anthropic");
    expect(body.models).toHaveLength(2);

    const modelNames = body.models.map((m) => m.model);
    expect(modelNames).toContain("claude-sonnet-4-20250514");
    expect(modelNames).toContain("claude-haiku-3");

    for (const model of body.models) {
      expect(model.submission_count).toBeGreaterThanOrEqual(1);
      expect(model.best_score).toBeGreaterThan(0);
      expect(model.average_score).toBeGreaterThan(0);
    }
  });

  it("returns empty models array for unknown provider", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/providers/nonexistent/models",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      provider: string;
      models: unknown[];
    }>();
    expect(body.provider).toBe("nonexistent");
    expect(body.models).toEqual([]);
  });

  it("includes weights and hf_link metadata in response", async () => {
    const db = env.prod_pinchbench;
    const { id: tokenId } = await createTestToken(db);
    await createTestSubmission(db, tokenId, {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });

    const response = await SELF.fetch(
      "https://example.com/api/providers/anthropic/models",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      models: Array<{
        weights: string;
        hf_link: string | null;
      }>;
    }>();
    expect(body.models.length).toBeGreaterThanOrEqual(1);
    for (const model of body.models) {
      expect(model).toHaveProperty("weights");
      expect(model).toHaveProperty("hf_link");
    }
  });
});
