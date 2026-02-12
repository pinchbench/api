import { Hono } from "hono";
import type { Bindings } from "./types";
import { registerResultsRoutes } from "./routes/results";
import { registerRegisterRoutes } from "./routes/register";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

registerResultsRoutes(app);
registerRegisterRoutes(app);

export default app;
