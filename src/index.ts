import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { registerResultsRoutes } from "./routes/results";
import { registerRegisterRoutes } from "./routes/register";
import { registerLeaderboardRoutes } from "./routes/leaderboard";
import { registerSubmissionRoutes } from "./routes/submissions";
import { registerBenchmarkVersionRoutes } from "./routes/benchmarkVersions";
import { registerProvidersRoutes } from "./routes/providers";
import { registerClaimRoutes } from "./routes/claim";
import { registerUserRoutes } from "./routes/users";
import { admin } from "./routes/admin";
import {
  getRoutes,
  getRoutesForPath,
  getRouteByMethodAndPath,
  generateOpenAPISpec,
  generateMarkdownDocs,
} from "./utils/routeRegistry";

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
    headers[key] = value;
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
    origin: (origin) => {
      // Allow known production and local origins
      const allowedOrigins = [
        "https://pinchbench.com",
        "http://localhost:3000",
        "http://localhost:5173",
      ];
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      // Allow Vercel preview deployments (*.vercel.app)
      if (origin && origin.endsWith(".vercel.app")) {
        return origin;
      }
      // Allow null origin (for file:// or sandboxed iframes)
      if (origin === "null") {
        return "null";
      }
      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "X-PinchBench-Token",
      "X-PinchBench-Version",
    ],
    maxAge: 86400,
  }),
);

// --- Dynamic root endpoint with content negotiation ---
app.get("/", (c) => {
  const accept = c.req.header("Accept") ?? "application/json";
  const baseUrl = new URL(c.req.url).origin;

  // Content negotiation: markdown for text clients, JSON for agents/default
  if (
    accept.includes("text/markdown") ||
    accept.includes("text/plain")
  ) {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(generateMarkdownDocs());
  }

  // Default: JSON response built dynamically from route registry
  const routes = getRoutes();
  const endpoints = routes.map((r) => ({
    method: r.method,
    path: r.path,
    summary: r.summary,
    description: r.description ?? null,
    tags: r.tags ?? [],
    auth: r.auth ?? "none",
    params: (r.params ?? []).map((p) => ({
      name: p.name,
      in: p.in,
      type: p.type,
      required: p.required ?? (p.in === "path"),
      description: p.description,
      ...(p.default !== undefined ? { default: p.default } : {}),
      ...(p.enum ? { enum: p.enum } : {}),
    })),
  }));

  c.header("Link", `<${baseUrl}/openapi.json>; rel="service-desc"; type="application/openapi+json"`);

  return c.json({
    name: "PinchBench API",
    version: "1.0.0",
    description:
      "Benchmarking leaderboard API for AI/LLM models. Submit benchmark results, view leaderboards, and compare model performance across providers.",
    openapi_spec: `${baseUrl}/openapi.json`,
    documentation: "https://pinchbench.com",
    endpoints,
    _meta: {
      total_endpoints: endpoints.length,
      generated_at: new Date().toISOString(),
      content_types: ["application/json", "text/markdown"],
    },
  });
});

// --- OpenAPI 3.1 spec endpoint ---
app.get("/openapi.json", (c) => {
  const baseUrl = new URL(c.req.url).origin;
  c.header("Cache-Control", "public, max-age=300, s-maxage=300");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(generateOpenAPISpec(baseUrl));
});

// --- OPTIONS handler for per-route metadata discovery ---
app.on("OPTIONS", "/api/*", (c) => {
  const path = new URL(c.req.url).pathname;
  const matchedRoutes = getRoutesForPath(path);

  if (matchedRoutes.length === 0) {
    // Fall through to CORS preflight handling
    c.header("Allow", "OPTIONS");
    return c.body(null, 204);
  }

  const methods = matchedRoutes.map((r) => r.method);
  methods.push("OPTIONS");
  c.header("Allow", [...new Set(methods)].join(", "));
  c.header("Access-Control-Allow-Origin", "*");
  c.header(
    "Access-Control-Allow-Methods",
    [...new Set(methods)].join(", "),
  );
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, X-PinchBench-Token, X-PinchBench-Version",
  );

  return c.json({
    path,
    methods: matchedRoutes.map((r) => ({
      method: r.method,
      summary: r.summary,
      description: r.description ?? null,
      auth: r.auth ?? "none",
      rateLimit: r.rateLimit ?? null,
      params: r.params ?? [],
      requestBody: r.requestBody ?? null,
      responses: r.responses ?? {},
      relatedEndpoints: r.relatedEndpoints ?? [],
    })),
    _meta: {
      hint: "Use GET /openapi.json for the full OpenAPI 3.1 specification.",
    },
  });
});

// --- Link header & _meta enrichment middleware ---
// Adds Link headers pointing to the OpenAPI spec and related endpoints
// for all JSON API responses.
app.use("/api/*", async (c, next) => {
  await next();

  // Only enrich JSON responses
  const contentType = c.res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) return;

  const baseUrl = new URL(c.req.url).origin;
  const path = new URL(c.req.url).pathname;

  // Add Link header to OpenAPI spec
  const links: string[] = [
    `<${baseUrl}/openapi.json>; rel="service-desc"; type="application/openapi+json"`,
  ];

  // Find the route metadata for related endpoint links
  const routeMeta = getRouteByMethodAndPath(c.req.method, path);
  if (routeMeta?.relatedEndpoints) {
    for (const related of routeMeta.relatedEndpoints) {
      links.push(`<${baseUrl}${related}>; rel="related"`);
    }
  }

  c.res.headers.set("Link", links.join(", "));
});

registerResultsRoutes(app);
registerRegisterRoutes(app);
registerLeaderboardRoutes(app);
registerSubmissionRoutes(app);
registerBenchmarkVersionRoutes(app);
registerProvidersRoutes(app);
registerClaimRoutes(app);
registerUserRoutes(app);

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
