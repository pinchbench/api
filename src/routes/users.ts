import type { Hono } from "hono";
import type { Bindings } from "../types";
import {
  resolveBenchmarkVersions,
  appendBenchmarkVersionFilter,
} from "../utils/query";
import { registerRoute } from "../utils/routeRegistry";

registerRoute({
  method: "GET",
  path: "/api/users/:github_username/submissions",
  summary: "Public submissions for a GitHub user",
  description:
    "Returns all submissions from tokens claimed by the given GitHub user. No authentication required — this is a public profile view.",
  tags: ["Users"],
  auth: "none",
  params: [
    { name: "github_username", in: "path", type: "string", required: true, description: "GitHub username (case-insensitive)" },
    { name: "version", in: "query", type: "string", description: "Filter by benchmark version" },
    { name: "sort", in: "query", type: "string", description: "Sort order", default: "score", enum: ["score", "recent", "oldest"] },
    { name: "limit", in: "query", type: "integer", description: "Max results (1-100)", default: 20 },
    { name: "offset", in: "query", type: "integer", description: "Pagination offset", default: 0 },
  ],
  responses: {
    200: { description: "Paginated submissions with summary stats" },
    400: { description: "GitHub username required" },
    404: { description: "User not found" },
  },
  relatedEndpoints: ["/api/submissions", "/api/leaderboard"],
});

export const registerUserRoutes = (app: Hono<{ Bindings: Bindings }>) => {
  /**
   * GET /api/users/:github_username/submissions
   *
   * Returns all submissions from tokens claimed by the given GitHub user.
   * Supports the same query params as /api/submissions.
   * No authentication required — this is a public profile view.
   *
   * Query params:
   *   - version / benchmark_version: filter by benchmark version
   *   - sort: "score" (default), "recent", "oldest"
   *   - limit: max results (default 20, max 100)
   *   - offset: pagination offset
   */
  app.get("/api/users/:github_username/submissions", async (c) => {
    const githubUsername = c.req.param("github_username")?.toLowerCase().trim();

    if (!githubUsername) {
      return c.json(
        {
          status: "error",
          error: "bad_request",
          message: "GitHub username required",
        },
        400,
      );
    }

    // Verify the user exists (has at least one claimed token)
    const userRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT github_username FROM tokens WHERE github_username = ? LIMIT 1",
      )
      .bind(githubUsername)
      .first<{ github_username: string }>();

    if (!userRow) {
      return c.json(
        {
          status: "error",
          error: "not_found",
          message: "User not found",
        },
        404,
      );
    }

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
        s.benchmark_version
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE t.github_username = ?
    `;
    const bindings: (string | number)[] = [githubUsername];

    if (benchmarkVersions.length > 0) {
      query += appendBenchmarkVersionFilter(
        "AND",
        "s.benchmark_version",
        benchmarkVersions,
      );
      bindings.push(...benchmarkVersions);
    }

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

    // Total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE t.github_username = ?
    `;
    const countBindings: (string | number)[] = [githubUsername];

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

    // Summary stats (across all versions, not filtered)
    const statsRow = await c.env.prod_pinchbench
      .prepare(
        `SELECT
           COUNT(*) as total_submissions,
           MAX(s.score_percentage) as best_score_percentage
         FROM submissions s
         JOIN tokens t ON s.token_id = t.id
         WHERE t.github_username = ?`,
      )
      .bind(githubUsername)
      .first<{
        total_submissions: number;
        best_score_percentage: number | null;
      }>();

    return c.json({
      github_username: githubUsername,
      submissions: results.results ?? [],
      total: totalRow?.total ?? 0,
      limit,
      offset,
      has_more: offset + limit < (totalRow?.total ?? 0),
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
      summary: {
        total_submissions: statsRow?.total_submissions ?? 0,
        best_score_percentage: statsRow?.best_score_percentage ?? null,
      },
    });
  });
};
