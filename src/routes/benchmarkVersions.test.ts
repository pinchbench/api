import { describe, test, expect } from "vitest";
import { parseSemver, isValidSemver, compareSemver } from "./benchmarkVersions";

describe("parseSemver", () => {
  test("parses basic version", () => {
    expect(parseSemver("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: null,
    });
  });

  test("parses version with numeric prerelease", () => {
    expect(parseSemver("1.2.3-dev.13")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ["dev", 13],
      build: null,
    });
  });

  test("parses version with alphanumeric prerelease", () => {
    expect(parseSemver("1.0.0-alpha.beta.1")).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ["alpha", "beta", 1],
      build: null,
    });
  });

  test("parses version with build metadata only", () => {
    expect(parseSemver("1.2.3+gabc1234")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: "gabc1234",
    });
  });

  test("parses version with prerelease and build metadata", () => {
    expect(parseSemver("1.2.2-dev.13+gabc1234")).toEqual({
      major: 1,
      minor: 2,
      patch: 2,
      prerelease: ["dev", 13],
      build: "gabc1234",
    });
  });

  test("parses version with complex build metadata", () => {
    expect(parseSemver("1.0.0-rc.1+build.123.sha.abc")).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ["rc", 1],
      build: "build.123.sha.abc",
    });
  });

  test("rejects versions without all three components", () => {
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("1")).toBeNull();
  });

  test("rejects versions with v prefix", () => {
    expect(parseSemver("v1.2.3")).toBeNull();
  });

  test("rejects non-numeric version components", () => {
    expect(parseSemver("a.b.c")).toBeNull();
    expect(parseSemver("1.x.3")).toBeNull();
  });

  test("rejects completely invalid strings", () => {
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("")).toBeNull();
  });
});

describe("isValidSemver", () => {
  test("accepts valid basic versions", () => {
    expect(isValidSemver("1.0.0")).toBe(true);
    expect(isValidSemver("0.0.1")).toBe(true);
    expect(isValidSemver("123.456.789")).toBe(true);
  });

  test("accepts versions with prerelease", () => {
    expect(isValidSemver("1.2.3-alpha")).toBe(true);
    expect(isValidSemver("1.2.3-dev.13")).toBe(true);
    expect(isValidSemver("1.0.0-0.3.7")).toBe(true);
    expect(isValidSemver("1.0.0-x.7.z.92")).toBe(true);
  });

  test("accepts versions with build metadata", () => {
    expect(isValidSemver("1.2.3+build")).toBe(true);
    expect(isValidSemver("1.2.3+gabc1234")).toBe(true);
    expect(isValidSemver("1.0.0+20130313144700")).toBe(true);
  });

  test("accepts versions with prerelease and build metadata", () => {
    expect(isValidSemver("1.2.2-dev.13+gabc1234")).toBe(true);
    expect(isValidSemver("1.0.0-alpha+001")).toBe(true);
  });

  test("rejects invalid versions", () => {
    expect(isValidSemver("1.2")).toBe(false);
    expect(isValidSemver("v1.2.3")).toBe(false);
    expect(isValidSemver("not-valid")).toBe(false);
  });
});

describe("compareSemver", () => {
  describe("basic version ordering (descending)", () => {
    test("major version differences", () => {
      expect(compareSemver("1.0.0", "2.0.0")).toBeGreaterThan(0); // 2.0.0 > 1.0.0
      expect(compareSemver("2.0.0", "1.0.0")).toBeLessThan(0);
      expect(compareSemver("10.0.0", "2.0.0")).toBeLessThan(0);
    });

    test("minor version differences", () => {
      expect(compareSemver("1.1.0", "1.0.0")).toBeLessThan(0); // 1.1.0 > 1.0.0
      expect(compareSemver("1.0.0", "1.1.0")).toBeGreaterThan(0);
      expect(compareSemver("1.10.0", "1.2.0")).toBeLessThan(0);
    });

    test("patch version differences", () => {
      expect(compareSemver("1.0.1", "1.0.0")).toBeLessThan(0); // 1.0.1 > 1.0.0
      expect(compareSemver("1.0.0", "1.0.1")).toBeGreaterThan(0);
    });

    test("equal versions", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
      expect(compareSemver("2.5.10", "2.5.10")).toBe(0);
    });
  });

  describe("prerelease precedence", () => {
    test("prerelease is less than release", () => {
      // For descending sort: release should come first (be "less than" in sort)
      expect(compareSemver("1.2.2-dev.13", "1.2.2")).toBeGreaterThan(0); // 1.2.2 > 1.2.2-dev.13
      expect(compareSemver("1.2.2", "1.2.2-dev.13")).toBeLessThan(0);
      expect(compareSemver("1.0.0-alpha", "1.0.0")).toBeGreaterThan(0);
    });

    test("prerelease with higher patch is greater than lower release", () => {
      // 1.2.2-dev.13 > 1.2.1 (patch bump matters even for prereleases)
      expect(compareSemver("1.2.2-dev.13", "1.2.1")).toBeLessThan(0);
      expect(compareSemver("1.2.1", "1.2.2-dev.13")).toBeGreaterThan(0);
    });

    test("numeric prerelease identifiers sorted numerically", () => {
      // dev.13 > dev.1 (numeric comparison, not lexicographic)
      expect(compareSemver("1.0.0-dev.1", "1.0.0-dev.13")).toBeGreaterThan(0);
      expect(compareSemver("1.0.0-dev.13", "1.0.0-dev.1")).toBeLessThan(0);
      expect(compareSemver("1.0.0-dev.2", "1.0.0-dev.10")).toBeGreaterThan(0);
    });

    test("alphanumeric prerelease identifiers sorted lexicographically", () => {
      expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBeGreaterThan(0); // beta > alpha
      expect(compareSemver("1.0.0-beta", "1.0.0-alpha")).toBeLessThan(0);
    });

    test("numeric identifiers have lower precedence than alphanumeric", () => {
      // Per spec: numeric < alphanumeric
      expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBeGreaterThan(0); // alpha > 1
    });

    test("fewer prerelease identifiers = lower precedence", () => {
      // 1.0.0-alpha < 1.0.0-alpha.1
      expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBeGreaterThan(0);
    });
  });

  describe("build metadata handling", () => {
    test("build metadata is ignored in comparison", () => {
      expect(compareSemver("1.2.2+build1", "1.2.2+build2")).toBe(0);
      expect(compareSemver("1.2.2+abc", "1.2.2+xyz")).toBe(0);
      expect(compareSemver("1.2.2", "1.2.2+build")).toBe(0);
    });

    test("build metadata ignored with prerelease", () => {
      expect(compareSemver("1.2.2-dev.13+abc", "1.2.2-dev.13+xyz")).toBe(0);
      expect(compareSemver("1.2.2-dev.13+build", "1.2.2-dev.13")).toBe(0);
    });
  });

  describe("ahead-of-tag format (real-world cases)", () => {
    test("dev build vs release", () => {
      // Release should sort higher (come first in descending)
      expect(compareSemver("1.2.2-dev.13+gabc1234", "1.2.2")).toBeGreaterThan(0);
    });

    test("dev build vs previous release", () => {
      // 1.2.2-dev.13 > 1.2.1 (it's a prerelease of 1.2.2, which is > 1.2.1)
      expect(compareSemver("1.2.2-dev.13+gabc1234", "1.2.1")).toBeLessThan(0);
    });

    test("dev builds of same version", () => {
      // dev.13 > dev.1
      expect(
        compareSemver("1.2.2-dev.13+gabc1234", "1.2.2-dev.1+g1234567"),
      ).toBeLessThan(0);
    });

    test("sorting multiple versions correctly", () => {
      const versions = [
        "1.2.1",
        "1.2.2-dev.1+g1111111",
        "1.2.2-dev.13+gabc1234",
        "1.2.2",
        "1.3.0-alpha",
      ];
      const sorted = [...versions].sort(compareSemver);
      // Expected descending order:
      // 1.3.0-alpha (prerelease of 1.3.0, but 1.3.0 > 1.2.x)
      // 1.2.2 (release)
      // 1.2.2-dev.13 (prerelease, dev.13 > dev.1)
      // 1.2.2-dev.1 (prerelease)
      // 1.2.1 (older release)
      expect(sorted).toEqual([
        "1.3.0-alpha",
        "1.2.2",
        "1.2.2-dev.13+gabc1234",
        "1.2.2-dev.1+g1111111",
        "1.2.1",
      ]);
    });
  });

  describe("invalid version handling", () => {
    test("invalid versions sort to end", () => {
      expect(compareSemver("1.0.0", "invalid")).toBeLessThan(0);
      expect(compareSemver("invalid", "1.0.0")).toBeGreaterThan(0);
    });

    test("two invalid versions are equal", () => {
      expect(compareSemver("invalid", "also-invalid")).toBe(0);
    });
  });
});
