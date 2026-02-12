import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { registerResultsRoutes } from "./routes/results";
import { registerRegisterRoutes } from "./routes/register";
import { registerLeaderboardRoutes } from "./routes/leaderboard";

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend access
app.use(
  "/api/*",
  cors({
    origin: ["https://pinchbench.com", "http://localhost:3000", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-PinchBench-Token", "X-PinchBench-Version"],
    maxAge: 86400,
  })
);

app.get("/", (c) => {
  return c.json({
    name: "PinchBench API",
    version: "1.0.0",
    endpoints: {
      "POST /api/register": "Register a new API token",
      "POST /api/results": "Submit benchmark results",
      "GET /api/leaderboard": "Get aggregated leaderboard",
      "GET /api/submissions": "List submissions with filters",
      "GET /api/submissions/:id": "Get submission details",
      "GET /api/models": "List all models",
      "GET /api/me/submissions": "Get your submissions (requires auth)",
      "GET /api/stats": "Get aggregate statistics",
    },
  });
});

registerResultsRoutes(app);
registerRegisterRoutes(app);
registerLeaderboardRoutes(app);

export default app;
