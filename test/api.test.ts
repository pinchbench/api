import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { registerResultsRoutes } from '../src/routes/results';
import { registerLeaderboardRoutes } from '../src/routes/leaderboard';
import { registerSubmissionRoutes } from '../src/routes/submissions';
import type { Bindings } from '../src/types';
import Database from 'better-sqlite3';
import { MockD1Database } from './mock-db';
import { initDbFromSchema } from './schema-loader';

describe('API Integration Tests', () => {
  let mockDb: Database.Database;
  let app: Hono<{ Bindings: Bindings }>;
  let testTokenId: string;
  let testToken: string;

  beforeAll(() => {
    mockDb = new Database(':memory:');
    initDbFromSchema(mockDb);
  });

  afterAll(() => {
    mockDb.close();
  });

  beforeEach(() => {
    // Clear all tables
    mockDb.exec('DELETE FROM submissions');
    mockDb.exec('DELETE FROM submission_rate_limits');
    mockDb.exec('DELETE FROM tokens');

    // Create test token
    testTokenId = 'test-token-' + Math.random().toString(36).substr(2, 9);
    testToken = 'pb_live_test123456789';

    mockDb.exec(`
      INSERT INTO tokens (id, token_hash, created_at)
      VALUES ('${testTokenId}', 'f83aa57c39e47e49b0bb136a45da39a1fe082b2fdee6821c03dbb56d74546f74', datetime('now'))
    `);

    // Create fresh app instance
    app = new Hono<{ Bindings: Bindings }>();

    // Mock environment
    const mockEnv = {
      prod_pinchbench: new MockD1Database(mockDb),
    };

    // Register routes
    registerResultsRoutes(app);
    registerLeaderboardRoutes(app);
    registerSubmissionRoutes(app);

    // Override app for testing
    (globalThis as any).testApp = app;
    (globalThis as any).testEnv = mockEnv;
  });

  describe('POST /api/results - Rate Limiting', () => {
    it('should accept submissions within rate limit', async () => {
      const payload = {
        submission_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const req = new Request('http://localhost/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PinchBench-Token': testToken,
          'CF-Connecting-IP': '192.168.1.100'
        },
        body: JSON.stringify(payload)
      });

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(201);
      expect(result.status).toBe('accepted');
    });

    it('should reject submissions over rate limit', async () => {
      // Add 50 submissions to hit the limit
      for (let i = 0; i < 50; i++) {
        mockDb.exec(`
          INSERT INTO submission_rate_limits (token_id, ip, created_at)
          VALUES ('${testTokenId}', '192.168.1.100', datetime('now', '-1 hour'))
        `);
      }

      const payload = {
        submission_id: '660e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const req = new Request('http://localhost/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PinchBench-Token': testToken,
          'CF-Connecting-IP': '192.168.1.100'
        },
        body: JSON.stringify(payload)
      });

      // Mock the token lookup
      const originalPrepare = mockDb.prepare;
      (mockDb as any).prepare = (query: string) => {
        if (query.includes('SELECT id FROM tokens WHERE token_hash')) {
          return {
            get: () => ({ id: testTokenId })
          };
        }
        return originalPrepare.call(mockDb, query);
      };

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(429);
      expect(result.error).toBe('rate_limited');
      expect(result.message).toContain('Too many submissions');
    });

    it('should flag suspicious submissions', async () => {
      const payload = {
        submission_id: '550e8400-e29b-41d4-a716-446655440001',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 0.001, // Suspicious timing
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const req = new Request('http://localhost/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PinchBench-Token': testToken,
          'CF-Connecting-IP': '192.168.1.100'
        },
        body: JSON.stringify(payload)
      });

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(422);
      expect(result.error).toBe('validation_failed');
      expect(result.details[0]).toContain('impossibly low');
    });
  });

  describe('GET /api/leaderboard - Filtering', () => {
    beforeEach(() => {
      // Insert test submissions - one normal, one flagged
      mockDb.exec(`
        INSERT INTO submissions (
          id, token_id, model, total_score, max_score, score_percentage,
          tasks, is_flagged, flag_reason, timestamp, created_at
        ) VALUES
        ('normal-sub', '${testTokenId}', 'model-a', 90, 100, 90,
         '[{"task_id":"t1","score":90,"max_score":100}]', 0, NULL,
         '2026-04-09T10:00:00Z', datetime('now')),
        ('flagged-sub', '${testTokenId}', 'model-b', 95, 100, 95,
         '[{"task_id":"t1","score":95,"max_score":100}]', 1, 'Suspicious timing',
         '2026-04-09T10:00:00Z', datetime('now'))
      `);
    });

    it('should exclude flagged results by default', async () => {
      const req = new Request('http://localhost/api/leaderboard');

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(200);
      expect(result.leaderboard).toHaveLength(1);
      expect(result.leaderboard[0].model).toBe('model-a');
    });

    it('should include flagged results when requested', async () => {
      const req = new Request('http://localhost/api/leaderboard?include_flagged=true');

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(200);
      expect(result.leaderboard).toHaveLength(2);
      const models = result.leaderboard.map((l: any) => l.model).sort();
      expect(models).toEqual(['model-a', 'model-b']);
    });
  });

  describe('GET /api/submissions - Filtering', () => {
    beforeEach(async () => {
      // Insert test submissions
      await mockDb.exec(`
        INSERT INTO submissions (
          id, token_id, model, total_score, max_score, score_percentage,
          tasks, is_flagged, flag_reason, timestamp, created_at
        ) VALUES
        ('normal-sub', '${testTokenId}', 'model-a', 90, 100, 90,
         '[{"task_id":"t1","score":90,"max_score":100}]', 0, NULL,
         '2026-04-09T10:00:00Z', datetime('now')),
        ('flagged-sub', '${testTokenId}', 'model-b', 95, 100, 95,
         '[{"task_id":"t1","score":95,"max_score":100}]', 1, 'Suspicious timing',
         '2026-04-09T10:00:00Z', datetime('now'))
      `);
    });

    it('should exclude flagged results by default', async () => {
      const req = new Request('http://localhost/api/submissions');

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(200);
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].id).toBe('normal-sub');
    });

    it('should include flagged results when requested', async () => {
      const req = new Request('http://localhost/api/submissions?include_flagged=true');

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(200);
      expect(result.submissions).toHaveLength(2);
      const ids = result.submissions.map((s: any) => s.id).sort();
      expect(ids).toEqual(['flagged-sub', 'normal-sub']);
    });

    it('should show flagging status in individual submission details', async () => {
      const req = new Request('http://localhost/api/submissions/flagged-sub');

      const res = await app.fetch(req, (globalThis as any).testEnv);
      const result = await res.json() as any;

      expect(res.status).toBe(200);
      expect(result.submission.is_flagged).toBe(1);
      expect(result.submission.flag_reason).toBe('Suspicious timing');
    });
  });
});