import type { Hono } from "hono";
import type { Bindings } from "../types";
import { hashToken } from "../utils/security";

type LeaderboardEntry = {
  model: string;
  provider: string | null;
  best_score_percentage: number;
  submission_count: number;
  latest_submission: string;
  best_submission_id: string;
};

type SubmissionRow = {
  id: string;
  model: string;
  provider: string | null;
  score_percentage: number;
  total_score: number;
  max_score: number;
  timestamp: string;
  created_at: string;
  client_version: string | null;
  openclaw_version: string | null;
  run_id: string | null;
  tasks: string;
  usage_summary: string | null;
  metadata: string | null;
  claimed: number;
};

const getAuthToken = (c: {
  req: { header: (name: string) => string | undefined };
}) => c.req.header("X-PinchBench-Token")?.trim();

export const registerLeaderboardRoutes = (app: Hono<{ Bindings: Bindings }>) => {
  /**
   * GET /api/leaderboard
   * 
   * Returns aggregated best scores grouped by model.
   * Query params:
   *   - verified: "true" to only include submissions from claimed tokens
   *   - provider: filter by provider name
   *   - limit: max results (default 50, max 200)
   */
  app.get("/api/leaderboard", async (c) => {
    const verified = c.req.query("verified") === "true";
    const providerFilter = c.req.query("provider")?.trim();
    const limitParam = parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Math.min(Math.max(1, limitParam), 200);

    let query = `
      SELECT 
        s.model,
        s.provider,
        MAX(s.score_percentage) as best_score_percentage,
        COUNT(*) as submission_count,
        MAX(s.timestamp) as latest_submission,
        (
          SELECT s2.id 
          FROM submissions s2 
          JOIN tokens t2 ON s2.token_id = t2.id
          WHERE s2.model = s.model 
            AND s2.score_percentage = MAX(s.score_percentage)
            ${verified ? "AND t2.claimed_at IS NOT NULL" : ""}
          LIMIT 1
        ) as best_submission_id
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE 1=1
    `;

    const bindings: (string | number)[] = [];

    if (verified) {
      query += " AND t.claimed_at IS NOT NULL";
    }

    if (providerFilter) {
      query += " AND s.provider = ?";
      bindings.push(providerFilter);
    }

    query += `
      GROUP BY s.model
      ORDER BY best_score_percentage DESC, submission_count DESC
      LIMIT ?
    `;
    bindings.push(limit);

    const results = await c.env.prod_pinchbench
      .prepare(query)
      .bind(...bindings)
      .all<LeaderboardEntry>();

    const totalModels = await c.env.prod_pinchbench
      .prepare(
        verified
          ? "SELECT COUNT(DISTINCT s.model) as count FROM submissions s JOIN tokens t ON s.token_id = t.id WHERE t.claimed_at IS NOT NULL"
          : "SELECT COUNT(DISTINCT model) as count FROM submissions"
      )
      .first<{ count: number }>();

    return c.json({
      leaderboard: results.results ?? [],
      total_models: totalModels?.count ?? 0,
      verified_only: verified,
      generated_at: new Date().toISOString(),
    });
  });

  /**
   * GET /api/submissions
   * 
   * Returns a paginated list of submissions.
   * Query params:
   *   - model: filter by model name
   *   - provider: filter by provider
   *   - verified: "true" for claimed tokens only
   *   - limit: max results (default 20, max 100)
   *   - offset: pagination offset
   *   - sort: "score" (default), "recent", "oldest"
   */
  app.get("/api/submissions", async (c) => {
    const model = c.req.query("model")?.trim();
    const provider = c.req.query("provider")?.trim();
    const verified = c.req.query("verified") === "true";
    const limitParam = parseInt(c.req.query("limit") ?? "20", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10));
    const sort = c.req.query("sort") ?? "score";

    let query = `
      SELECT 
        s.id,
        s.model,
        s.provider,
        s.score_percentage,
        s.total_score,
        s.max_score,
        s.timestamp,
        s.created_at,
        s.client_version,
        s.openclaw_version,
        CASE WHEN t.claimed_at IS NOT NULL THEN 1 ELSE 0 END as claimed
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE 1=1
    `;

    const bindings: (string | number)[] = [];

    if (model) {
      query += " AND s.model = ?";
      bindings.push(model);
    }

    if (provider) {
      query += " AND s.provider = ?";
      bindings.push(provider);
    }

    if (verified) {
      query += " AND t.claimed_at IS NOT NULL";
    }

    // Sorting
    switch (sort) {
      case "recent":
        query += " ORDER BY s.timestamp DESC";
        break;
      case "oldest":
        query += " ORDER BY s.timestamp ASC";
        break;
      case "score":
      default:
        query += " ORDER BY s.score_percentage DESC, s.timestamp DESC";
    }

    query += " LIMIT ? OFFSET ?";
    bindings.push(limit, offset);

    const results = await c.env.prod_pinchbench
      .prepare(query)
      .bind(...bindings)
      .all();

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE 1=1
    `;
    const countBindings: string[] = [];

    if (model) {
      countQuery += " AND s.model = ?";
      countBindings.push(model);
    }
    if (provider) {
      countQuery += " AND s.provider = ?";
      countBindings.push(provider);
    }
    if (verified) {
      countQuery += " AND t.claimed_at IS NOT NULL";
    }

    const totalRow = await c.env.prod_pinchbench
      .prepare(countQuery)
      .bind(...countBindings)
      .first<{ total: number }>();

    return c.json({
      submissions: results.results ?? [],
      total: totalRow?.total ?? 0,
      limit,
      offset,
      has_more: offset + limit < (totalRow?.total ?? 0),
    });
  });

  /**
   * GET /api/submissions/:id
   * 
   * Returns full details for a single submission including task breakdown.
   */
  app.get("/api/submissions/:id", async (c) => {
    const submissionId = c.req.param("id");

    if (!submissionId) {
      return c.json(
        { status: "error", error: "bad_request", message: "Submission ID required" },
        400
      );
    }

    const row = await c.env.prod_pinchbench
      .prepare(
        `SELECT 
          s.id,
          s.model,
          s.provider,
          s.score_percentage,
          s.total_score,
          s.max_score,
          s.timestamp,
          s.created_at,
          s.client_version,
          s.openclaw_version,
          s.run_id,
          s.tasks,
          s.usage_summary,
          s.metadata,
          CASE WHEN t.claimed_at IS NOT NULL THEN 1 ELSE 0 END as claimed
        FROM submissions s
        JOIN tokens t ON s.token_id = t.id
        WHERE s.id = ?
        LIMIT 1`
      )
      .bind(submissionId)
      .first<SubmissionRow>();

    if (!row) {
      return c.json(
        { status: "error", error: "not_found", message: "Submission not found" },
        404
      );
    }

    // Calculate rank
    const rankRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT COUNT(*) + 1 as rank FROM submissions WHERE score_percentage > ?"
      )
      .bind(row.score_percentage)
      .first<{ rank: number }>();

    const totalRow = await c.env.prod_pinchbench
      .prepare("SELECT COUNT(*) as total FROM submissions")
      .first<{ total: number }>();

    return c.json({
      submission: {
        id: row.id,
        model: row.model,
        provider: row.provider,
        score_percentage: row.score_percentage,
        total_score: row.total_score,
        max_score: row.max_score,
        timestamp: row.timestamp,
        created_at: row.created_at,
        client_version: row.client_version,
        openclaw_version: row.openclaw_version,
        run_id: row.run_id,
        tasks: JSON.parse(row.tasks || "[]"),
        usage_summary: row.usage_summary ? JSON.parse(row.usage_summary) : null,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        verified: row.claimed === 1,
      },
      rank: rankRow?.rank ?? 0,
      total_submissions: totalRow?.total ?? 0,
      percentile:
        totalRow?.total && totalRow.total > 0
          ? Number(
              (((totalRow.total - (rankRow?.rank ?? 0)) / totalRow.total) * 100).toFixed(
                2
              )
            )
          : 0,
    });
  });

  /**
   * GET /api/models
   * 
   * Returns list of all models with submission counts.
   * Useful for filter dropdowns in the frontend.
   */
  app.get("/api/models", async (c) => {
    const verified = c.req.query("verified") === "true";

    let query = `
      SELECT 
        s.model,
        s.provider,
        COUNT(*) as submission_count,
        MAX(s.score_percentage) as best_score,
        MAX(s.timestamp) as latest_submission
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
    `;

    if (verified) {
      query += " WHERE t.claimed_at IS NOT NULL";
    }

    query += `
      GROUP BY s.model, s.provider
      ORDER BY submission_count DESC
    `;

    const results = await c.env.prod_pinchbench.prepare(query).all();

    return c.json({
      models: results.results ?? [],
    });
  });

  /**
   * GET /api/me/submissions
   * 
   * Returns submissions for the authenticated user's token.
   * Requires X-PinchBench-Token header.
   */
  app.get("/api/me/submissions", async (c) => {
    const token = getAuthToken(c);
    if (!token) {
      return c.json(
        {
          status: "error",
          error: "unauthorized",
          message: "Authentication token required",
        },
        401
      );
    }

    const tokenHash = await hashToken(token);
    const tokenRow = await c.env.prod_pinchbench
      .prepare("SELECT id, claimed_at, user_id FROM tokens WHERE token_hash = ? LIMIT 1")
      .bind(tokenHash)
      .first<{ id: string; claimed_at: string | null; user_id: string | null }>();

    if (!tokenRow?.id) {
      return c.json(
        {
          status: "error",
          error: "unauthorized",
          message: "Invalid authentication token",
        },
        401
      );
    }

    const limitParam = parseInt(c.req.query("limit") ?? "20", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10));

    const results = await c.env.prod_pinchbench
      .prepare(
        `SELECT 
          id,
          model,
          provider,
          score_percentage,
          total_score,
          max_score,
          timestamp,
          created_at,
          client_version,
          openclaw_version
        FROM submissions
        WHERE token_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?`
      )
      .bind(tokenRow.id, limit, offset)
      .all();

    const totalRow = await c.env.prod_pinchbench
      .prepare("SELECT COUNT(*) as total FROM submissions WHERE token_id = ?")
      .bind(tokenRow.id)
      .first<{ total: number }>();

    return c.json({
      submissions: results.results ?? [],
      total: totalRow?.total ?? 0,
      limit,
      offset,
      has_more: offset + limit < (totalRow?.total ?? 0),
      token_claimed: tokenRow.claimed_at !== null,
    });
  });

  /**
   * GET /api/stats
   * 
   * Returns aggregate statistics about the benchmark.
   */
  app.get("/api/stats", async (c) => {
    const [totalSubmissions, totalModels, verifiedSubmissions, recentActivity] =
      await Promise.all([
        c.env.prod_pinchbench
          .prepare("SELECT COUNT(*) as count FROM submissions")
          .first<{ count: number }>(),
        c.env.prod_pinchbench
          .prepare("SELECT COUNT(DISTINCT model) as count FROM submissions")
          .first<{ count: number }>(),
        c.env.prod_pinchbench
          .prepare(
            "SELECT COUNT(*) as count FROM submissions s JOIN tokens t ON s.token_id = t.id WHERE t.claimed_at IS NOT NULL"
          )
          .first<{ count: number }>(),
        c.env.prod_pinchbench
          .prepare(
            "SELECT COUNT(*) as count FROM submissions WHERE created_at >= datetime('now', '-24 hours')"
          )
          .first<{ count: number }>(),
      ]);

    // Top model
    const topModel = await c.env.prod_pinchbench
      .prepare(
        `SELECT model, MAX(score_percentage) as best_score
         FROM submissions
         GROUP BY model
         ORDER BY best_score DESC
         LIMIT 1`
      )
      .first<{ model: string; best_score: number }>();

    return c.json({
      total_submissions: totalSubmissions?.count ?? 0,
      total_models: totalModels?.count ?? 0,
      verified_submissions: verifiedSubmissions?.count ?? 0,
      submissions_last_24h: recentActivity?.count ?? 0,
      top_model: topModel ?? null,
      generated_at: new Date().toISOString(),
    });
  });
};
