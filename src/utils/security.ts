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

export const checkSubmissionLimit = async (
  db: D1Database,
  tokenId: string,
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> => {
  const limit = 50;

  // Check limits by token and IP separately to prevent coordinated attacks
  const result = await db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM submission_rate_limits
    WHERE (token_id = ? OR ip = ?)
    AND created_at > datetime('now', '-24 hours')
  `,
    )
    .bind(tokenId, ip)
    .first<{ count: number }>();

  const count = result?.count ?? 0;
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
  };
};

export const recordSubmissionAttempt = async (
  db: D1Database,
  tokenId: string,
  ip: string,
) => {
  await db
    .prepare(
      "INSERT INTO submission_rate_limits (token_id, ip) VALUES (?, ?)",
    )
    .bind(tokenId, ip)
    .run();
};
