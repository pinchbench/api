import { describe, it, expect } from "vitest";
import { normalizeModelName } from "../../src/utils/models";

describe("normalizeModelName", () => {
	it("strips 'openrouter/' prefix", () => {
		expect(normalizeModelName("openrouter/anthropic/claude-sonnet-4")).toBe(
			"anthropic/claude-sonnet-4",
		);
	});

	it("strips ':free' suffix", () => {
		expect(
			normalizeModelName("nvidia/nemotron-3-super-120b-a12b:free"),
		).toBe("nvidia/nemotron-3-super-120b-a12b");
	});

	it("strips both 'openrouter/' prefix and ':free' suffix", () => {
		expect(normalizeModelName("openrouter/google/gemini-2.5-pro:free")).toBe(
			"google/gemini-2.5-pro",
		);
	});

	it("returns empty string unchanged", () => {
		expect(normalizeModelName("")).toBe("");
	});

	it("leaves already-normalized names unchanged", () => {
		expect(normalizeModelName("anthropic/claude-sonnet-4")).toBe(
			"anthropic/claude-sonnet-4",
		);
		expect(normalizeModelName("openai/gpt-4o")).toBe("openai/gpt-4o");
	});

	it("does not strip partial matches of prefix or suffix", () => {
		expect(normalizeModelName("openrouter-alt/model")).toBe(
			"openrouter-alt/model",
		);
		expect(normalizeModelName("model:freedom")).toBe("model:freedom");
	});
});
