import type { SubmissionPayload } from "../types";

export type HeuristicResult = {
  isValid: boolean;
  isFlagged: boolean;
  reason?: string;
};

/**
 * Validate submission timing.
 * If total execution time is impossibly low, reject it.
 * If it's suspiciously low, flag it.
 */
export const validateTiming = (payload: SubmissionPayload): HeuristicResult => {
  const { total_execution_time_seconds, tasks } = payload;
  if (total_execution_time_seconds === undefined) {
    return { isValid: true, isFlagged: false };
  }

  const taskCount = tasks.length;
  // Threshold: at least 0.01s per task is required to be "valid"
  // At least 0.5s per task to be "unflagged"
  if (total_execution_time_seconds < taskCount * 0.01) {
    return {
      isValid: false,
      isFlagged: true,
      reason: "Execution time impossibly low",
    };
  }

  if (total_execution_time_seconds < taskCount * 0.5) {
    return {
      isValid: true,
      isFlagged: true,
      reason: "Execution time suspiciously low",
    };
  }

  return { isValid: true, isFlagged: false };
};

/**
 * Validate cost consistency.
 * Check if cost is provided without tokens, or tokens without cost for paid providers.
 */
export const validateCost = (payload: SubmissionPayload): HeuristicResult => {
  const { total_cost_usd, total_tokens } = payload;

  if (total_cost_usd !== undefined && total_cost_usd > 0) {
    if (total_tokens === undefined || total_tokens === 0) {
      return {
        isValid: true,
        isFlagged: true,
        reason: "Cost provided but total_tokens is zero",
      };
    }
  }

  return { isValid: true, isFlagged: false };
};

/**
 * Run all heuristics.
 */
export const runHeuristics = (payload: SubmissionPayload): HeuristicResult => {
  const results = [validateTiming(payload), validateCost(payload)];
  
  let isFlagged = false;
  const reasons: string[] = [];

  for (const res of results) {
    if (!res.isValid) {
      return res; // Stop and reject immediately
    }
    if (res.isFlagged) {
      isFlagged = true;
      if (res.reason) reasons.push(res.reason);
    }
  }

  return {
    isValid: true,
    isFlagged,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };
};
