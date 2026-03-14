import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("POST /api/register", () => {
  it("returns 201 with token, api_key, and claim_url on success", async () => {
    const response = await SELF.fetch("https://example.com/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(201);
    const body = await response.json<{
      token: string;
      api_key: string;
      claim_url: string;
    }>();
    expect(body.token).toMatch(/^pb_live_/);
    expect(body.api_key).toBe(body.token);
    expect(body.claim_url).toContain("pinchbench.com/claim");
  });

  it("returns 422 when Content-Type header is missing", async () => {
    const response = await SELF.fetch("https://example.com/api/register", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(422);
    const body = await response.json<{ status: string; error: string }>();
    expect(body.status).toBe("error");
    expect(body.error).toBe("validation_failed");
  });

  it("returns 422 when Content-Type is text/plain", async () => {
    const response = await SELF.fetch("https://example.com/api/register", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });

    expect(response.status).toBe(422);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const db = env.prod_pinchbench;

    // Insert 10 rate limit rows for the default "unknown" IP
    const stmts = Array.from({ length: 10 }, () =>
      db
        .prepare(
          "INSERT INTO token_registration_limits (ip, created_at) VALUES (?, datetime('now'))",
        )
        .bind("unknown"),
    );
    await db.batch(stmts);

    const response = await SELF.fetch("https://example.com/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(429);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("rate_limited");
  });
});
