import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { checkSubmissionLimit, recordSubmissionAttempt, hashToken, getIp } from '../src/utils/security';
import Database from 'better-sqlite3';
import { MockD1Database } from './mock-db';
import { initDbFromSchema } from './schema-loader';

describe('Security Utils', () => {
  let mockDb: MockD1Database;
  let rawDb: Database.Database;
  let testTokenId: string;
  let testIp: string;

  beforeAll(() => {
    rawDb = new Database(':memory:');
    initDbFromSchema(rawDb);
    mockDb = new MockD1Database(rawDb);
  });

  afterAll(() => {
    rawDb.close();
  });

  beforeEach(() => {
    // Clear rate limit table
    rawDb.exec('DELETE FROM submission_rate_limits');
    rawDb.exec('DELETE FROM tokens');

    // Create test token
    testTokenId = 'test-token-' + Math.random().toString(36).substr(2, 9);
    testIp = '192.168.1.100';

    rawDb.exec(`
      INSERT INTO tokens (id, token_hash, created_at)
      VALUES ('${testTokenId}', 'test-hash', datetime('now'))
    `);
  });

  describe('hashToken', () => {
    it('should hash tokens consistently', async () => {
      const token = 'test-token-123';
      const hash1 = await hashToken(token);
      const hash2 = await hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
    });

    it('should produce different hashes for different tokens', async () => {
      const hash1 = await hashToken('token1');
      const hash2 = await hashToken('token2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getIp', () => {
    it('should extract IP from CF-Connecting-IP header', () => {
      const mockReq = {
        req: {
          header: (name: string) => name === 'CF-Connecting-IP' ? '203.0.113.1' : undefined
        }
      };

      const ip = getIp(mockReq as any);
      expect(ip).toBe('203.0.113.1');
    });

    it('should fallback to 127.0.0.1 when no IP header', () => {
      const mockReq = {
        req: {
          header: () => undefined
        }
      };

      const ip = getIp(mockReq as any);
      expect(ip).toBe('127.0.0.1');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow submissions within limit', async () => {
      // Add 40 submissions (within 50 limit)
      for (let i = 0; i < 40; i++) {
        rawDb.exec(`
          INSERT INTO submission_rate_limits (token_id, ip, created_at)
          VALUES ('${testTokenId}', '${testIp}', datetime('now', '-1 hour'))
        `);
      }

      const result = await checkSubmissionLimit(mockDb as any, testTokenId, testIp);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it('should block submissions over limit', async () => {
      // Add 50 submissions (at limit)
      for (let i = 0; i < 50; i++) {
        rawDb.exec(`
          INSERT INTO submission_rate_limits (token_id, ip, created_at)
          VALUES ('${testTokenId}', '${testIp}', datetime('now', '-1 hour'))
        `);
      }

      const result = await checkSubmissionLimit(mockDb as any, testTokenId, testIp);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should allow submissions after 24 hours', async () => {
      // Add 50 submissions from 25 hours ago
      for (let i = 0; i < 50; i++) {
        rawDb.exec(`
          INSERT INTO submission_rate_limits (token_id, ip, created_at)
          VALUES ('${testTokenId}', '${testIp}', datetime('now', '-25 hours'))
        `);
      }

      const result = await checkSubmissionLimit(mockDb as any, testTokenId, testIp);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50);
    });

    it('should track submissions by both token and IP', async () => {
      // Create another token for testing
      const otherTokenId = 'other-token-' + Math.random().toString(36).substr(2, 9);
      rawDb.exec(`
        INSERT INTO tokens (id, token_hash, created_at)
        VALUES ('${otherTokenId}', 'other-hash', datetime('now'))
      `);

      // Add 25 submissions for token
      for (let i = 0; i < 25; i++) {
        rawDb.exec(`
          INSERT INTO submission_rate_limits (token_id, ip, created_at)
          VALUES ('${testTokenId}', 'other-ip', datetime('now', '-1 hour'))
        `);
      }

      // Add 25 submissions for IP
      for (let i = 0; i < 25; i++) {
        rawDb.exec(`
          INSERT INTO submission_rate_limits (token_id, ip, created_at)
          VALUES ('${otherTokenId}', '${testIp}', datetime('now', '-1 hour'))
        `);
      }

      const result = await checkSubmissionLimit(mockDb as any, testTokenId, testIp);
      expect(result.allowed).toBe(false); // 25 + 25 = 50, at limit
      expect(result.remaining).toBe(0);
    });

    it('should record submission attempts', async () => {
      const beforeCount = (rawDb.prepare('SELECT COUNT(*) as count FROM submission_rate_limits').get() as { count: number }).count;

      await recordSubmissionAttempt(mockDb as any, testTokenId, testIp);

      const afterCount = (rawDb.prepare('SELECT COUNT(*) as count FROM submission_rate_limits').get() as { count: number }).count;

      expect(afterCount).toBe(beforeCount + 1);
    });
  });
});