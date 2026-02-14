import type { Bindings } from "../types";

export const resolveBenchmarkVersions = async (c: {
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

export const appendBenchmarkVersionFilter = (
  clausePrefix: string,
  field: string,
  versions: string[],
) => {
  if (versions.length === 0) return "";
  const placeholders = versions.map(() => "?").join(", ");
  return ` ${clausePrefix} ${field} IN (${placeholders})`;
};
