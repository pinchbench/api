import type { D1Database } from "@cloudflare/workers-types";

const HEX_CHARS = "0123456789abcdef";

const bytesToHex = (bytes: Uint8Array): string => {
  let output = "";
  for (const byte of bytes) {
    output += HEX_CHARS[(byte >> 4) & 0x0f] + HEX_CHARS[byte & 0x0f];
  }
  return output;
};

export const randomHex = (length: number): string => {
  const bytesNeeded = Math.ceil(length / 2);
  const bytes = new Uint8Array(bytesNeeded);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes).slice(0, length);
};

export const hashToken = async (token: string): Promise<string> => {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
};

export const ensureHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

export const getAuthToken = (c: {
  req: { header: (name: string) => string | undefined };
}) => c.req.header("X-PinchBench-Token")?.trim();

export const getIp = (c: {
  req: { header: (name: string) => string | undefined };
}) => c.req.header("CF-Connecting-IP") || "127.0.0.1";

/**
 * Record a submission attempt and check if the limit is exceeded.
 * Uses atomic INSERT-then-COUNT to prevent race conditions:
 * 1. Insert the record first (atomically increments the count)
 * 2. Then check if we've exceeded the limit
 * This prevents two concurrent requests from both passing the check.
 */
export const recordSubmissionAttempt = async (
  db: D1Database,
  tokenId: string,
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> => {
  const limit = 50;

  // Step 1: Insert the record atomically
  await db
    .prepare(
      "INSERT INTO submission_rate_limits (token_id, ip) VALUES (?, ?)",
    )
    .bind(tokenId, ip)
    .run();

  // Step 2: Check token limit after insertion
  const tokenResult = await db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM submission_rate_limits
    WHERE token_id = ?
    AND created_at > datetime('now', '-24 hours')
  `,
    )
    .bind(tokenId)
    .first<{ count: number }>();

  // Step 3: Check IP limit after insertion
  const ipResult = await db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM submission_rate_limits
    WHERE ip = ?
    AND created_at > datetime('now', '-24 hours')
  `,
    )
    .bind(ip)
    .first<{ count: number }>();

  const tokenCount = tokenResult?.count ?? 0;
  const ipCount = ipResult?.count ?? 0;

  // Check if either limit is exceeded (note: this current request is already counted)
  // We allow up to limit (inclusive), so reject only if count > limit
  const allowed = tokenCount <= limit && ipCount <= limit;
  const remaining = Math.min(
    Math.max(0, limit - tokenCount),
    Math.max(0, limit - ipCount)
  );

  return { allowed, remaining };
};

/**
 * Pre-flight check for submission limits (optional optimization).
 * This is now deprecated in favor of checking after recordSubmissionAttempt.
 * Kept for backward compatibility but should not be used for the actual gate.
 */
export const checkSubmissionLimit = async (
  db: D1Database,
  tokenId: string,
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> => {
  const limit = 50;

  // Check token limit separately
  const tokenResult = await db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM submission_rate_limits
    WHERE token_id = ?
    AND created_at > datetime('now', '-24 hours')
  `,
    )
    .bind(tokenId)
    .first<{ count: number }>();

  // Check IP limit separately
  const ipResult = await db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM submission_rate_limits
    WHERE ip = ?
    AND created_at > datetime('now', '-24 hours')
  `,
    )
    .bind(ip)
    .first<{ count: number }>();

  const tokenCount = tokenResult?.count ?? 0;
  const ipCount = ipResult?.count ?? 0;

  // Check if either limit is exceeded
  const allowed = tokenCount < limit && ipCount < limit;
  const remaining = Math.min(
    Math.max(0, limit - tokenCount),
    Math.max(0, limit - ipCount)
  );

  return { allowed, remaining };
};
