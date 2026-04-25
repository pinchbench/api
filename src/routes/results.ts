import type { Hono } from "hono";
import type { Bindings, SubmissionPayload } from "../types";
import { ensureHttps, getAuthToken, hashToken } from "../utils/security";
import { normalizeModelName } from "../utils/models";
import { registerRoute } from "../utils/routeRegistry";

// Benchmark version IDs are semver-ish only when they have major.minor.patch.
// Two-component values such as "1.0" are legacy labels for sorting purposes.
const STRICT_SEMVER_REGEX =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const LEGACY_BETA_LABEL_REGEX = /^1\.0\.0-beta\.(\d+)$/;

export const isStrictBenchmarkSemver = (version: string): boolean =>
  STRICT_SEMVER_REGEX.test(version);

export const getNextLegacyBenchmarkVersionLabel = async (
  db: Bindings["prod_pinchbench"],
): Promise<string> => {
  const legacyLabels = await db
    .prepare(
      `SELECT semver, label
       FROM benchmark_versions
       WHERE semver LIKE '1.0.0-beta.%'
          OR label LIKE '1.0.0-beta.%'`,
    )
    .all<{ semver: string | null; label: string | null }>();

  const maxLegacyIndex = (legacyLabels.results ?? []).reduce((max, row) => {
    const semverMatch = row.semver?.match(LEGACY_BETA_LABEL_REGEX);
    const labelMatch = row.label?.match(LEGACY_BETA_LABEL_REGEX);
    const semverIndex = semverMatch ? Number(semverMatch[1]) : 0;
    const labelIndex = labelMatch ? Number(labelMatch[1]) : 0;

    return Math.max(max, semverIndex, labelIndex);
  }, 0);

  return `1.0.0-beta.${maxLegacyIndex + 1}`;
};

const getBenchmarkVersionInsertLabels = async (
  db: Bindings["prod_pinchbench"],
  benchmarkVersion: string,
): Promise<{ semver: string; label: string }> => {
  if (isStrictBenchmarkSemver(benchmarkVersion)) {
    return { semver: benchmarkVersion, label: benchmarkVersion };
  }

  const legacyLabel = await getNextLegacyBenchmarkVersionLabel(db);
  return { semver: legacyLabel, label: legacyLabel };
};

registerRoute({
  method: "POST",
  path: "/api/results",
  summary: "Submit benchmark results",
  description:
    "Submit benchmark results for an AI model run. Requires authentication. If a submission with the same ID already exists, returns the existing ranking without creating a duplicate.",
  tags: ["Submissions"],
  auth: "token",
  rateLimit: "100 submissions per day per token",
  requestBody: {
    description: "Benchmark result payload",
    schema: {
      type: "object",
      required: ["submission_id", "timestamp", "model", "total_score", "max_score", "tasks"],
      properties: {
        submission_id: { type: "string", format: "uuid", description: "UUID v4 identifying this submission" },
        timestamp: { type: "string", format: "date-time", description: "ISO 8601 timestamp" },
        model: { type: "string", description: "Model identifier (e.g. google/gemini-2.5-pro)" },
        provider: { type: "string", description: "Provider name (e.g. openrouter)" },
        benchmark_version: { type: "string", description: "Benchmark version identifier" },
        total_score: { type: "number", description: "Total points scored" },
        max_score: { type: "number", description: "Maximum possible score" },
        total_execution_time_seconds: { type: "number" },
        total_cost_usd: { type: "number" },
        input_tokens: { type: "integer" },
        output_tokens: { type: "integer" },
        total_tokens: { type: "integer" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              score: { type: "number" },
              max_score: { type: "number" },
            },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Submission accepted (new)",
      schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["accepted"] },
          submission_id: { type: "string" },
          official: { type: "boolean" },
          rank: { type: "integer" },
          percentile: { type: "number" },
          leaderboard_url: { type: "string" },
        },
      },
    },
    200: { description: "Submission already existed, returning existing ranking" },
    401: { description: "Invalid or missing authentication token" },
    422: { description: "Validation failed" },
    429: { description: "Rate limited" },
  },
  relatedEndpoints: ["/api/submissions/:id", "/api/leaderboard"],
});

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isIsoTimestamp = (value: string): boolean => {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

export const registerResultsRoutes = (app: Hono<{ Bindings: Bindings }>) => {
  app.post("/api/results", async (c) => {
    if (!ensureHttps(c.req.url) && !c.req.url.includes("localhost")) {
      return c.json(
        {
          status: "error",
          error: "invalid_request",
          message: "HTTPS is required",
        },
        400,
      );
    }

    const contentType = c.req.header("Content-Type");
    if (
      !contentType ||
      !contentType.toLowerCase().includes("application/json")
    ) {
      return c.json(
        {
          status: "error",
          error: "validation_failed",
          details: ["Content-Type must be application/json"],
        },
        422,
      );
    }

    const token = getAuthToken(c);
    if (!token) {
      return c.json(
        {
          status: "error",
          error: "unauthorized",
          message: "Invalid or missing authentication token",
        },
        401,
      );
    }

    const tokenHash = await hashToken(token);
    const tokenRow = await c.env.prod_pinchbench
      .prepare("SELECT id FROM tokens WHERE token_hash = ? LIMIT 1")
      .bind(tokenHash)
      .first<{ id: string }>();

    if (!tokenRow?.id) {
      return c.json(
        {
          status: "error",
          error: "unauthorized",
          message: "Invalid or missing authentication token",
        },
        401,
      );
    }

    const contentLength = Number(c.req.header("Content-Length") ?? 0);
    if (contentLength > 1024 * 1024) {
      return c.json(
        {
          status: "error",
          error: "validation_failed",
          details: ["Payload exceeds 1MB limit"],
        },
        413,
      );
    }

    let payload: SubmissionPayload;
    try {
      payload = (await c.req.json()) as SubmissionPayload;
    } catch (error) {
      return c.json(
        {
          status: "error",
          error: "validation_failed",
          details: ["Body must be valid JSON"],
        },
        422,
      );
    }

    const details: string[] = [];

    if (!UUID_V4_REGEX.test(payload.submission_id ?? "")) {
      details.push("submission_id must be a valid UUID v4");
    }

    if (!isIsoTimestamp(payload.timestamp ?? "")) {
      details.push("timestamp must be ISO 8601 format");
    }

    if (!payload.model || !payload.model.trim()) {
      details.push("model is required and must be non-empty");
    }

    if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
      details.push("tasks must have at least one entry");
    }

    if (
      typeof payload.total_score !== "number" ||
      typeof payload.max_score !== "number"
    ) {
      details.push("total_score and max_score must be numbers");
    } else if (payload.total_score > payload.max_score) {
      details.push("total_score must be less than or equal to max_score");
    }

    if (Array.isArray(payload.tasks)) {
      payload.tasks.forEach((task, index) => {
        if (
          typeof task.score !== "number" ||
          typeof task.max_score !== "number"
        ) {
          details.push(`tasks[${index}].score and max_score must be numbers`);
        } else if (task.score > task.max_score) {
          details.push(`tasks[${index}].score must be between 0 and max_score`);
        }
      });
    }

    if (details.length > 0) {
      return c.json(
        {
          status: "error",
          error: "validation_failed",
          details,
        },
        422,
      );
    }

    // Normalize model name (strip "openrouter/" prefix)
    const normalizedModel = normalizeModelName(payload.model);

    // Determine if this is an official run via the shared OFFICIAL_KEY secret
    // Use constant-time HMAC comparison to avoid timing side-channel attacks
    const officialKeyHeader = c.req.header("X-PinchBench-Official-Key");
    let isOfficial = 0;
    if (c.env.OFFICIAL_KEY && officialKeyHeader) {
      const encoder = new TextEncoder();
      const hmacKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode("pinchbench"),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const [sigA, sigB] = await Promise.all([
        crypto.subtle.sign("HMAC", hmacKey, encoder.encode(officialKeyHeader)),
        crypto.subtle.sign("HMAC", hmacKey, encoder.encode(c.env.OFFICIAL_KEY)),
      ]);
      const a = new Uint8Array(sigA);
      const b = new Uint8Array(sigB);
      if (a.byteLength === b.byteLength && a.every((v, i) => v === b[i])) {
        isOfficial = 1;
      }
    }

    const existing = await c.env.prod_pinchbench
      .prepare(
        "SELECT id, score_percentage, official FROM submissions WHERE id = ? LIMIT 1",
      )
      .bind(payload.submission_id)
      .first<{ id: string; score_percentage: number; official: number }>();

    const computedScorePercentage =
      payload.max_score === 0 ? 0 : payload.total_score / payload.max_score;
    const scorePercentage =
      existing?.score_percentage ?? computedScorePercentage;

    if (!existing) {
      const dailyCountRow = await c.env.prod_pinchbench
        .prepare(
          "SELECT COUNT(*) as total FROM submissions WHERE token_id = ? AND created_at >= datetime('now', '-1 day')",
        )
        .bind(tokenRow.id)
        .first<{ total: number }>();

      if ((dailyCountRow?.total ?? 0) >= 100) {
        return c.json(
          {
            status: "error",
            error: "rate_limited",
            message: "Too many submissions for this token",
          },
          429,
        );
      }

      await c.env.prod_pinchbench
        .prepare(
          `INSERT INTO submissions (
            id,
            token_id,
            model,
            provider,
            total_score,
            max_score,
            score_percentage,
            total_execution_time_seconds,
            total_cost_usd,
            input_tokens,
            output_tokens,
            total_tokens,
            timestamp,
            client_version,
            openclaw_version,
            run_id,
            benchmark_version,
            tasks,
            usage_summary,
            metadata,
            official,
            created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
          )`,
        )
        .bind(
          payload.submission_id,
          tokenRow.id,
          normalizedModel,
          payload.provider ?? null,
          payload.total_score,
          payload.max_score,
          computedScorePercentage,
          payload.total_execution_time_seconds ?? null,
          payload.total_cost_usd ?? null,
          payload.input_tokens ?? null,
          payload.output_tokens ?? null,
          payload.total_tokens ?? null,
          payload.timestamp,
          payload.client_version ?? null,
          payload.openclaw_version ?? null,
          payload.run_id ?? null,
          payload.benchmark_version ?? null,
          JSON.stringify(payload.tasks ?? []),
          JSON.stringify(payload.usage_summary ?? null),
          JSON.stringify(payload.metadata ?? null),
          isOfficial,
        )
        .run();

      if (payload.benchmark_version) {
        const existingBenchmarkVersion = await c.env.prod_pinchbench
          .prepare("SELECT id FROM benchmark_versions WHERE id = ? LIMIT 1")
          .bind(payload.benchmark_version)
          .first<{ id: string }>();

        if (!existingBenchmarkVersion) {
          const { semver, label } = await getBenchmarkVersionInsertLabels(
            c.env.prod_pinchbench,
            payload.benchmark_version,
          );

          await c.env.prod_pinchbench
            .prepare(
              "INSERT OR IGNORE INTO benchmark_versions (id, current, semver, label) VALUES (?, 0, ?, ?)",
            )
            .bind(payload.benchmark_version, semver, label)
            .run();
        }
      }
    }

    await c.env.prod_pinchbench
      .prepare("UPDATE tokens SET last_used_at = datetime('now') WHERE id = ?")
      .bind(tokenRow.id)
      .run();

    const totalCountRow = await c.env.prod_pinchbench
      .prepare("SELECT COUNT(*) as total FROM submissions")
      .first<{ total: number }>();

    const higherCountRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT COUNT(*) as higher FROM submissions WHERE score_percentage > ?",
      )
      .bind(scorePercentage)
      .first<{ higher: number }>();

    const lowerCountRow = await c.env.prod_pinchbench
      .prepare(
        "SELECT COUNT(*) as lower FROM submissions WHERE score_percentage < ?",
      )
      .bind(scorePercentage)
      .first<{ lower: number }>();

    const totalSubmissions = totalCountRow?.total ?? 0;
    const higher = higherCountRow?.higher ?? 0;
    const lower = lowerCountRow?.lower ?? 0;
    const rank = higher + 1;
    const percentile =
      totalSubmissions === 0 ? 0 : (lower / totalSubmissions) * 100;

    const officialResult = existing
      ? existing.official === 1
      : isOfficial === 1;

    return c.json(
      {
        status: "accepted",
        submission_id: payload.submission_id,
        official: officialResult,
        rank,
        percentile: Number(percentile.toFixed(2)),
        leaderboard_url: `https://pinchbench.com/submission/${payload.submission_id}`,
      },
      existing ? 200 : 201,
    );
  });
};
