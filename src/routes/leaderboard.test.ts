import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { buildLeaderboardQuery } from "./leaderboard";

type QueryWithBindings = {
  query: string;
  bindings: Array<string | number>;
};

type LeaderboardRow = {
  model: string;
  provider: string | null;
  best_score_percentage: number;
  average_score_percentage: number;
  average_execution_time_seconds: number | null;
  best_execution_time_seconds: number | null;
  average_cost_usd: number | null;
  best_cost_usd: number | null;
  submission_count: number;
  latest_submission: string;
  best_submission_id: string;
};

const buildLegacyLeaderboardQuery = ({
  verifiedFlag,
  officialFlag,
  providerFilter,
  benchmarkVersions,
  limit,
}: {
  verifiedFlag: number;
  officialFlag: number;
  providerFilter?: string;
  benchmarkVersions: string[];
  limit: number;
}): QueryWithBindings => {
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
          AND (? = 0 OR s2.official = 1)
        ORDER BY s2.score_percentage DESC, s2.timestamp DESC, s2.id ASC
        LIMIT 1
      ) as best_submission_id
    FROM submissions s
    JOIN tokens t ON s.token_id = t.id
    WHERE (? = 0 OR t.claimed_at IS NOT NULL)
      AND (? = 0 OR s.official = 1)
  `;

  const bindings: Array<string | number> = [verifiedFlag, officialFlag];

  if (benchmarkVersions.length > 0) {
    query = query.replace(
      "ORDER BY s2.score_percentage DESC",
      `AND s2.benchmark_version IN (${benchmarkVersions
        .map(() => "?")
        .join(", ")}) ORDER BY s2.score_percentage DESC`,
    );
    query += ` AND s.benchmark_version IN (${benchmarkVersions
      .map(() => "?")
      .join(", ")})`;
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
    officialFlag,
    ...benchmarkVersions,
    ...(providerFilter ? [providerFilter] : []),
    limit,
  );

  return { query, bindings };
};

const createFixtureDatabase = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tokens (
      id TEXT PRIMARY KEY,
      claimed_at TEXT
    );

    CREATE TABLE submissions (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT,
      score_percentage REAL NOT NULL,
      total_execution_time_seconds REAL,
      total_cost_usd REAL,
      timestamp TEXT NOT NULL,
      benchmark_version TEXT,
      official INTEGER NOT NULL DEFAULT 0
    );
  `);

  const insertToken = db.prepare(
    "INSERT INTO tokens (id, claimed_at) VALUES (?, ?)",
  );
  for (let tokenIndex = 0; tokenIndex < 8; tokenIndex += 1) {
    insertToken.run(
      `token-${tokenIndex}`,
      tokenIndex % 2 === 0 ? "2026-01-01T00:00:00.000Z" : null,
    );
  }

  const insertSubmission = db.prepare(`
    INSERT INTO submissions (
      id,
      token_id,
      model,
      provider,
      score_percentage,
      total_execution_time_seconds,
      total_cost_usd,
      timestamp,
      benchmark_version,
      official
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let modelIndex = 0; modelIndex < 50; modelIndex += 1) {
    for (let submissionIndex = 0; submissionIndex < 40; submissionIndex += 1) {
      insertSubmission.run(
        `model-${modelIndex}-submission-${submissionIndex}`,
        `token-${submissionIndex % 8}`,
        `model-${modelIndex}`,
        `provider-${modelIndex % 5}`,
        ((modelIndex * 17 + submissionIndex * 11) % 1000) / 10,
        10 + modelIndex + submissionIndex / 10,
        (modelIndex + submissionIndex) / 1000,
        `2026-02-${String((submissionIndex % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
        submissionIndex % 4 === 0 ? "2026-hidden" : "2026-current",
        submissionIndex % 3 === 0 ? 1 : 0,
      );
    }
  }

  insertSubmission.run(
    "tie-model-newer-id-b",
    "token-0",
    "tie-model",
    "tie-provider",
    99,
    1,
    0.01,
    "2026-03-02T00:00:00.000Z",
    "2026-current",
    1,
  );
  insertSubmission.run(
    "tie-model-newer-id-a",
    "token-0",
    "tie-model",
    "tie-provider",
    99,
    2,
    0.02,
    "2026-03-02T00:00:00.000Z",
    "2026-current",
    1,
  );
  insertSubmission.run(
    "tie-model-older-high-score",
    "token-0",
    "tie-model",
    "tie-provider",
    99,
    3,
    0.03,
    "2026-03-01T00:00:00.000Z",
    "2026-current",
    1,
  );

  insertSubmission.run(
    "shared-model-provider-filtered-row",
    "token-0",
    "shared-model",
    "provider-filtered",
    88,
    4,
    0.04,
    "2026-04-01T00:00:00.000Z",
    "2026-current",
    1,
  );
  insertSubmission.run(
    "shared-model-best-other-provider",
    "token-0",
    "shared-model",
    "provider-other",
    99,
    5,
    0.05,
    "2026-04-02T00:00:00.000Z",
    "2026-current",
    1,
  );

  return db;
};

const executeLeaderboardQuery = (
  db: DatabaseSync,
  { query, bindings }: QueryWithBindings,
) =>
  db.prepare(query).all(...bindings) as unknown as LeaderboardRow[];

const normalizeRows = (rows: LeaderboardRow[]) =>
  rows
    .map((row) => ({
      ...row,
      average_score_percentage: Number(row.average_score_percentage.toFixed(8)),
      average_execution_time_seconds:
        row.average_execution_time_seconds === null
          ? null
          : Number(row.average_execution_time_seconds.toFixed(8)),
      average_cost_usd:
        row.average_cost_usd === null
          ? null
          : Number(row.average_cost_usd.toFixed(8)),
    }))
    .sort((left, right) => left.model.localeCompare(right.model));

const explainQueryPlan = (
  db: DatabaseSync,
  { query, bindings }: QueryWithBindings,
) =>
  db
    .prepare(`EXPLAIN QUERY PLAN ${query}`)
    .all(...bindings)
    .map((row) => String((row as { detail: string }).detail));

describe("buildLeaderboardQuery", () => {
  test.each([
    {
      name: "current benchmark version",
      verifiedFlag: 0,
      officialFlag: 0,
      benchmarkVersions: ["2026-current"],
      limit: 200,
    },
    {
      name: "verified current benchmark version",
      verifiedFlag: 1,
      officialFlag: 0,
      benchmarkVersions: ["2026-current"],
      limit: 200,
    },
    {
      name: "official current benchmark version",
      verifiedFlag: 0,
      officialFlag: 1,
      benchmarkVersions: ["2026-current"],
      limit: 200,
    },
    {
      name: "provider filtered rows preserve legacy best-id semantics",
      verifiedFlag: 0,
      officialFlag: 0,
      providerFilter: "provider-filtered",
      benchmarkVersions: ["2026-current"],
      limit: 200,
    },
  ])(
    "matches legacy correlated-subquery results for $name",
    ({ name: _name, ...params }) => {
      const db = createFixtureDatabase();
      const legacyRows = executeLeaderboardQuery(
        db,
        buildLegacyLeaderboardQuery(params),
      );
      const windowRows = executeLeaderboardQuery(
        db,
        buildLeaderboardQuery(params),
      );

      expect(normalizeRows(windowRows)).toEqual(normalizeRows(legacyRows));
      const tieModelRow = windowRows.find((row) => row.model === "tie-model");
      if (tieModelRow) {
        expect(tieModelRow.best_submission_id).toBe("tie-model-newer-id-a");
      }
    },
  );

  test("uses a single ranked pass instead of a per-model correlated scalar subquery", () => {
    const db = createFixtureDatabase();
    const params = {
      verifiedFlag: 1,
      officialFlag: 1,
      benchmarkVersions: ["2026-current"],
      limit: 200,
    };

    const legacyPlan = explainQueryPlan(
      db,
      buildLegacyLeaderboardQuery(params),
    );
    const windowPlan = explainQueryPlan(db, buildLeaderboardQuery(params));

    expect(legacyPlan.some((detail) => /CORRELATED SCALAR SUBQUERY/.test(detail)))
      .toBe(true);
    expect(windowPlan.some((detail) => /CORRELATED SCALAR SUBQUERY/.test(detail)))
      .toBe(false);
    expect(buildLeaderboardQuery(params).query).toContain("ROW_NUMBER() OVER");
  });
});
