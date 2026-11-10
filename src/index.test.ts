import { describe, expect, test, vi } from "vitest";
import worker from "./index";
import type { Bindings } from "./types";

describe("API request logging", () => {
  test("does not persist credentials or request bodies from submissions", async () => {
    const queries: string[] = [];
    const boundValues: unknown[] = [];
    const db = {
      prepare(sql: string) {
        queries.push(sql);
        return {
          bind(...values: unknown[]) {
            boundValues.push(...values);
            return { first: async () => null };
          },
        };
      },
    } as unknown as Bindings["prod_pinchbench"];
    const waitUntil = vi.fn();
    const token = "pb_live_test_credential";
    const officialKey = "test_official_credential";
    const response = await worker.fetch(
      new Request("https://api.pinchbench.com/api/results", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PinchBench-Token": token,
          "X-PinchBench-Official-Key": officialKey,
        },
        body: JSON.stringify({ model: "test", password: "test_body_credential" }),
      }),
      { prod_pinchbench: db } as Bindings,
      { waitUntil } as unknown as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(queries).toEqual(["SELECT id FROM tokens WHERE token_hash = ? LIMIT 1"]);
    expect(boundValues).not.toContain(token);
    expect(boundValues).not.toContain(officialKey);
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
