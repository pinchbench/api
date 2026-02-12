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
  total_score: number;
  max_score: number;
  tasks: SubmissionTask[];
  usage_summary?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
