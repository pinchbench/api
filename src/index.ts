import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { registerResultsRoutes } from "./routes/results";
import { registerRegisterRoutes } from "./routes/register";
import { registerLeaderboardRoutes } from "./routes/leaderboard";
import { registerSubmissionRoutes } from "./routes/submissions";
import { registerBenchmarkVersionRoutes } from "./routes/benchmarkVersions";
import { registerProvidersRoutes } from "./routes/providers";
import { admin } from "./routes/admin";

const app = new Hono<{ Bindings: Bindings }>();

// Mount admin routes (protected by Cloudflare Access)
app.route("/admin", admin);

// Log every POST request body for debugging
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "POST") {
    return next();
  }

  // Clone the request so the body can still be consumed by route handlers
  const cloned = c.req.raw.clone();
  let body: string | null = null;
  try {
    body = await cloned.text();
  } catch {
    body = null;
  }

  const ip =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";

  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    // Redact the auth token value but keep the key
    if (key.toLowerCase() === "x-pinchbench-token") {
      headers[key] = "[REDACTED]";
    } else {
      headers[key] = value;
    }
  });

  // Fire-and-forget: don't block the response on the log write
  c.executionCtx.waitUntil(
    c.env.prod_pinchbench
      .prepare(
        `INSERT INTO raw_post_logs (method, path, headers, body, ip, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        c.req.method,
        new URL(c.req.url).pathname,
        JSON.stringify(headers),
        body,
        ip,
      )
      .run()
      .catch(() => {}), // Silently ignore logging failures
  );

  return next();
});

// Enable CORS for frontend access
app.use(
  "/api/*",
  cors({
    origin: [
      "https://pinchbench.com",
      "http://localhost:3000",
      "http://localhost:5173",
      "null",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "X-PinchBench-Token",
      "X-PinchBench-Version",
    ],
    maxAge: 86400,
  }),
);

app.get("/", (c) => {
  return c.json({
    name: "PinchBench API",
    version: "1.0.0",
    endpoints: {
      "POST /api/register": "Register a new API token",
      "POST /api/results": "Submit benchmark results",
      "GET /api/leaderboard":
        "Get aggregated leaderboard (supports ?version param)",
      "GET /api/submissions": "List submissions with filters",
      "GET /api/submissions/:id": "Get submission details",
      "GET /api/models": "List all models",
      "GET /api/providers": "List all providers",
      "GET /api/providers/:provider/models":
        "List models for a provider with stats",
      "GET /api/me/submissions": "Get your submissions (requires auth)",
      "GET /api/stats": "Get aggregate statistics",
      "GET /api/benchmark_versions": "List all benchmark versions",
      "GET /api/benchmark_versions/latest": "Get the current benchmark version",
    },
  });
});

registerResultsRoutes(app);
registerRegisterRoutes(app);
registerLeaderboardRoutes(app);
registerSubmissionRoutes(app);
registerBenchmarkVersionRoutes(app);
registerProvidersRoutes(app);

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: { prod_pinchbench: import("@cloudflare/workers-types").D1Database },
    ctx: ExecutionContext,
  ) {
    // Delete raw POST logs older than 30 days
    ctx.waitUntil(
      env.prod_pinchbench
        .prepare(
          "DELETE FROM raw_post_logs WHERE created_at < datetime('now', '-30 days')",
        )
        .run(),
    );
  },
};
