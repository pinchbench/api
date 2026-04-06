import type { Hono } from "hono";
import type { Bindings } from "../types";

type BenchmarkVersionRow = {
  id: string;
  created_at: string;
  current: number;
  hidden: number;
  semver: string | null;
  label: string | null;
  release_notes: string | null;
  release_url: string | null;
};

type BenchmarkVersionResponse = {
  id: string;
  created_at: string;
  is_current: boolean;
  submission_count: number;
  semver: string | null;
  label: string;
  release_notes: string | null;
  release_url: string | null;
};

function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+/.test(version);
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split(".").map(Number);
  const [aParts, bParts] = [parse(a), parse(b)];
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i++) {
    const aNum = aParts[i] ?? 0;
    const bNum = bParts[i] ?? 0;
    if (aNum !== bNum) return bNum - aNum;
  }
  return 0;
}

function getLabel(version: BenchmarkVersionRow): string {
  return version.label ?? version.semver ?? version.id.slice(0, 8);
}

function sortVersions(versions: BenchmarkVersionResponse[]): BenchmarkVersionResponse[] {
  const withSemver = versions.filter((v) => v.semver && isValidSemver(v.semver));
  const withoutSemver = versions.filter((v) => !v.semver || !isValidSemver(v.semver));

  withSemver.sort((a, b) => compareSemver(a.semver!, b.semver!));
  withoutSemver.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return [...withSemver, ...withoutSemver];
}

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
          hidden,
          semver,
          label,
          release_notes,
          release_url
        FROM benchmark_versions
        WHERE hidden = 0
        ORDER BY created_at DESC`,
      )
      .all<BenchmarkVersionRow>();

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
          semver: version.semver ?? null,
          label: getLabel(version),
          release_notes: version.release_notes ?? null,
          release_url: version.release_url ?? null,
        };
      }),
    );

    const sortedVersions = sortVersions(versionsWithCounts);

    return c.json({
      versions: sortedVersions,
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
          current,
          semver,
          label,
          release_notes,
          release_url
        FROM benchmark_versions
        WHERE current = 1 AND hidden = 0
        ORDER BY created_at DESC
        LIMIT 1`,
      )
      .first<BenchmarkVersionRow>();

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
        semver: currentVersion.semver ?? null,
        label: getLabel(currentVersion),
        release_notes: currentVersion.release_notes ?? null,
        release_url: currentVersion.release_url ?? null,
      },
      generated_at: new Date().toISOString(),
    });
  });
};
