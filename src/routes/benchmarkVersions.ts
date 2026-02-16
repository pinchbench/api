import type { Hono } from "hono";
import type { Bindings } from "../types";

export const registerBenchmarkVersionRoutes = (
  app: Hono<{ Bindings: Bindings }>,
) => {
  /**
   * GET /api/benchmark_versions
   *
   * Returns all benchmark versions with their details.
   */
  app.get("/api/benchmark_versions", async (c) => {
    const versions = await c.env.prod_pinchbench
      .prepare(
        `SELECT 
          id, 
          created_at,
          current,
          hidden
        FROM benchmark_versions
        WHERE hidden = 0
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
          submission_count: countRow?.count ?? 0,
        };
      }),
    );

    return c.json({
      versions: versionsWithCounts,
      generated_at: new Date().toISOString(),
    });
  });

  /**
   * GET /api/benchmark_versions/latest
   *
   * Returns the current/latest benchmark version.
   */
  app.get("/api/benchmark_versions/latest", async (c) => {
    const currentVersion = await c.env.prod_pinchbench
      .prepare(
        `SELECT 
          id, 
          created_at,
          current
        FROM benchmark_versions
        WHERE current = 1 AND hidden = 0
        ORDER BY created_at DESC
        LIMIT 1`,
      )
      .first<{ id: string; created_at: string; current: number }>();

    if (!currentVersion) {
      return c.json(
        {
          status: "error",
          error: "not_found",
          message: "No current benchmark version found",
        },
        404,
      );
    }

    const countRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT COUNT(*) as count FROM submissions WHERE benchmark_version = ?",
      )
      .bind(currentVersion.id)
      .first<{ count: number }>();

    return c.json({
      version: {
        id: currentVersion.id,
        created_at: currentVersion.created_at,
        is_current: true,
        submission_count: countRow?.count ?? 0,
      },
      generated_at: new Date().toISOString(),
    });
  });
};
