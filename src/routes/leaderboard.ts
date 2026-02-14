import type { Hono } from "hono";
import type { Bindings, LeaderboardEntry } from "../types";

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

export const registerLeaderboardRoutes = (
  app: Hono<{ Bindings: Bindings }>,
) => {
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
    const verifiedFlag = verified ? 1 : 0;
    const providerFilter = c.req.query("provider")?.trim();
    const benchmarkVersions = await resolveBenchmarkVersions(c);
    const limitParam = parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Math.min(Math.max(1, limitParam), 200);

    let query = `
      SELECT 
        s.model,
        s.provider,
        MAX(s.score_percentage) as best_score_percentage,
        AVG(s.score_percentage) as average_score_percentage,
        AVG(s.total_execution_time_seconds) as average_execution_time_seconds,
        MIN(s.total_execution_time_seconds) as best_execution_time_seconds,
        AVG(s.total_cost_usd) as average_cost_usd,
        MIN(s.total_cost_usd) as best_cost_usd,
        COUNT(*) as submission_count,
        MAX(s.timestamp) as latest_submission,
        (
          SELECT s2.id 
          FROM submissions s2 
          JOIN tokens t2 ON s2.token_id = t2.id
          WHERE s2.model = s.model 
            AND (? = 0 OR t2.claimed_at IS NOT NULL)
          ORDER BY s2.score_percentage DESC, s2.timestamp DESC, s2.id ASC
          LIMIT 1
        ) as best_submission_id
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE (? = 0 OR t.claimed_at IS NOT NULL)
    `;

    const bindings: (string | number)[] = [verifiedFlag];

    if (benchmarkVersions.length > 0) {
      query = query.replace(
        "ORDER BY s2.score_percentage DESC",
        `AND s2.benchmark_version IN (${benchmarkVersions
          .map(() => "?")
          .join(", ")}) ORDER BY s2.score_percentage DESC`,
      );
      query += appendBenchmarkVersionFilter(
        "AND",
        "s.benchmark_version",
        benchmarkVersions,
      );
      bindings.push(...benchmarkVersions);
    }

    if (providerFilter) {
      query += " AND s.provider = ?";
    }

    query += `
      GROUP BY s.model
      ORDER BY best_score_percentage DESC, submission_count DESC
      LIMIT ?
    `;
    bindings.push(
      verifiedFlag,
      ...benchmarkVersions,
      ...(providerFilter ? [providerFilter] : []),
      limit,
    );

    const results = await c.env.prod_pinchbench
      .prepare(query)
      .bind(...bindings)
      .all<LeaderboardEntry>();

    let totalModelsQuery = verified
      ? "SELECT COUNT(DISTINCT s.model) as count FROM submissions s JOIN tokens t ON s.token_id = t.id WHERE t.claimed_at IS NOT NULL"
      : "SELECT COUNT(DISTINCT model) as count FROM submissions";
    const totalModelsBindings: (string | number)[] = [];
    if (benchmarkVersions.length > 0) {
      totalModelsQuery += verified
        ? appendBenchmarkVersionFilter(
            "AND",
            "s.benchmark_version",
            benchmarkVersions,
          )
        : appendBenchmarkVersionFilter(
            "WHERE",
            "benchmark_version",
            benchmarkVersions,
          );
      totalModelsBindings.push(...benchmarkVersions);
    }
    const totalModels = await c.env.prod_pinchbench
      .prepare(totalModelsQuery)
      .bind(...totalModelsBindings)
      .first<{ count: number }>();

    return c.json({
      leaderboard: results.results ?? [],
      total_models: totalModels?.count ?? 0,
      verified_only: verified,
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
      generated_at: new Date().toISOString(),
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
    const benchmarkVersions = await resolveBenchmarkVersions(c);

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

    if (benchmarkVersions.length > 0) {
      query += verified
        ? appendBenchmarkVersionFilter(
            "AND",
            "s.benchmark_version",
            benchmarkVersions,
          )
        : appendBenchmarkVersionFilter(
            "WHERE",
            "s.benchmark_version",
            benchmarkVersions,
          );
    }

    query += `
      GROUP BY s.model, s.provider
      ORDER BY submission_count DESC
    `;

    const results = await c.env.prod_pinchbench
      .prepare(query)
      .bind(...benchmarkVersions)
      .all();

    return c.json({
      models: results.results ?? [],
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
    });
  });

  /**
   * GET /api/stats
   *
   * Returns aggregate statistics about the benchmark.
   */
  app.get("/api/stats", async (c) => {
    const benchmarkVersions = await resolveBenchmarkVersions(c);
    const [totalSubmissions, totalModels, verifiedSubmissions, recentActivity] =
      await Promise.all([
        c.env.prod_pinchbench
          .prepare(
            `SELECT COUNT(*) as count FROM submissions
            ${
              benchmarkVersions.length > 0
                ? appendBenchmarkVersionFilter(
                    "WHERE",
                    "benchmark_version",
                    benchmarkVersions,
                  )
                : ""
            }`,
          )
          .bind(...benchmarkVersions)
          .first<{ count: number }>(),
        c.env.prod_pinchbench
          .prepare(
            `SELECT COUNT(DISTINCT model) as count FROM submissions
            ${
              benchmarkVersions.length > 0
                ? appendBenchmarkVersionFilter(
                    "WHERE",
                    "benchmark_version",
                    benchmarkVersions,
                  )
                : ""
            }`,
          )
          .bind(...benchmarkVersions)
          .first<{ count: number }>(),
        c.env.prod_pinchbench
          .prepare(
            `SELECT COUNT(*) as count FROM submissions s JOIN tokens t ON s.token_id = t.id WHERE t.claimed_at IS NOT NULL
            ${
              benchmarkVersions.length > 0
                ? appendBenchmarkVersionFilter(
                    "AND",
                    "s.benchmark_version",
                    benchmarkVersions,
                  )
                : ""
            }`,
          )
          .bind(...benchmarkVersions)
          .first<{ count: number }>(),
        c.env.prod_pinchbench
          .prepare(
            `SELECT COUNT(*) as count FROM submissions WHERE created_at >= datetime('now', '-24 hours')
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
          .bind(...benchmarkVersions)
          .first<{ count: number }>(),
      ]);

    // Top model
    const topModel = await c.env.prod_pinchbench
      .prepare(
        `SELECT model, MAX(score_percentage) as best_score
         FROM submissions
         ${
           benchmarkVersions.length > 0
             ? appendBenchmarkVersionFilter(
                 "WHERE",
                 "benchmark_version",
                 benchmarkVersions,
               )
             : ""
         }
         GROUP BY model
         ORDER BY best_score DESC
         LIMIT 1`,
      )
      .bind(...benchmarkVersions)
      .first<{ model: string; best_score: number }>();

    return c.json({
      total_submissions: totalSubmissions?.count ?? 0,
      total_models: totalModels?.count ?? 0,
      verified_submissions: verifiedSubmissions?.count ?? 0,
      submissions_last_24h: recentActivity?.count ?? 0,
      top_model: topModel ?? null,
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
      generated_at: new Date().toISOString(),
    });
  });
};
