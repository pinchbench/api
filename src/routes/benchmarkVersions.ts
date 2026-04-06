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
          semver,
          label,
          release_notes,
          release_url,
          created_at,
          current,
          hidden
        FROM benchmark_versions
        WHERE hidden = 0
        ORDER BY created_at DESC`,
      )
      .all<{
        id: string;
        semver: string | null;
        label: string | null;
        release_notes: string | null;
        release_url: string | null;
        created_at: string;
        current: number;
        hidden: number;
      }>();

    const versionsWithCounts = await Promise.all(
      (versions.results ?? []).map(async (version) => {
        const countRow = await c.env.prod_pinchbench
          .prepare(
            "SELECT COUNT(*) as count FROM submissions WHERE benchmark_version = ?",
          )
          .bind(version.id)
          .first<{ count: number }>();

        const displayLabel = version.label || version.semver || version.id.slice(0, 8);

        return {
          id: version.id,
          semver: version.semver,
          label: displayLabel,
          release_notes: version.release_notes,
          release_url: version.release_url,
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
          semver,
          label,
          release_notes,
          release_url,
          created_at,
          current
        FROM benchmark_versions
        WHERE current = 1 AND hidden = 0
        ORDER BY created_at DESC
        LIMIT 1`,
      )
      .first<{
        id: string;
        semver: string | null;
        label: string | null;
        release_notes: string | null;
        release_url: string | null;
        created_at: string;
        current: number;
      }>();

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

    const displayLabel = currentVersion.label || currentVersion.semver || currentVersion.id.slice(0, 8);

    return c.json({
      version: {
        id: currentVersion.id,
        semver: currentVersion.semver,
        label: displayLabel,
        release_notes: currentVersion.release_notes,
        release_url: currentVersion.release_url,
        created_at: currentVersion.created_at,
        is_current: true,
        submission_count: countRow?.count ?? 0,
      },
      generated_at: new Date().toISOString(),
    });
  });
};
