import { describe, it, expect } from 'vitest';
import { runHeuristics, validateTiming, validateCost } from '../src/utils/heuristics';
import type { SubmissionPayload } from '../src/types';

describe('Heuristics', () => {
  describe('validateTiming', () => {
    it('should pass valid timing', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 5.0, // 5 seconds for 1 task
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = validateTiming(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(false);
    });

    it('should reject impossibly low timing', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 0.001, // 1ms total
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = validateTiming(payload);
      expect(result.isValid).toBe(false);
      expect(result.isFlagged).toBe(true);
      expect(result.reason).toContain('impossibly low');
    });

    it('should flag suspiciously low timing', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 0.1, // 100ms for 1 task
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = validateTiming(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(true);
      expect(result.reason).toContain('suspiciously low');
    });

    it('should handle multiple tasks', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 200,
        max_score: 200,
        total_execution_time_seconds: 0.5, // 500ms total for 2 tasks = 250ms per task
        tasks: [
          { task_id: 'task1', score: 100, max_score: 100 },
          { task_id: 'task2', score: 100, max_score: 100 }
        ]
      };

      const result = validateTiming(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(true); // 250ms per task is suspiciously low
    });

    it('should pass when timing is not provided', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = validateTiming(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(false);
    });
  });

  describe('validateCost', () => {
    it('should pass when no cost is provided', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = validateCost(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(false);
    });

    it('should pass when cost and tokens are both provided', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_cost_usd: 0.5,
        total_tokens: 1000,
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = validateCost(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(false);
    });

    it('should flag when cost is provided but tokens is zero', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_cost_usd: 1.0,
        total_tokens: 0,
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = validateCost(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(true);
      expect(result.reason).toContain('total_tokens is zero');
    });
  });

  describe('runHeuristics', () => {
    it('should pass valid submissions', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 2.0,
        total_cost_usd: 0.1,
        total_tokens: 500,
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = runHeuristics(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(false);
    });

    it('should reject invalid submissions', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 0.001, // Invalid timing
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = runHeuristics(payload);
      expect(result.isValid).toBe(false);
      expect(result.isFlagged).toBe(true);
    });

    it('should flag suspicious submissions', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 0.1, // Suspicious timing
        total_cost_usd: 1.0,
        total_tokens: 0, // Suspicious cost
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = runHeuristics(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(true);
      expect(result.reason).toContain('suspiciously low');
      expect(result.reason).toContain('total_tokens is zero');
    });

    it('should combine multiple flag reasons', () => {
      const payload: SubmissionPayload = {
        submission_id: 'test',
        timestamp: '2026-04-09T10:00:00Z',
        model: 'test-model',
        total_score: 100,
        max_score: 100,
        total_execution_time_seconds: 0.05, // Suspicious timing
        total_cost_usd: 2.0,
        total_tokens: 0, // Suspicious cost
        tasks: [{ task_id: 'task1', score: 100, max_score: 100 }]
      };

      const result = runHeuristics(payload);
      expect(result.isValid).toBe(true);
      expect(result.isFlagged).toBe(true);
      expect(result.reason).toMatch(/suspiciously low.*total_tokens is zero|total_tokens is zero.*suspiciously low/);
    });
  });
});