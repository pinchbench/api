import type { Hono } from "hono";
import type { Bindings } from "../types";
import { ensureHttps, hashToken, randomHex } from "../utils/security";

const MAX_REGISTRATIONS_PER_HOUR = 10;
const CLAIM_TTL_HOURS = 24;

const getClientIp = (c: {
  req: { header: (name: string) => string | undefined };
}) =>
  c.req.header("CF-Connecting-IP") ||
  c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
  "unknown";

export const registerRegisterRoutes = (app: Hono<{ Bindings: Bindings }>) => {
  app.post("/api/register", async (c) => {
    if (!ensureHttps(c.req.url) && !c.req.url.includes("localhost")) {
      return c.json(
        {
          status: "error",
          error: "invalid_request",
          message: "HTTPS is required",
        },
        400,
      );
    }

    const contentType = c.req.header("Content-Type");
    if (
      !contentType ||
      !contentType.toLowerCase().includes("application/json")
    ) {
      return c.json(
        {
          status: "error",
          error: "validation_failed",
          details: ["Content-Type must be application/json"],
        },
        422,
      );
    }

    const ip = getClientIp(c);
    const rateRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT COUNT(*) as total FROM token_registration_limits WHERE ip = ? AND created_at >= datetime('now', '-1 hour')",
      )
      .bind(ip)
      .first<{ total: number }>();

    if ((rateRow?.total ?? 0) >= MAX_REGISTRATIONS_PER_HOUR) {
      return c.json(
        {
          status: "error",
          error: "rate_limited",
          message: "Too many registrations from this IP",
        },
        429,
      );
    }

    const token = `pb_live_${randomHex(32)}`;
    const tokenHash = await hashToken(token);
    const claimCode = randomHex(12);
    const claimUrl = `https://pinchbench.com/claim?token=${claimCode}`;

    if (!ensureHttps(claimUrl)) {
      return c.json(
        {
          status: "error",
          error: "server_error",
          message: "Unable to generate claim URL",
        },
        500,
      );
    }

    const tokenId = crypto.randomUUID();

    await c.env.prod_pinchbench
      .prepare(
        `INSERT INTO tokens (
          id,
          token_hash,
          claim_code,
          claim_expires_at,
          created_at
        ) VALUES (
          ?, ?, ?, datetime('now', ?), datetime('now')
        )`,
      )
      .bind(tokenId, tokenHash, claimCode, `+${CLAIM_TTL_HOURS} hours`)
      .run();

    await c.env.prod_pinchbench
      .prepare("INSERT INTO token_registration_limits (ip) VALUES (?)")
      .bind(ip)
      .run();

    return c.json(
      {
        token,
        api_key: token,
        claim_url: claimUrl,
      },
      201,
    );
  });
};
