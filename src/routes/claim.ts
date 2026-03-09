import type { Hono } from "hono";
import type { Bindings } from "../types";
import { getAuthToken, hashToken, randomHex } from "../utils/security";

const CLAIM_TTL_HOURS = 24;

const FRONTEND_BASE = "https://pinchbench.com";

/**
 * GET /api/claim/github?claim_code=XXX
 *
 * Validates the claim code and redirects the user to GitHub OAuth.
 * The claim code doubles as the OAuth `state` parameter for CSRF protection.
 */
async function handleGithubOAuthStart(
  c: Parameters<Parameters<Hono<{ Bindings: Bindings }>["get"]>[1]>[0],
) {
  const claimCode = c.req.query("claim_code")?.trim();

  if (!claimCode) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=invalid`);
  }

  if (!c.env.GITHUB_CLIENT_ID) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
  }

  const tokenRow = await c.env.prod_pinchbench
    .prepare(
      `SELECT id, claimed_at, claim_expires_at
       FROM tokens
       WHERE claim_code = ?
       LIMIT 1`,
    )
    .bind(claimCode)
    .first<{
      id: string;
      claimed_at: string | null;
      claim_expires_at: string | null;
    }>();

  if (!tokenRow) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=invalid`);
  }

  if (tokenRow.claimed_at) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=already_claimed`);
  }

  // Check expiry — claim_expires_at is stored as a SQLite datetime string
  if (
    !tokenRow.claim_expires_at ||
    new Date(tokenRow.claim_expires_at + "Z") < new Date()
  ) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=expired`);
  }

  const callbackUrl = new URL(c.req.url);
  callbackUrl.pathname = "/api/claim/github/callback";
  callbackUrl.search = "";

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: callbackUrl.toString(),
    state: claimCode,
    scope: "read:user",
  });

  return c.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );
}

/**
 * GET /api/claim/github/callback?code=XXX&state=CLAIM_CODE
 *
 * GitHub redirects here after the user authorizes the OAuth app.
 * Exchanges the code for a token, fetches the GitHub user, and marks the
 * token as claimed.
 */
async function handleGithubOAuthCallback(
  c: Parameters<Parameters<Hono<{ Bindings: Bindings }>["get"]>[1]>[0],
) {
  const code = c.req.query("code")?.trim();
  const claimCode = c.req.query("state")?.trim();

  if (!code || !claimCode) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=invalid`);
  }

  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
  }

  // Re-validate the claim code (state) — must still be valid
  const tokenRow = await c.env.prod_pinchbench
    .prepare(
      `SELECT id, claimed_at, claim_expires_at
       FROM tokens
       WHERE claim_code = ?
       LIMIT 1`,
    )
    .bind(claimCode)
    .first<{
      id: string;
      claimed_at: string | null;
      claim_expires_at: string | null;
    }>();

  if (!tokenRow) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=invalid`);
  }

  if (tokenRow.claimed_at) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=already_claimed`);
  }

  if (
    !tokenRow.claim_expires_at ||
    new Date(tokenRow.claim_expires_at + "Z") < new Date()
  ) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=expired`);
  }

  // Exchange code for GitHub access token
  let githubAccessToken: string;
  try {
    const callbackUrl = new URL(c.req.url);
    callbackUrl.pathname = "/api/claim/github/callback";
    callbackUrl.search = "";

    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "pinchbench",
        },
        body: JSON.stringify({
          client_id: c.env.GITHUB_CLIENT_ID,
          client_secret: c.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: callbackUrl.toString(),
        }),
      },
    );

    if (!tokenRes.ok) {
      return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
    }

    const tokenData = await tokenRes.json<{
      access_token?: string;
      error?: string;
    }>();

    if (!tokenData.access_token) {
      console.error("GitHub OAuth error:", tokenData.error);
      return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
    }

    githubAccessToken = tokenData.access_token;
  } catch {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
  }

  // Fetch GitHub user info (access token used transiently, not stored)
  let githubId: number;
  let githubUsername: string;
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/json",
        "User-Agent": "pinchbench",
      },
    });

    if (!userRes.ok) {
      return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
    }

    const userData = await userRes.json<{ id?: number; login?: string }>();

    if (!userData.id || !userData.login) {
      return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
    }

    githubId = userData.id;
    githubUsername = userData.login.toLowerCase();
  } catch {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=github_error`);
  }

  // Mark the token as claimed with GitHub identity.
  // AND claimed_at IS NULL ensures only the first concurrent request wins (prevents double-claim).
  const claimResult = await c.env.prod_pinchbench
    .prepare(
      `UPDATE tokens
       SET claimed_at = datetime('now'),
           github_id = ?,
           github_username = ?,
           claim_code = NULL,
           claim_expires_at = NULL
       WHERE id = ? AND claimed_at IS NULL`,
    )
    .bind(githubId, githubUsername, tokenRow.id)
    .run();

  if (claimResult.changes === 0) {
    return c.redirect(`${FRONTEND_BASE}/claim/error?reason=already_claimed`);
  }

  return c.redirect(`${FRONTEND_BASE}/claim/success?username=${encodeURIComponent(githubUsername)}`);
}

export const registerClaimRoutes = (app: Hono<{ Bindings: Bindings }>) => {
  /**
   * GET /api/claim/github
   * Initiates GitHub OAuth for a given claim_code.
   */
  app.get("/api/claim/github", (c) => handleGithubOAuthStart(c));

  /**
   * GET /api/claim/github/callback
   * GitHub OAuth callback — exchanges code for token, claims the token.
   */
  app.get("/api/claim/github/callback", (c) => handleGithubOAuthCallback(c));

  /**
   * POST /api/claim/refresh
   *
   * Refreshes an expired or pending claim code for an existing token.
   * Requires X-PinchBench-Token authentication.
   * Returns a new claim_url.
   */
  app.post("/api/claim/refresh", async (c) => {
    const rawToken = getAuthToken(c);
    if (!rawToken) {
      return c.json(
        {
          status: "error",
          error: "unauthorized",
          message: "Authentication token required",
        },
        401,
      );
    }

    const tokenHash = await hashToken(rawToken);
    const tokenRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT id, claimed_at FROM tokens WHERE token_hash = ? LIMIT 1",
      )
      .bind(tokenHash)
      .first<{ id: string; claimed_at: string | null }>();

    if (!tokenRow) {
      return c.json(
        {
          status: "error",
          error: "unauthorized",
          message: "Invalid authentication token",
        },
        401,
      );
    }

    if (tokenRow.claimed_at) {
      return c.json(
        {
          status: "error",
          error: "already_claimed",
          message: "This token has already been claimed",
        },
        400,
      );
    }

    const newClaimCode = randomHex(12);
    const claimUrl = `${FRONTEND_BASE}/claim?token=${newClaimCode}`;

    await c.env.prod_pinchbench
      .prepare(
        `UPDATE tokens
         SET claim_code = ?,
             claim_expires_at = datetime('now', ?)
         WHERE id = ?`,
      )
      .bind(newClaimCode, `+${CLAIM_TTL_HOURS} hours`, tokenRow.id)
      .run();

    return c.json({ claim_url: claimUrl });
  });
};
