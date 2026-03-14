import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createTestToken } from "../helpers";

describe("POST /api/claim/refresh", () => {
  it("returns 401 when no token is provided", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/claim/refresh",
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 for an invalid token", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/claim/refresh",
      {
        method: "POST",
        headers: {
          "X-PinchBench-Token": "pb_live_invalidtoken1234567890ab",
        },
      },
    );

    expect(response.status).toBe(401);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 when token is already claimed", async () => {
    const db = env.prod_pinchbench;
    const { rawToken } = await createTestToken(db, {
      claimed_at: new Date().toISOString(),
      github_username: "testuser",
      github_id: 12345,
    });

    const response = await SELF.fetch(
      "https://example.com/api/claim/refresh",
      {
        method: "POST",
        headers: {
          "X-PinchBench-Token": rawToken,
        },
      },
    );

    expect(response.status).toBe(400);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("already_claimed");
  });

  it("returns 200 with claim_url for unclaimed token", async () => {
    const db = env.prod_pinchbench;
    const { rawToken } = await createTestToken(db);

    const response = await SELF.fetch(
      "https://example.com/api/claim/refresh",
      {
        method: "POST",
        headers: {
          "X-PinchBench-Token": rawToken,
        },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ claim_url: string }>();
    expect(body.claim_url).toContain("pinchbench.com/claim");
  });

  it("updates claim_code in the database after refresh", async () => {
    const db = env.prod_pinchbench;
    const originalClaimCode = "original_code_123";
    const { id, rawToken } = await createTestToken(db, {
      claim_code: originalClaimCode,
    });

    await SELF.fetch("https://example.com/api/claim/refresh", {
      method: "POST",
      headers: {
        "X-PinchBench-Token": rawToken,
      },
    });

    const row = await db
      .prepare("SELECT claim_code FROM tokens WHERE id = ?")
      .bind(id)
      .first<{ claim_code: string }>();

    expect(row).toBeDefined();
    expect(row!.claim_code).not.toBe(originalClaimCode);
    expect(row!.claim_code).toBeTruthy();
  });
});
