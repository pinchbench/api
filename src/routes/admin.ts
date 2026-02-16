import { Hono } from "hono";
import type { Bindings, AdminVariables } from "../types";
import { adminAuthMiddleware, getAdminUser } from "../utils/adminAuth";
import { adminHTML } from "../templates/adminHtml";

const admin = new Hono<{ Bindings: Bindings; Variables: AdminVariables }>();

// Apply authentication to all admin routes
admin.use("*", adminAuthMiddleware);

/**
 * Log an admin action for audit purposes
 */
async function logAdminAction(
  db: import("@cloudflare/workers-types").D1Database,
  email: string,
  action: string,
  details: Record<string, unknown>,
) {
  await db
    .prepare(
      `INSERT INTO raw_post_logs (method, path, headers, body, ip, created_at)
       VALUES ('ADMIN', ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      action,
      JSON.stringify({ admin_email: email }),
      JSON.stringify(details),
      "admin",
    )
    .run()
    .catch(() => {}); // Silently ignore logging failures
}

/**
 * GET /admin
 * Serve the admin HTML UI
 */
admin.get("/", (c) => {
  return c.html(adminHTML);
});

/**
 * GET /admin/api/me
 * Get current admin user info
 */
admin.get("/api/me", (c) => {
  const user = getAdminUser(c);
  return c.json({
    email: user?.email ?? "unknown",
    sub: user?.sub ?? "unknown",
  });
});

// ============================================================================
// BENCHMARK VERSIONS API
// ============================================================================

/**
 * GET /admin/api/versions
 * List all benchmark versions including hidden ones
 */
admin.get("/api/versions", async (c) => {
  const versions = await c.env.prod_pinchbench
    .prepare(
      `SELECT 
        id, 
        created_at,
        current,
        hidden
      FROM benchmark_versions
      ORDER BY created_at DESC`,
    )
    .all<{ id: string; created_at: string; current: number; hidden: number }>();

  // Get submission counts for each version
  const versionsWithCounts = await Promise.all(
    (versions.results ?? []).map(async (version) => {
      const countRow = await c.env.prod_pinchbench
        .prepare(
          "SELECT COUNT(*) as count FROM submissions WHERE benchmark_version = ?",
        )
        .bind(version.id)
        .first<{ count: number }>();
      return {
        id: version.id,
        created_at: version.created_at,
        is_current: version.current === 1,
        is_hidden: version.hidden === 1,
        submission_count: countRow?.count ?? 0,
      };
    }),
  );

  return c.json({ versions: versionsWithCounts });
});

/**
 * PUT /admin/api/versions/:id
 * Update version properties (current, hidden)
 */
admin.put("/api/versions/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ current?: boolean; hidden?: boolean }>();
  const user = getAdminUser(c);

  // Verify version exists
  const existing = await c.env.prod_pinchbench
    .prepare("SELECT id FROM benchmark_versions WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Version not found" }, 404);
  }

  // Handle setting current
  if (body.current === true) {
    // Remove current from all other versions
    await c.env.prod_pinchbench
      .prepare("UPDATE benchmark_versions SET current = 0")
      .run();
    // Set this one as current
    await c.env.prod_pinchbench
      .prepare("UPDATE benchmark_versions SET current = 1 WHERE id = ?")
      .bind(id)
      .run();

    await logAdminAction(
      c.env.prod_pinchbench,
      user?.email ?? "unknown",
      "set_current_version",
      { version_id: id },
    );
  }

  // Handle setting hidden
  if (typeof body.hidden === "boolean") {
    await c.env.prod_pinchbench
      .prepare("UPDATE benchmark_versions SET hidden = ? WHERE id = ?")
      .bind(body.hidden ? 1 : 0, id)
      .run();

    await logAdminAction(
      c.env.prod_pinchbench,
      user?.email ?? "unknown",
      "toggle_version_hidden",
      { version_id: id, hidden: body.hidden },
    );
  }

  return c.json({ success: true });
});

// ============================================================================
// SUBMISSIONS API
// ============================================================================

/**
 * GET /admin/api/submissions
 * List submissions with pagination (includes all versions)
 */
admin.get("/api/submissions", async (c) => {
  const limit = Math.min(
    100,
    Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)),
  );
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10));

  const [results, countRow] = await Promise.all([
    c.env.prod_pinchbench
      .prepare(
        `SELECT 
          s.id, s.model, s.provider, s.score_percentage, s.benchmark_version, s.timestamp
        FROM submissions s
        ORDER BY s.timestamp DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(limit, offset)
      .all<{
        id: string;
        model: string;
        provider: string | null;
        score_percentage: number;
        benchmark_version: string | null;
        timestamp: string;
      }>(),
    c.env.prod_pinchbench
      .prepare("SELECT COUNT(*) as count FROM submissions")
      .first<{ count: number }>(),
  ]);

  return c.json({
    submissions: results.results ?? [],
    total: countRow?.count ?? 0,
    limit,
    offset,
  });
});

/**
 * DELETE /admin/api/submissions/:id
 * Delete a submission
 */
admin.delete("/api/submissions/:id", async (c) => {
  const id = c.req.param("id");
  const user = getAdminUser(c);

  // Verify submission exists
  const existing = await c.env.prod_pinchbench
    .prepare("SELECT id, model, provider FROM submissions WHERE id = ?")
    .bind(id)
    .first<{ id: string; model: string; provider: string | null }>();

  if (!existing) {
    return c.json({ error: "Submission not found" }, 404);
  }

  await c.env.prod_pinchbench
    .prepare("DELETE FROM submissions WHERE id = ?")
    .bind(id)
    .run();

  await logAdminAction(
    c.env.prod_pinchbench,
    user?.email ?? "unknown",
    "delete_submission",
    {
      submission_id: id,
      model: existing.model,
      provider: existing.provider,
    },
  );

  return c.json({ success: true });
});

// ============================================================================
// TOKENS API
// ============================================================================

/**
 * GET /admin/api/tokens
 * List tokens with pagination and submission counts
 */
admin.get("/api/tokens", async (c) => {
  const limit = Math.min(
    100,
    Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)),
  );
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10));

  const [results, countRow] = await Promise.all([
    c.env.prod_pinchbench
      .prepare(
        `SELECT 
          t.id,
          t.created_at,
          t.last_used_at,
          t.claim_code,
          t.claimed_at,
          (SELECT COUNT(*) FROM submissions s WHERE s.token_id = t.id) as submission_count
        FROM tokens t
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(limit, offset)
      .all<{
        id: string;
        created_at: string;
        last_used_at: string | null;
        claim_code: string | null;
        claimed_at: string | null;
        submission_count: number;
      }>(),
    c.env.prod_pinchbench
      .prepare("SELECT COUNT(*) as count FROM tokens")
      .first<{ count: number }>(),
  ]);

  return c.json({
    tokens: results.results ?? [],
    total: countRow?.count ?? 0,
    limit,
    offset,
  });
});

/**
 * POST /admin/api/tokens/:id/confirm
 * Manually confirm/claim a token
 */
admin.post("/api/tokens/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const user = getAdminUser(c);

  // Verify token exists
  const existing = await c.env.prod_pinchbench
    .prepare("SELECT id, claimed_at FROM tokens WHERE id = ?")
    .bind(id)
    .first<{ id: string; claimed_at: string | null }>();

  if (!existing) {
    return c.json({ error: "Token not found" }, 404);
  }

  if (existing.claimed_at) {
    return c.json({ error: "Token already claimed" }, 400);
  }

  // Set claimed_at to now and clear claim_code/claim_expires_at
  await c.env.prod_pinchbench
    .prepare(
      `UPDATE tokens 
       SET claimed_at = datetime('now'), 
           claim_code = NULL, 
           claim_expires_at = NULL 
       WHERE id = ?`,
    )
    .bind(id)
    .run();

  await logAdminAction(
    c.env.prod_pinchbench,
    user?.email ?? "unknown",
    "confirm_token",
    { token_id: id },
  );

  return c.json({ success: true });
});

/**
 * POST /admin/api/tokens/:id/unconfirm
 * Remove claimed status from a token
 */
admin.post("/api/tokens/:id/unconfirm", async (c) => {
  const id = c.req.param("id");
  const user = getAdminUser(c);

  // Verify token exists
  const existing = await c.env.prod_pinchbench
    .prepare("SELECT id, claimed_at FROM tokens WHERE id = ?")
    .bind(id)
    .first<{ id: string; claimed_at: string | null }>();

  if (!existing) {
    return c.json({ error: "Token not found" }, 404);
  }

  if (!existing.claimed_at) {
    return c.json({ error: "Token is not claimed" }, 400);
  }

  // Clear claimed_at
  await c.env.prod_pinchbench
    .prepare("UPDATE tokens SET claimed_at = NULL WHERE id = ?")
    .bind(id)
    .run();

  await logAdminAction(
    c.env.prod_pinchbench,
    user?.email ?? "unknown",
    "unconfirm_token",
    { token_id: id },
  );

  return c.json({ success: true });
});

export { admin };
