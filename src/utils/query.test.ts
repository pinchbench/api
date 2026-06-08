import { afterEach, describe, expect, test, vi } from "vitest";
import type { Bindings } from "../types";

type BenchmarkVersionRow = {
  id: string;
  current: number;
  hidden: number;
};

type QueryContext = {
  env: Bindings;
  req: { query: (name: string) => string | undefined };
};

const productionEquivalentBenchmarkVersions: BenchmarkVersionRow[] = [
  { id: "1.2.2", current: 1, hidden: 0 },
  { id: "1.2.2-dev.13+gabc1234", current: 1, hidden: 0 },
  { id: "1.0.0-beta.10", current: 0, hidden: 0 },
  { id: "broken-run", current: 1, hidden: 1 },
  { id: "legacy-hidden", current: 0, hidden: 1 },
];

const responseBenchmarkShape = (versions: string[]) => ({
  benchmark_version: versions.length === 1 ? versions[0] : null,
  benchmark_versions: versions,
});

const uncachedResolveBenchmarkVersions = async (c: QueryContext) => {
  const requested =
    c.req.query("version")?.trim() || c.req.query("benchmark_version")?.trim();
  if (requested) {
    const row = await c.env.prod_pinchbench
      .prepare("SELECT id FROM benchmark_versions WHERE id = ? AND hidden = 0")
      .bind(requested)
      .first<{ id: string }>();
    return row ? [requested] : [];
  }
  const currentRows = await c.env.prod_pinchbench
    .prepare("SELECT id FROM benchmark_versions WHERE current = 1 AND hidden = 0")
    .all<{ id: string }>();
  return currentRows.results?.map((row) => row.id) ?? [];
};

const createD1Mock = (
  rows: BenchmarkVersionRow[],
  options: { currentAll?: () => Promise<{ results: Array<{ id: string }> }> } = {},
) => {
  const queries: Array<{ sql: string; bindings: unknown[]; method: "all" | "first" }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => ({
        all: async () => {
          queries.push({ sql, bindings, method: "all" });
          if (options.currentAll) return options.currentAll();
          return {
            results: rows
              .filter((row) => row.current === 1 && row.hidden === 0)
              .map((row) => ({ id: row.id })),
          };
        },
        first: async <T>() => {
          queries.push({ sql, bindings, method: "first" });
          const [requested] = bindings;
          const row = rows.find(
            (version) => version.id === requested && version.hidden === 0,
          );
          return (row ? { id: row.id } : null) as T | null;
        },
      }),
      all: async () => {
        queries.push({ sql, bindings: [], method: "all" });
        if (options.currentAll) return options.currentAll();
        return {
          results: rows
            .filter((row) => row.current === 1 && row.hidden === 0)
            .map((row) => ({ id: row.id })),
        };
      },
    }),
  } as unknown as Bindings["prod_pinchbench"];

  return { db, queries };
};

const createContext = (
  db: Bindings["prod_pinchbench"],
  query: Record<string, string | undefined> = {},
): QueryContext => ({
  env: { prod_pinchbench: db },
  req: { query: (name: string) => query[name] },
});

const importResolveBenchmarkVersions = async () => {
  vi.resetModules();
  return (await import("./query")).resolveBenchmarkVersions;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveBenchmarkVersions parity", () => {
  test("matches the uncached resolver for every affected endpoint response shape", async () => {
    const resolveBenchmarkVersions = await importResolveBenchmarkVersions();
    const endpointCases = [
      { endpoint: "GET /api/submissions", query: {} },
      { endpoint: "GET /api/model-submissions", query: { model: "anthropic/claude" } },
      { endpoint: "GET /api/me/submissions", query: {} },
      { endpoint: "GET /api/users/:github_username/submissions", query: {} },
      { endpoint: "GET /api/leaderboard", query: {} },
      { endpoint: "GET /api/models", query: { verified: "true" } },
      { endpoint: "GET /api/stats", query: {} },
      { endpoint: "GET /api/providers/:provider/models", query: {} },
      {
        endpoint: "GET /api/leaderboard explicit version",
        query: { version: "1.0.0-beta.10" },
      },
      {
        endpoint: "GET /api/submissions benchmark_version alias",
        query: { benchmark_version: "1.2.2" },
      },
      {
        endpoint: "GET /api/models hidden version",
        query: { version: "broken-run" },
      },
    ];

    for (const endpointCase of endpointCases) {
      const uncachedD1 = createD1Mock(productionEquivalentBenchmarkVersions);
      const cachedD1 = createD1Mock(productionEquivalentBenchmarkVersions);

      const uncachedVersions = await uncachedResolveBenchmarkVersions(
        createContext(uncachedD1.db, endpointCase.query),
      );
      const cachedVersions = await resolveBenchmarkVersions(
        createContext(cachedD1.db, endpointCase.query),
      );

      expect(
        responseBenchmarkShape(cachedVersions),
        endpointCase.endpoint,
      ).toEqual(responseBenchmarkShape(uncachedVersions));
    }
  });
});

describe("resolveBenchmarkVersions cache regression", () => {
  test("reuses the current-version lookup for repeated unversioned API requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T10:00:00Z"));
    const resolveBenchmarkVersions = await importResolveBenchmarkVersions();
    const d1 = createD1Mock(productionEquivalentBenchmarkVersions);
    const context = createContext(d1.db);

    for (let i = 0; i < 100; i += 1) {
      await expect(resolveBenchmarkVersions(context)).resolves.toEqual([
        "1.2.2",
        "1.2.2-dev.13+gabc1234",
      ]);
    }

    expect(d1.queries.filter((query) => query.method === "all")).toHaveLength(1);
  });

  test("refreshes current versions after the 60 second TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T10:00:00Z"));
    const resolveBenchmarkVersions = await importResolveBenchmarkVersions();
    const d1 = createD1Mock(productionEquivalentBenchmarkVersions);
    const context = createContext(d1.db);

    await resolveBenchmarkVersions(context);
    vi.setSystemTime(new Date("2026-06-08T10:00:59Z"));
    await resolveBenchmarkVersions(context);
    vi.setSystemTime(new Date("2026-06-08T10:01:01Z"));
    await resolveBenchmarkVersions(context);

    expect(d1.queries.filter((query) => query.method === "all")).toHaveLength(2);
  });

  test("coalesces concurrent cold misses into one D1 query", async () => {
    const resolveBenchmarkVersions = await importResolveBenchmarkVersions();
    let resolveCurrentRows:
      | ((value: { results: Array<{ id: string }> }) => void)
      | undefined;
    const currentRows = new Promise<{ results: Array<{ id: string }> }>(
      (resolve) => {
        resolveCurrentRows = resolve;
      },
    );
    const d1 = createD1Mock(productionEquivalentBenchmarkVersions, {
      currentAll: () => currentRows,
    });
    const context = createContext(d1.db);

    const requests = Array.from({ length: 25 }, () =>
      resolveBenchmarkVersions(context),
    );
    expect(d1.queries.filter((query) => query.method === "all")).toHaveLength(1);

    resolveCurrentRows?.({ results: [{ id: "1.2.2" }] });
    await expect(Promise.all(requests)).resolves.toEqual(
      Array.from({ length: 25 }, () => ["1.2.2"]),
    );
  });

  test("continues to validate explicit requested versions against D1", async () => {
    const resolveBenchmarkVersions = await importResolveBenchmarkVersions();
    const d1 = createD1Mock(productionEquivalentBenchmarkVersions);
    const context = createContext(d1.db, { version: "1.0.0-beta.10" });

    await expect(resolveBenchmarkVersions(context)).resolves.toEqual([
      "1.0.0-beta.10",
    ]);
    await expect(resolveBenchmarkVersions(context)).resolves.toEqual([
      "1.0.0-beta.10",
    ]);

    expect(d1.queries.filter((query) => query.method === "first")).toHaveLength(2);
  });

  test("returns defensive copies so consumers cannot mutate cached values", async () => {
    const resolveBenchmarkVersions = await importResolveBenchmarkVersions();
    const d1 = createD1Mock(productionEquivalentBenchmarkVersions);
    const context = createContext(d1.db);

    const first = await resolveBenchmarkVersions(context);
    first.push("mutated-by-consumer");

    await expect(resolveBenchmarkVersions(context)).resolves.toEqual([
      "1.2.2",
      "1.2.2-dev.13+gabc1234",
    ]);
  });
});
