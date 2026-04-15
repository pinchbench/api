/**
 * Route metadata registry for dynamic API discovery, OpenAPI generation,
 * OPTIONS responses, and _meta enrichment.
 *
 * Each route file calls `registerRoute()` to declare its metadata.
 * The registry is then consumed by:
 *   - GET /          → dynamic root endpoint
 *   - GET /openapi.json → OpenAPI 3.1 spec
 *   - OPTIONS /api/* → per-route metadata
 *   - Middleware      → Link headers & _meta in responses
 */

export type RouteParam = {
  name: string;
  in: "query" | "path" | "header";
  description: string;
  required?: boolean;
  type: "string" | "number" | "integer" | "boolean";
  default?: string | number | boolean;
  enum?: (string | number)[];
  example?: string | number | boolean;
};

export type RouteResponseSchema = {
  description: string;
  /** JSON Schema-style object describing the shape */
  schema?: Record<string, unknown>;
};

export type RouteMeta = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  auth?: "token" | "none";
  rateLimit?: string;
  params?: RouteParam[];
  requestBody?: {
    description: string;
    contentType?: string;
    schema?: Record<string, unknown>;
    required?: boolean;
  };
  responses?: Record<number, RouteResponseSchema>;
  /** Related endpoint paths for HATEOAS-style linking */
  relatedEndpoints?: string[];
  cacheTTL?: number;
};

const routes: RouteMeta[] = [];

export function registerRoute(meta: RouteMeta): void {
  routes.push(meta);
}

export function getRoutes(): readonly RouteMeta[] {
  return routes;
}

export function getRouteByMethodAndPath(
  method: string,
  path: string,
): RouteMeta | undefined {
  return routes.find(
    (r) => r.method === method.toUpperCase() && matchPath(r.path, path),
  );
}

export function getRoutesForPath(path: string): RouteMeta[] {
  return routes.filter((r) => matchPath(r.path, path));
}

/**
 * Match a registered path pattern (e.g. "/api/submissions/:id")
 * against a concrete request path (e.g. "/api/submissions/abc-123").
 */
function matchPath(pattern: string, concrete: string): boolean {
  const patternParts = pattern.split("/");
  const concreteParts = concrete.split("/");
  if (patternParts.length !== concreteParts.length) return false;
  return patternParts.every(
    (part, i) => part.startsWith(":") || part === concreteParts[i],
  );
}

/**
 * Generate an OpenAPI 3.1 document from the registry.
 */
export function generateOpenAPISpec(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    // Convert :param to {param} for OpenAPI
    const openApiPath = route.path.replace(/:(\w+)/g, "{$1}");

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    const method = route.method.toLowerCase();

    const parameters: Record<string, unknown>[] = [];
    if (route.params) {
      for (const param of route.params) {
        const p: Record<string, unknown> = {
          name: param.name,
          in: param.in,
          description: param.description,
          required: param.required ?? (param.in === "path" ? true : false),
          schema: {
            type: param.type,
            ...(param.default !== undefined ? { default: param.default } : {}),
            ...(param.enum ? { enum: param.enum } : {}),
            ...(param.example !== undefined ? { example: param.example } : {}),
          },
        };
        parameters.push(p);
      }
    }

    const operation: Record<string, unknown> = {
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      ...(route.tags ? { tags: route.tags } : {}),
      operationId: generateOperationId(route.method, route.path),
      parameters: parameters.length > 0 ? parameters : undefined,
      responses: buildResponses(route),
    };

    if (route.auth === "token") {
      operation.security = [{ apiToken: [] }];
    }

    if (route.rateLimit) {
      if (!operation.description) {
        operation.description = `Rate limit: ${route.rateLimit}`;
      } else {
        operation.description += `\n\nRate limit: ${route.rateLimit}`;
      }
    }

    if (route.requestBody) {
      operation.requestBody = {
        description: route.requestBody.description,
        required: route.requestBody.required ?? true,
        content: {
          [route.requestBody.contentType ?? "application/json"]: {
            schema: route.requestBody.schema ?? { type: "object" },
          },
        },
      };
    }

    paths[openApiPath][method] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "PinchBench API",
      version: "1.0.0",
      description:
        "Benchmarking leaderboard API for AI/LLM models. Submit benchmark results, view leaderboards, and compare model performance across providers.",
      contact: {
        name: "PinchBench",
        url: "https://pinchbench.com",
      },
    },
    servers: [{ url: baseUrl, description: "Current server" }],
    paths,
    components: {
      securitySchemes: {
        apiToken: {
          type: "apiKey",
          in: "header",
          name: "X-PinchBench-Token",
          description:
            "API token obtained via POST /api/register. Prefix: pb_live_",
        },
      },
    },
  };
}

function generateOperationId(method: string, path: string): string {
  // /api/submissions/:id → getSubmissionsById
  const parts = path
    .replace(/^\/api\//, "")
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        return "By" + capitalize(segment.slice(1));
      }
      return capitalize(segment.replace(/_(\w)/g, (_, c) => c.toUpperCase()));
    });
  return method.toLowerCase() + parts.join("");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildResponses(
  route: RouteMeta,
): Record<string, Record<string, unknown>> {
  const responses: Record<string, Record<string, unknown>> = {};

  if (route.responses) {
    for (const [status, def] of Object.entries(route.responses)) {
      responses[String(status)] = {
        description: def.description,
        ...(def.schema
          ? {
              content: {
                "application/json": { schema: def.schema },
              },
            }
          : {}),
      };
    }
  }

  // Always include a default 200 if not specified
  if (!responses["200"] && !responses["201"]) {
    responses["200"] = {
      description: "Successful response",
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    };
  }

  return responses;
}

/**
 * Generate a markdown description of all routes for content negotiation.
 */
export function generateMarkdownDocs(): string {
  const lines: string[] = [
    "# PinchBench API",
    "",
    "Benchmarking leaderboard API for AI/LLM models.",
    "",
    "## Authentication",
    "",
    "Endpoints marked with [Auth] require an `X-PinchBench-Token` header.",
    "Obtain a token via `POST /api/register`.",
    "",
    "## Endpoints",
    "",
  ];

  const grouped = new Map<string, RouteMeta[]>();
  for (const route of routes) {
    const tag = route.tags?.[0] ?? "General";
    if (!grouped.has(tag)) grouped.set(tag, []);
    grouped.get(tag)!.push(route);
  }

  for (const [tag, tagRoutes] of grouped) {
    lines.push(`### ${tag}`, "");
    for (const route of tagRoutes) {
      const authBadge = route.auth === "token" ? " [Auth]" : "";
      lines.push(`#### \`${route.method} ${route.path}\`${authBadge}`, "");
      lines.push(route.summary);
      if (route.description) {
        lines.push("", route.description);
      }
      if (route.params && route.params.length > 0) {
        lines.push("", "**Parameters:**", "");
        lines.push("| Name | In | Type | Required | Description |");
        lines.push("|------|----|------|----------|-------------|");
        for (const p of route.params) {
          const req = p.required ?? (p.in === "path") ? "Yes" : "No";
          const def = p.default !== undefined ? ` (default: ${p.default})` : "";
          lines.push(
            `| ${p.name} | ${p.in} | ${p.type} | ${req} | ${p.description}${def} |`,
          );
        }
      }
      if (route.rateLimit) {
        lines.push("", `**Rate limit:** ${route.rateLimit}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
