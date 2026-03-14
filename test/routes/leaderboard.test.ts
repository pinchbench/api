import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import {
	createTestToken,
	createTestSubmission,
	createTestBenchmarkVersion,
} from "../helpers";

const db = env.prod_pinchbench;

describe("GET /api/leaderboard", () => {
	it("returns empty leaderboard when no submissions exist", async () => {
		const res = await SELF.fetch("https://example.com/api/leaderboard");
		expect(res.status).toBe(200);
		const body = await res.json<any>();
		expect(body.leaderboard).toEqual([]);
		expect(body.total_models).toBe(0);
	});

	it("returns leaderboard entries for multiple models", async () => {
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			provider: "anthropic",
			score_percentage: 0.84,
		});
		await createTestSubmission(db, token.id, {
			model: "openai/gpt-4o",
			provider: "openai",
			score_percentage: 0.90,
		});

		const res = await SELF.fetch("https://example.com/api/leaderboard");
		expect(res.status).toBe(200);
		const body = await res.json<any>();

		expect(body.leaderboard).toHaveLength(2);
		for (const entry of body.leaderboard) {
			expect(entry).toHaveProperty("model");
			expect(entry).toHaveProperty("provider");
			expect(entry).toHaveProperty("best_score_percentage");
			expect(entry).toHaveProperty("submission_count");
			expect(entry).toHaveProperty("best_submission_id");
		}
		// Sorted by best_score_percentage desc
		expect(body.leaderboard[0].model).toBe("openai/gpt-4o");
		expect(body.leaderboard[1].model).toBe("anthropic/claude-sonnet-4");
	});

	it("groups submissions by model and picks the best score", async () => {
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			score_percentage: 0.70,
		});
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			score_percentage: 0.90,
		});
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			score_percentage: 0.80,
		});

		const res = await SELF.fetch("https://example.com/api/leaderboard");
		const body = await res.json<any>();

		expect(body.leaderboard).toHaveLength(1);
		expect(body.leaderboard[0].submission_count).toBe(3);
		expect(body.leaderboard[0].best_score_percentage).toBe(0.90);
	});

	it("respects the limit parameter", async () => {
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "model-a",
			score_percentage: 0.90,
		});
		await createTestSubmission(db, token.id, {
			model: "model-b",
			score_percentage: 0.80,
		});
		await createTestSubmission(db, token.id, {
			model: "model-c",
			score_percentage: 0.70,
		});

		const res = await SELF.fetch(
			"https://example.com/api/leaderboard?limit=2",
		);
		const body = await res.json<any>();

		expect(body.leaderboard).toHaveLength(2);
	});

	it("filters by provider", async () => {
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			provider: "anthropic",
		});
		await createTestSubmission(db, token.id, {
			model: "openai/gpt-4o",
			provider: "openai",
		});

		const res = await SELF.fetch(
			"https://example.com/api/leaderboard?provider=anthropic",
		);
		const body = await res.json<any>();

		expect(body.leaderboard).toHaveLength(1);
		expect(body.leaderboard[0].provider).toBe("anthropic");
	});

	it("filters by benchmark version", async () => {
		await createTestBenchmarkVersion(db, "2026.03.01", { current: 1 });
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "model-a",
			benchmark_version: "2026.03.01",
			score_percentage: 0.85,
		});
		await createTestSubmission(db, token.id, {
			model: "model-b",
			benchmark_version: "2025.01.01",
			score_percentage: 0.95,
		});

		const res = await SELF.fetch(
			"https://example.com/api/leaderboard?version=2026.03.01",
		);
		const body = await res.json<any>();

		expect(body.leaderboard).toHaveLength(1);
		expect(body.leaderboard[0].model).toBe("model-a");
		expect(body.benchmark_versions).toContain("2026.03.01");
	});

	it("filters by verified (claimed tokens only)", async () => {
		const claimedToken = await createTestToken(db, {
			claimed_at: new Date().toISOString(),
			github_username: "testuser",
			github_id: 12345,
		});
		const unclaimedToken = await createTestToken(db);
		await createTestSubmission(db, claimedToken.id, {
			model: "model-verified",
			score_percentage: 0.80,
		});
		await createTestSubmission(db, unclaimedToken.id, {
			model: "model-unverified",
			score_percentage: 0.90,
		});

		const res = await SELF.fetch(
			"https://example.com/api/leaderboard?verified=true",
		);
		const body = await res.json<any>();

		expect(body.verified_only).toBe(true);
		expect(body.leaderboard).toHaveLength(1);
		expect(body.leaderboard[0].model).toBe("model-verified");
	});

	it("filters by official submissions", async () => {
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "model-official",
			official: 1,
			score_percentage: 0.85,
		});
		await createTestSubmission(db, token.id, {
			model: "model-unofficial",
			official: 0,
			score_percentage: 0.95,
		});

		const res = await SELF.fetch(
			"https://example.com/api/leaderboard?official=true",
		);
		const body = await res.json<any>();

		expect(body.official_only).toBe(true);
		expect(body.leaderboard).toHaveLength(1);
		expect(body.leaderboard[0].model).toBe("model-official");
	});

	it("includes weights and hf_link metadata fields", async () => {
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			provider: "anthropic",
		});

		const res = await SELF.fetch("https://example.com/api/leaderboard");
		const body = await res.json<any>();

		expect(body.leaderboard).toHaveLength(1);
		expect(body.leaderboard[0]).toHaveProperty("weights");
		expect(body.leaderboard[0]).toHaveProperty("hf_link");
	});
});

describe("GET /api/models", () => {
	it("returns empty models list when no submissions exist", async () => {
		const res = await SELF.fetch("https://example.com/api/models");
		expect(res.status).toBe(200);
		const body = await res.json<any>();
		expect(body.models).toEqual([]);
	});

	it("returns models with submission counts and best scores", async () => {
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			provider: "anthropic",
			score_percentage: 0.80,
		});
		await createTestSubmission(db, token.id, {
			model: "anthropic/claude-sonnet-4",
			provider: "anthropic",
			score_percentage: 0.90,
		});
		await createTestSubmission(db, token.id, {
			model: "openai/gpt-4o",
			provider: "openai",
			score_percentage: 0.75,
		});

		const res = await SELF.fetch("https://example.com/api/models");
		const body = await res.json<any>();

		expect(body.models).toHaveLength(2);
		for (const model of body.models) {
			expect(model).toHaveProperty("model");
			expect(model).toHaveProperty("provider");
			expect(model).toHaveProperty("submission_count");
			expect(model).toHaveProperty("best_score");
		}

		const claude = body.models.find(
			(m: any) => m.model === "anthropic/claude-sonnet-4",
		);
		expect(claude.submission_count).toBe(2);
		expect(claude.best_score).toBe(0.90);
	});

	it("filters by benchmark version", async () => {
		await createTestBenchmarkVersion(db, "2026.03.01", { current: 1 });
		const token = await createTestToken(db);
		await createTestSubmission(db, token.id, {
			model: "model-a",
			provider: "provider-a",
			benchmark_version: "2026.03.01",
		});
		await createTestSubmission(db, token.id, {
			model: "model-b",
			provider: "provider-b",
			benchmark_version: "2025.01.01",
		});

		const res = await SELF.fetch(
			"https://example.com/api/models?version=2026.03.01",
		);
		const body = await res.json<any>();

		expect(body.models).toHaveLength(1);
		expect(body.models[0].model).toBe("model-a");
		expect(body.benchmark_versions).toContain("2026.03.01");
	});
});

describe("GET /api/stats", () => {
	it("returns zeroed stats when no submissions exist", async () => {
		const res = await SELF.fetch("https://example.com/api/stats");
		expect(res.status).toBe(200);
		const body = await res.json<any>();

		expect(body.total_submissions).toBe(0);
		expect(body.total_models).toBe(0);
		expect(body.verified_submissions).toBe(0);
		expect(body.submissions_last_24h).toBe(0);
		expect(body.top_model).toBeNull();
	});

	it("returns correct stats with populated data", async () => {
		const claimedToken = await createTestToken(db, {
			claimed_at: new Date().toISOString(),
			github_username: "testuser",
			github_id: 12345,
		});
		const unclaimedToken = await createTestToken(db);

		await createTestSubmission(db, claimedToken.id, {
			model: "anthropic/claude-sonnet-4",
			score_percentage: 0.90,
		});
		await createTestSubmission(db, claimedToken.id, {
			model: "anthropic/claude-sonnet-4",
			score_percentage: 0.80,
		});
		await createTestSubmission(db, unclaimedToken.id, {
			model: "openai/gpt-4o",
			score_percentage: 0.70,
		});

		const res = await SELF.fetch("https://example.com/api/stats");
		const body = await res.json<any>();

		expect(body.total_submissions).toBe(3);
		expect(body.total_models).toBe(2);
		expect(body.verified_submissions).toBe(2);
		expect(body.top_model).not.toBeNull();
		expect(body.top_model.model).toBe("anthropic/claude-sonnet-4");
		expect(body.top_model.best_score).toBe(0.90);
	});

	it("includes generated_at as an ISO string", async () => {
		const res = await SELF.fetch("https://example.com/api/stats");
		const body = await res.json<any>();

		expect(body).toHaveProperty("generated_at");
		expect(typeof body.generated_at).toBe("string");
		// Verify it parses as a valid date
		const date = new Date(body.generated_at);
		expect(date.getTime()).not.toBeNaN();
	});
});
