import { describe, it, expect } from "vitest";
import {
	randomHex,
	hashToken,
	ensureHttps,
	getAuthToken,
} from "../../src/utils/security";

describe("randomHex", () => {
	it("returns a string of the exact requested length", () => {
		expect(randomHex(16)).toHaveLength(16);
		expect(randomHex(32)).toHaveLength(32);
		expect(randomHex(1)).toHaveLength(1);
	});

	it("returns only hex characters", () => {
		const result = randomHex(64);
		expect(result).toMatch(/^[0-9a-f]+$/);
	});

	it("produces different values on successive calls", () => {
		const a = randomHex(32);
		const b = randomHex(32);
		expect(a).not.toBe(b);
	});
});

describe("hashToken", () => {
	it("returns a 64-character hex string (SHA-256)", async () => {
		const hash = await hashToken("test-token");
		expect(hash).toHaveLength(64);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("returns consistent results for the same input", async () => {
		const a = await hashToken("same-input");
		const b = await hashToken("same-input");
		expect(a).toBe(b);
	});

	it("returns different hashes for different inputs", async () => {
		const a = await hashToken("input-one");
		const b = await hashToken("input-two");
		expect(a).not.toBe(b);
	});
});

describe("ensureHttps", () => {
	it("returns true for https URLs", () => {
		expect(ensureHttps("https://example.com")).toBe(true);
		expect(ensureHttps("https://example.com/path?q=1")).toBe(true);
	});

	it("returns false for http URLs", () => {
		expect(ensureHttps("http://example.com")).toBe(false);
	});

	it("returns false for invalid URLs", () => {
		expect(ensureHttps("not-a-url")).toBe(false);
		expect(ensureHttps("")).toBe(false);
	});
});

describe("getAuthToken", () => {
	it("extracts the X-PinchBench-Token header value", () => {
		const ctx = { req: { header: (name: string) => name === "X-PinchBench-Token" ? "abc123" : undefined } };
		expect(getAuthToken(ctx)).toBe("abc123");
	});

	it("trims whitespace from the token", () => {
		const ctx = { req: { header: () => "  token-value  " } };
		expect(getAuthToken(ctx)).toBe("token-value");
	});

	it("returns undefined when header is missing", () => {
		const ctx = { req: { header: () => undefined } };
		expect(getAuthToken(ctx)).toBeUndefined();
	});
});
