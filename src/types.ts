import type { D1Database } from "@cloudflare/workers-types";

export type Bindings = {
  prod_pinchbench: D1Database;
};

export type SubmissionTask = {
  task_id: string;
  score: number;
  max_score: number;
  grading_type?: string;
  timed_out?: boolean;
  execution_time_seconds?: number;
  breakdown?: Record<string, number>;
  notes?: string;
};

export type SubmissionPayload = {
  submission_id: string;
  timestamp: string;
  client_version?: string;
  model: string;
  provider?: string;
  run_id?: string;
  openclaw_version?: string;
  benchmark_version?: string;
  total_score: number;
  max_score: number;
  tasks: SubmissionTask[];
  usage_summary?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type LeaderboardEntry = {
  model: string;
  provider: string | null;
  best_score_percentage: number;
  average_score_percentage: number;
  submission_count: number;
  latest_submission: string;
  best_submission_id: string;
};

export type SubmissionRow = {
  id: string;
  model: string;
  provider: string | null;
  score_percentage: number;
  total_score: number;
  max_score: number;
  timestamp: string;
  created_at: string;
  client_version: string | null;
  openclaw_version: string | null;
  run_id: string | null;
  benchmark_version: string | null;
  tasks: string;
  usage_summary: string | null;
  metadata: string | null;
  claimed: number;
};
