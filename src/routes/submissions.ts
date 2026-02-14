import type { Hono } from "hono";
import type { Bindings, SubmissionRow } from "../types";
import { hashToken } from "../utils/security";

const getAuthToken = (c: {
  req: { header: (name: string) => string | undefined };
}) => c.req.header("X-PinchBench-Token")?.trim();

const resolveBenchmarkVersions = async (c: {
  env: Bindings;
  req: { query: (name: string) => string | undefined };
}) => {
  // Support both "version" and "benchmark_version" query params
  const requested =
    c.req.query("version")?.trim() || c.req.query("benchmark_version")?.trim();
  if (requested) return [requested];
  const currentRows = await c.env.prod_pinchbench
    .prepare("SELECT id FROM benchmark_versions WHERE current = 1")
    .all<{ id: string }>();
  return currentRows.results?.map((row) => row.id) ?? [];
};

const appendBenchmarkVersionFilter = (
  clausePrefix: string,
  field: string,
  versions: string[],
) => {
  if (versions.length === 0) return "";
  const placeholders = versions.map(() => "?").join(", ");
  return ` ${clausePrefix} ${field} IN (${placeholders})`;
};

export const registerSubmissionRoutes = (
  app: Hono<{ Bindings: Bindings }>,
) => {
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
    const benchmarkVersions = await resolveBenchmarkVersions(c);
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
        s.total_execution_time_seconds,
        s.total_cost_usd,
        s.timestamp,
        s.created_at,
        s.client_version,
        s.openclaw_version,
        s.benchmark_version,
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

    if (benchmarkVersions.length > 0) {
      query += appendBenchmarkVersionFilter(
        "AND",
        "s.benchmark_version",
        benchmarkVersions,
      );
      bindings.push(...benchmarkVersions);
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
    const countBindings: (string | number)[] = [];

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

    if (benchmarkVersions.length > 0) {
      countQuery += appendBenchmarkVersionFilter(
        "AND",
        "s.benchmark_version",
        benchmarkVersions,
      );
      countBindings.push(...benchmarkVersions);
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
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
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
        {
          status: "error",
          error: "bad_request",
          message: "Submission ID required",
        },
        400,
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
        s.total_execution_time_seconds,
        s.total_cost_usd,
        s.timestamp,
        s.created_at,
        s.client_version,
        s.openclaw_version,
        s.run_id,
          s.benchmark_version,
          s.tasks,
          s.usage_summary,
          s.metadata,
          CASE WHEN t.claimed_at IS NOT NULL THEN 1 ELSE 0 END as claimed
        FROM submissions s
        JOIN tokens t ON s.token_id = t.id
        WHERE s.id = ?
        LIMIT 1`,
      )
      .bind(submissionId)
      .first<SubmissionRow>();

    if (!row) {
      return c.json(
        {
          status: "error",
          error: "not_found",
          message: "Submission not found",
        },
        404,
      );
    }

    // Calculate rank
    const rankRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT COUNT(DISTINCT score_percentage) + 1 as rank FROM submissions WHERE score_percentage > ?",
      )
      .bind(row.score_percentage)
      .first<{ rank: number }>();

    const totalRow = await c.env.prod_pinchbench
      .prepare("SELECT COUNT(*) as total FROM submissions")
      .first<{ total: number }>();

    let tasks: SubmissionRow["tasks"] | unknown[] = [];
    let usageSummary: SubmissionRow["usage_summary"] | null = null;
    let metadata: SubmissionRow["metadata"] | null = null;

    try {
      tasks = JSON.parse(row.tasks || "[]");
    } catch (error) {
      console.error(`Failed to parse tasks for submission ${row.id}:`, error);
    }

    try {
      usageSummary = row.usage_summary ? JSON.parse(row.usage_summary) : null;
    } catch (error) {
      console.error(
        `Failed to parse usage_summary for submission ${row.id}:`,
        error,
      );
    }

    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : null;
    } catch (error) {
      console.error(
        `Failed to parse metadata for submission ${row.id}:`,
        error,
      );
    }

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
        benchmark_version: row.benchmark_version,
        tasks,
        usage_summary: usageSummary,
        metadata,
        verified: row.claimed === 1,
      },
      rank: rankRow?.rank ?? 0,
      total_submissions: totalRow?.total ?? 0,
      percentile:
        totalRow?.total && totalRow.total > 0
          ? Number(
              (
                ((totalRow.total - (rankRow?.rank ?? 0)) / totalRow.total) *
                100
              ).toFixed(2),
            )
          : 0,
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
        401,
      );
    }

    const tokenHash = await hashToken(token);
    const tokenRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT id, claimed_at, user_id FROM tokens WHERE token_hash = ? LIMIT 1",
      )
      .bind(tokenHash)
      .first<{
        id: string;
        claimed_at: string | null;
        user_id: string | null;
      }>();

    if (!tokenRow?.id) {
      return c.json(
        {
          status: "error",
          error: "unauthorized",
          message: "Invalid authentication token",
        },
        401,
      );
    }

    const limitParam = parseInt(c.req.query("limit") ?? "20", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10));
    const benchmarkVersions = await resolveBenchmarkVersions(c);

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
          openclaw_version,
          benchmark_version
        FROM submissions
        WHERE token_id = ?
          ${
            benchmarkVersions.length > 0
              ? appendBenchmarkVersionFilter(
                  "AND",
                  "benchmark_version",
                  benchmarkVersions,
                )
              : ""
          }
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?`,
      )
      .bind(tokenRow.id, ...benchmarkVersions, limit, offset)
      .all();

    const totalRow = await c.env.prod_pinchbench
      .prepare(
        `SELECT COUNT(*) as total FROM submissions WHERE token_id = ?
        ${
          benchmarkVersions.length > 0
            ? appendBenchmarkVersionFilter(
                "AND",
                "benchmark_version",
                benchmarkVersions,
              )
            : ""
        }`,
      )
      .bind(tokenRow.id, ...benchmarkVersions)
      .first<{ total: number }>();

    return c.json({
      submissions: results.results ?? [],
      total: totalRow?.total ?? 0,
      limit,
      offset,
      has_more: offset + limit < (totalRow?.total ?? 0),
      token_claimed: tokenRow.claimed_at !== null,
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
    });
  });
};
