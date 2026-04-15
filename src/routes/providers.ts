import type { Hono } from "hono";
import type { Bindings } from "../types";
import {
  resolveBenchmarkVersions,
  appendBenchmarkVersionFilter,
} from "../utils/query";
import { getModelMetadata } from "../utils/modelMetadata";
import { registerRoute } from "../utils/routeRegistry";

registerRoute({
  method: "GET",
  path: "/api/providers",
  summary: "List all providers",
  description: "Returns a list of all unique provider names from submissions.",
  tags: ["Providers"],
  auth: "none",
  params: [
    { name: "verified", in: "query", type: "string", description: "Set to 'true' for claimed tokens only", enum: ["true", "false"] },
  ],
  responses: {
    200: {
      description: "List of providers",
      schema: {
        type: "object",
        properties: {
          providers: { type: "array", items: { type: "string" } },
          count: { type: "integer" },
        },
      },
    },
  },
  relatedEndpoints: ["/api/providers/:provider/models", "/api/models"],
});

registerRoute({
  method: "GET",
  path: "/api/providers/:provider/models",
  summary: "List models for a provider with stats",
  description:
    "Returns models available from a specific provider along with submission counts, best/average scores, costs, and execution times.",
  tags: ["Providers"],
  auth: "none",
  params: [
    { name: "provider", in: "path", type: "string", required: true, description: "Provider name" },
    { name: "verified", in: "query", type: "string", description: "Set to 'true' for claimed tokens only", enum: ["true", "false"] },
    { name: "version", in: "query", type: "string", description: "Filter by benchmark version" },
  ],
  responses: {
    200: { description: "Models for the provider with stats" },
    422: { description: "Provider is required" },
  },
  relatedEndpoints: ["/api/providers", "/api/leaderboard"],
});

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

    const models = (results.results ?? []).map((row) => {
      const meta = getModelMetadata(row.model as string, row.provider as string);
      return {
        ...row,
        weights: meta?.weights ?? "Unknown",
        hf_link: meta?.hf_link ?? null,
      };
    });

    return c.json({
      provider,
      models,
      benchmark_version:
        benchmarkVersions.length === 1 ? benchmarkVersions[0] : null,
      benchmark_versions: benchmarkVersions,
    });
  });
};
