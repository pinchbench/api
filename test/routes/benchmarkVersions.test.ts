import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  createTestToken,
  createTestSubmission,
  createTestBenchmarkVersion,
} from "../helpers";

describe("GET /api/benchmark_versions", () => {
  it("returns empty list when no versions exist", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ versions: unknown[] }>();
    expect(body.versions).toEqual([]);
  });

  it("returns versions with expected fields", async () => {
    const db = env.prod_pinchbench;
    await createTestBenchmarkVersion(db, "v1.0.0", { current: 0 });
    await createTestBenchmarkVersion(db, "v2.0.0", { current: 1 });

    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      versions: Array<{
        id: string;
        created_at: string;
        is_current: boolean;
        submission_count: number;
      }>;
    }>();
    expect(body.versions).toHaveLength(2);

    for (const version of body.versions) {
      expect(version).toHaveProperty("id");
      expect(version).toHaveProperty("created_at");
      expect(version).toHaveProperty("is_current");
      expect(version).toHaveProperty("submission_count");
    }

    const ids = body.versions.map((v) => v.id);
    expect(ids).toContain("v1.0.0");
    expect(ids).toContain("v2.0.0");
  });

  it("excludes hidden versions", async () => {
    const db = env.prod_pinchbench;
    await createTestBenchmarkVersion(db, "v1.0.0", { hidden: 0 });
    await createTestBenchmarkVersion(db, "v2.0.0-hidden", { hidden: 1 });

    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      versions: Array<{ id: string }>;
    }>();
    const ids = body.versions.map((v) => v.id);
    expect(ids).toContain("v1.0.0");
    expect(ids).not.toContain("v2.0.0-hidden");
  });

  it("includes correct submission counts", async () => {
    const db = env.prod_pinchbench;
    await createTestBenchmarkVersion(db, "v1.0.0");
    const { id: tokenId } = await createTestToken(db);
    await createTestSubmission(db, tokenId, { benchmark_version: "v1.0.0" });
    await createTestSubmission(db, tokenId, { benchmark_version: "v1.0.0" });
    await createTestSubmission(db, tokenId, { benchmark_version: "v1.0.0" });

    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      versions: Array<{ id: string; submission_count: number }>;
    }>();
    const v1 = body.versions.find((v) => v.id === "v1.0.0");
    expect(v1).toBeDefined();
    expect(v1!.submission_count).toBe(3);
  });

  it("includes generated_at in response", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ generated_at: string }>();
    expect(body.generated_at).toBeDefined();
    expect(typeof body.generated_at).toBe("string");
  });
});

describe("GET /api/benchmark_versions/latest", () => {
  it("returns 404 when no current version exists", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions/latest",
    );

    expect(response.status).toBe(404);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("not_found");
  });

  it("returns the current version", async () => {
    const db = env.prod_pinchbench;
    await createTestBenchmarkVersion(db, "v1.0.0", { current: 1 });

    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions/latest",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      version: {
        id: string;
        is_current: boolean;
        submission_count: number;
      };
    }>();
    expect(body.version.id).toBe("v1.0.0");
    expect(body.version.is_current).toBe(true);
    expect(body.version.submission_count).toBe(0);
  });

  it("does not return a hidden current version", async () => {
    const db = env.prod_pinchbench;
    await createTestBenchmarkVersion(db, "v1.0.0", {
      current: 1,
      hidden: 1,
    });

    const response = await SELF.fetch(
      "https://example.com/api/benchmark_versions/latest",
    );

    expect(response.status).toBe(404);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("not_found");
  });
});
