import { describe, expect, test } from "vitest";
import type { Bindings } from "../types";
import {
  getNextLegacyBenchmarkVersionLabel,
  isStrictBenchmarkSemver,
} from "./results";

const mockD1ForLegacyLabels = (
  results: Array<{ semver: string | null; label: string | null }> | undefined,
): Bindings["prod_pinchbench"] =>
  ({
    prepare: () => ({
      all: async () => ({ results }),
    }),
  }) as unknown as Bindings["prod_pinchbench"];

describe("isStrictBenchmarkSemver", () => {
  test("accepts versions with major, minor, and patch components", () => {
    expect(isStrictBenchmarkSemver("1.0.0")).toBe(true);
    expect(isStrictBenchmarkSemver("0.0.1")).toBe(true);
    expect(isStrictBenchmarkSemver("123.456.789")).toBe(true);
  });

  test("accepts prerelease and build metadata on strict three-component versions", () => {
    expect(isStrictBenchmarkSemver("1.0.0-beta.1")).toBe(true);
    expect(isStrictBenchmarkSemver("1.2.3-dev.13+gabc1234")).toBe(true);
    expect(isStrictBenchmarkSemver("1.2.3+build.123")).toBe(true);
    expect(isStrictBenchmarkSemver("1.2.3-rc.1+build.5")).toBe(true);
  });

  test("rejects legacy or non-strict benchmark labels", () => {
    expect(isStrictBenchmarkSemver("1.0")).toBe(false);
    expect(isStrictBenchmarkSemver("1")).toBe(false);
    expect(isStrictBenchmarkSemver("v1.0.0")).toBe(false);
    expect(isStrictBenchmarkSemver("not-a-version")).toBe(false);
  });

  test("rejects malformed prerelease or build suffixes", () => {
    expect(isStrictBenchmarkSemver("1.2.3-")).toBe(false);
    expect(isStrictBenchmarkSemver("1.2.3+")).toBe(false);
    expect(isStrictBenchmarkSemver("1.2.3-+build")).toBe(false);
    expect(isStrictBenchmarkSemver("1.2.3+build+extra")).toBe(false);
  });
});

describe("getNextLegacyBenchmarkVersionLabel", () => {
  test("allocates the first legacy beta label when no matching rows exist", async () => {
    await expect(
      getNextLegacyBenchmarkVersionLabel(mockD1ForLegacyLabels([])),
    ).resolves.toBe("1.0.0-beta.1");
  });

  test("allocates one greater than the highest legacy beta index from semver or label", async () => {
    await expect(
      getNextLegacyBenchmarkVersionLabel(
        mockD1ForLegacyLabels([
          { semver: "1.0.0-beta.2", label: null },
          { semver: null, label: "1.0.0-beta.7" },
          { semver: "1.0.0-beta.10", label: "1.0.0-beta.3" },
        ]),
      ),
    ).resolves.toBe("1.0.0-beta.11");
  });

  test("ignores malformed beta-like values returned by the query", async () => {
    await expect(
      getNextLegacyBenchmarkVersionLabel(
        mockD1ForLegacyLabels([
          { semver: "1.0.0-beta.x", label: "1.0.0-beta." },
          { semver: "1.0.0-beta.4-extra", label: null },
          { semver: null, label: "1.0.0-beta.5" },
        ]),
      ),
    ).resolves.toBe("1.0.0-beta.6");
  });

  test("treats a missing D1 results array as empty", async () => {
    await expect(
      getNextLegacyBenchmarkVersionLabel(mockD1ForLegacyLabels(undefined)),
    ).resolves.toBe("1.0.0-beta.1");
  });
});
