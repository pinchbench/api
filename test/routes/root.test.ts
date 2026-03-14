import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("GET /", () => {
  it("returns API info", async () => {
    const response = await SELF.fetch("https://example.com/");

    expect(response.status).toBe(200);
    const body = await response.json<{
      name: string;
      version: string;
      endpoints: Record<string, string>;
    }>();
    expect(body.name).toBe("PinchBench API");
    expect(body.version).toBe("1.0.0");
    expect(body.endpoints).toBeDefined();
    expect(typeof body.endpoints).toBe("object");
  });
});
