import type { Context, Next } from "hono";
import type { Bindings, AdminVariables } from "../types";

/**
 * Cloudflare Access JWT validation middleware.
 *
 * Cloudflare Access adds the `CF-Access-JWT-Assertion` header to authenticated requests.
 * This middleware validates the JWT and extracts user identity.
 *
 * For development/testing, you can set CF_ACCESS_BYPASS=true to skip auth.
 */

interface JWTPayload {
  aud: string[];
  email: string;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  type: string;
  identity_nonce?: string;
  custom?: Record<string, unknown>;
}

interface JWK extends JsonWebKey {
  kid?: string;
}

interface JWKS {
  keys: JWK[];
}

// Cache for JWKS to avoid fetching on every request
let jwksCache: JWKS | null = null;
let jwksCacheTime = 0;
const JWKS_CACHE_DURATION = 600000; // 10 minutes

/**
 * Fetch and cache JWKS from Cloudflare Access
 */
async function getJWKS(teamDomain: string): Promise<JWKS> {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_CACHE_DURATION) {
    return jwksCache;
  }

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  jwksCache = (await response.json()) as JWKS;
  jwksCacheTime = now;
  return jwksCache;
}

/**
 * Decode a base64url string
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe characters
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad with = to make it valid base64
  while (str.length % 4) {
    str += "=";
  }
  return atob(str);
}

/**
 * Verify a Cloudflare Access JWT
 */
async function verifyAccessJWT(
  token: string,
  teamDomain: string,
  expectedAud: string,
): Promise<JWTPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64)) as {
    alg: string;
    kid: string;
  };
  const payload = JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;

  // Validate claims
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new Error("Token expired");
  }

  if (payload.iat && payload.iat > now + 60) {
    throw new Error("Token issued in the future");
  }

  // Validate audience
  if (!payload.aud || !payload.aud.includes(expectedAud)) {
    throw new Error("Invalid audience");
  }

  // Validate issuer
  const expectedIssuer = `https://${teamDomain}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error("Invalid issuer");
  }

  // Verify signature
  const jwks = await getJWKS(teamDomain);
  const key = jwks.keys.find((k) => k.kid === header.kid);

  if (!key) {
    throw new Error("Key not found in JWKS");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signatureBuffer = Uint8Array.from(base64UrlDecode(signatureB64), (c) =>
    c.charCodeAt(0),
  );
  const dataBuffer = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureBuffer,
    dataBuffer,
  );

  if (!valid) {
    throw new Error("Invalid signature");
  }

  return payload;
}

/**
 * Admin authentication middleware for Hono
 *
 * Usage:
 *   app.use("/admin/*", adminAuthMiddleware);
 */
export const adminAuthMiddleware = async (
  c: Context<{ Bindings: Bindings; Variables: AdminVariables }>,
  next: Next,
) => {
  // Skip auth in development if bypass is enabled
  if (c.env.CF_ACCESS_BYPASS === "true") {
    c.set("adminUser", { email: "dev@localhost", sub: "dev" });
    return next();
  }

  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
  const expectedAud = c.env.CF_ACCESS_AUD;

  if (!teamDomain || !expectedAud) {
    console.error("CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set");
    return c.json({ error: "Admin authentication not configured" }, 500);
  }

  const jwtToken = c.req.header("CF-Access-JWT-Assertion");

  if (!jwtToken) {
    return c.json({ error: "Unauthorized - No access token provided" }, 401);
  }

  try {
    const payload = await verifyAccessJWT(jwtToken, teamDomain, expectedAud);

    // Add user info to context for use in routes
    c.set("adminUser", {
      email: payload.email,
      sub: payload.sub,
    });

    return next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    return c.json({ error: "Unauthorized - Invalid access token" }, 401);
  }
};

/**
 * Get the authenticated admin user from context
 */
export function getAdminUser(
  c: Context<{ Bindings: Bindings; Variables: AdminVariables }>,
): { email: string; sub: string } | null {
  return c.get("adminUser") ?? null;
}
