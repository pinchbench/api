import { describe, it, expect } from "vitest";
import { appendBenchmarkVersionFilter } from "../../src/utils/query";

describe("appendBenchmarkVersionFilter", () => {
	it("returns empty string for empty versions array", () => {
		expect(appendBenchmarkVersionFilter("WHERE", "benchmark_version", [])).toBe(
			"",
		);
	});

	it("returns a single placeholder for one version", () => {
		expect(
			appendBenchmarkVersionFilter("WHERE", "benchmark_version", ["v1"]),
		).toBe(" WHERE benchmark_version IN (?)");
	});

	it("returns correct number of placeholders for multiple versions", () => {
		expect(
			appendBenchmarkVersionFilter("WHERE", "benchmark_version", [
				"v1",
				"v2",
				"v3",
			]),
		).toBe(" WHERE benchmark_version IN (?, ?, ?)");
	});

	it("works with AND clause prefix", () => {
		expect(
			appendBenchmarkVersionFilter("AND", "bv", ["v1", "v2"]),
		).toBe(" AND bv IN (?, ?)");
	});
});
