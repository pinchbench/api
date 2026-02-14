import type { Hono } from "hono";
import type { Bindings } from "../types";

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

export const registerProvidersRoutes = (app: Hono<{ Bindings: Bindings }>) => {
  /**
   * GET /api/providers
   *
   * Returns a list of all unique providers from submissions.
   * Query params:
   *   - verified: "true" to only include providers from claimed tokens
   */
  app.get("/api/providers", async (c) => {
    const verified = c.req.query("verified") === "true";

    let query = `
      SELECT DISTINCT s.provider
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE s.provider IS NOT NULL
    `;

    if (verified) {
      query += " AND t.claimed_at IS NOT NULL";
    }

    query += " ORDER BY s.provider ASC";

    const result = await c.env.prod_pinchbench
      .prepare(query)
      .all<{ provider: string }>();

    const providers = result.results?.map((row) => row.provider) ?? [];

    return c.json({
      providers,
      count: providers.length,
    });
  });

  /**
   * GET /api/providers/:provider/models
   *
   * Returns list of models for a given provider with summary stats.
   * Query params:
   *   - verified: "true" to only include submissions from claimed tokens
   */
  app.get("/api/providers/:provider/models", async (c) => {
    const provider = c.req.param("provider")?.trim();
    if (!provider) {
      return c.json(
        {
          status: "error",
          error: "validation_failed",
          details: ["provider is required"],
        },
        422,
      );
    }

    const verified = c.req.query("verified") === "true";
    const benchmarkVersions = await resolveBenchmarkVersions(c);

    let query = `
      SELECT 
        s.model,
        s.provider,
        COUNT(*) as submission_count,
        MAX(s.score_percentage) as best_score,
        AVG(s.score_percentage) as average_score,
        AVG(s.total_cost_usd) as average_cost_usd,
        AVG(s.total_execution_time_seconds) as average_execution_time_seconds,
        MAX(s.timestamp) as latest_submission
      FROM submissions s
      JOIN tokens t ON s.token_id = t.id
      WHERE s.provider = ?
    `;

    const bindings: (string | number)[] = [provider];

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

    query += `
      GROUP BY s.model, s.provider
      ORDER BY submission_count DESC
    `;

    const results = await c.env.prod_pinchbench
      .prepare(query)
      .bind(...bindings)
      .all();

    return c.json({
      provider,
      models: results.results ?? [],
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
    });
  });
};
