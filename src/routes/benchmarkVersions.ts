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

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
  build: string | null;
};

/**
 * Parse a SemVer string into comparable components.
 * Handles: X.Y.Z, X.Y.Z-prerelease, X.Y.Z-prerelease+build, X.Y.Z+build
 * Per semver.org spec.
 */
function parseSemver(version: string): ParsedSemver | null {
  // Strip build metadata first (not used in comparison per spec)
  const [versionWithoutBuild, build] = version.split("+");

  // Match X.Y.Z or X.Y.Z-prerelease
  const match = versionWithoutBuild.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;

  const [, major, minor, patch, prereleaseStr] = match;

  // Parse prerelease identifiers (dot-separated, can be numeric or alphanumeric)
  const prerelease: (string | number)[] = prereleaseStr
    ? prereleaseStr.split(".").map((id) => {
        const num = parseInt(id, 10);
        return !isNaN(num) && String(num) === id ? num : id;
      })
    : [];

  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease,
    build: build || null,
  };
}

function isValidSemver(version: string): boolean {
  return parseSemver(version) !== null;
}

/**
 * Compare two SemVer strings per semver.org spec.
 * Returns: negative if a > b (for descending sort), positive if a < b, 0 if equal
 *
 * Key rules from semver.org:
 * - Pre-release versions have LOWER precedence than release (1.0.0-alpha < 1.0.0)
 * - Numeric pre-release identifiers are compared numerically
 * - Alphanumeric identifiers are compared lexically
 * - Build metadata (+...) is ignored for precedence
 */
function compareSemver(a: string, b: string): number {
  const aParsed = parseSemver(a);
  const bParsed = parseSemver(b);

  // Invalid versions sort to the end
  if (!aParsed && !bParsed) return 0;
  if (!aParsed) return 1;
  if (!bParsed) return -1;

  // Compare major.minor.patch (descending order)
  if (aParsed.major !== bParsed.major)
    return bParsed.major - aParsed.major;
  if (aParsed.minor !== bParsed.minor)
    return bParsed.minor - aParsed.minor;
  if (aParsed.patch !== bParsed.patch)
    return bParsed.patch - aParsed.patch;

  // Pre-release versions have LOWER precedence than release
  // e.g., 1.0.0-alpha < 1.0.0
  const aHasPre = aParsed.prerelease.length > 0;
  const bHasPre = bParsed.prerelease.length > 0;

  if (!aHasPre && bHasPre) return -1; // a is release, b is pre-release, a > b
  if (aHasPre && !bHasPre) return 1; // a is pre-release, b is release, a < b
  if (!aHasPre && !bHasPre) return 0; // both releases, equal

  // Compare pre-release identifiers
  const maxLen = Math.max(
    aParsed.prerelease.length,
    bParsed.prerelease.length,
  );
  for (let i = 0; i < maxLen; i++) {
    const aId = aParsed.prerelease[i];
    const bId = bParsed.prerelease[i];

    // Fewer identifiers = lower precedence (1.0.0-alpha < 1.0.0-alpha.1)
    if (aId === undefined) return 1; // a has fewer, a < b
    if (bId === undefined) return -1; // b has fewer, b < a

    // Numeric identifiers always have lower precedence than alphanumeric
    const aIsNum = typeof aId === "number";
    const bIsNum = typeof bId === "number";

    if (aIsNum && !bIsNum) return 1; // numeric < alphanumeric
    if (!aIsNum && bIsNum) return -1;

    if (aIsNum && bIsNum) {
      if (aId !== bId) return (bId as number) - (aId as number);
    } else {
      // Both alphanumeric - lexicographic comparison
      if (aId < bId) return 1;
      if (aId > bId) return -1;
    }
  }

  return 0;
}

// Export for testing
export { parseSemver, isValidSemver, compareSemver };

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
