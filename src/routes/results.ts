import type { Hono } from "hono";
import type { Bindings, SubmissionPayload } from "../types";
import { ensureHttps, hashToken } from "../utils/security";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isIsoTimestamp = (value: string): boolean => {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

const getAuthToken = (c: {
  req: { header: (name: string) => string | undefined };
}) => c.req.header("X-PinchBench-Token")?.trim();

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

    const existing = await c.env.prod_pinchbench
      .prepare(
        "SELECT id, score_percentage FROM submissions WHERE id = ? LIMIT 1",
      )
      .bind(payload.submission_id)
      .first<{ id: string; score_percentage: number }>();

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
            created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
          )`,
        )
        .bind(
          payload.submission_id,
          tokenRow.id,
          payload.model,
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
        )
        .run();

      if (payload.benchmark_version) {
        await c.env.prod_pinchbench
          .prepare(
            "INSERT OR IGNORE INTO benchmark_versions (id, current) VALUES (?, 0)",
          )
          .bind(payload.benchmark_version)
          .run();
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

    return c.json(
      {
        status: "accepted",
        submission_id: payload.submission_id,
        rank,
        percentile: Number(percentile.toFixed(2)),
        leaderboard_url: `https://pinchbench.com/submission/${payload.submission_id}`,
      },
      existing ? 200 : 201,
    );
  });
};
