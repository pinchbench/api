import type { Bindings } from "../types";

const CURRENT_BENCHMARK_VERSIONS_CACHE_TTL_MS = 60_000;

let currentBenchmarkVersionsCache:
  | { expiresAt: number; versions: string[] }
  | null = null;
let currentBenchmarkVersionsInFlight: Promise<string[]> | null = null;

export const resolveBenchmarkVersions = async (c: {
  env: Bindings;
  req: { query: (name: string) => string | undefined };
}) => {
  // Support both "version" and "benchmark_version" query params
  const requested =
    c.req.query("version")?.trim() || c.req.query("benchmark_version")?.trim();
  if (requested) {
    // Verify the requested version is not hidden
    const row = await c.env.prod_pinchbench
      .prepare("SELECT id FROM benchmark_versions WHERE id = ? AND hidden = 0")
      .bind(requested)
      .first<{ id: string }>();
    return row ? [requested] : [];
  }

  const now = Date.now();
  if (currentBenchmarkVersionsCache?.expiresAt > now) {
    return [...currentBenchmarkVersionsCache.versions];
  }

  if (currentBenchmarkVersionsInFlight) {
    return [...(await currentBenchmarkVersionsInFlight)];
  }

  currentBenchmarkVersionsInFlight = c.env.prod_pinchbench
    .prepare("SELECT id FROM benchmark_versions WHERE current = 1 AND hidden = 0")
    .all<{ id: string }>()
    .then((currentRows) => {
      const versions = currentRows.results?.map((row) => row.id) ?? [];
      // Benchmark versions change weekly; a short in-isolate TTL removes the hot-path
      // D1 lookup from every unversioned API request while keeping rollouts fresh.
      currentBenchmarkVersionsCache = {
        expiresAt: now + CURRENT_BENCHMARK_VERSIONS_CACHE_TTL_MS,
        versions,
      };
      return versions;
    })
    .finally(() => {
      currentBenchmarkVersionsInFlight = null;
    });

  const versions = await currentBenchmarkVersionsInFlight;
  return [...versions];
};

export const appendBenchmarkVersionFilter = (
  clausePrefix: string,
  field: string,
  versions: string[],
) => {
  if (versions.length === 0) return "";
  const placeholders = versions.map(() => "?").join(", ");
  return ` ${clausePrefix} ${field} IN (${placeholders})`;
};
