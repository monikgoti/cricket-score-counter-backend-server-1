/**
 * Sign in with Apple helpers (iOS app). See the web app repo's
 * docs/apple-sign-in-api.md.
 *
 * - verifyAppleIdentityToken: checks the identity token the app received
 *   from Apple (signature against Apple's public keys, iss, aud, exp, nonce).
 * - exchangeAppleAuthorizationCode: swaps the one-time authorization code for
 *   an Apple refresh token, which we keep so we can revoke it later.
 * - revokeAppleToken: called on account deletion (App Store Guideline
 *   5.1.1(v) requires revoking Sign in with Apple tokens).
 *
 * No extra dependencies: keys are imported with Node's crypto (JWK) and
 * JWTs are verified / signed with jsonwebtoken.
 */
import { createHash, createPublicKey, type KeyObject } from "crypto";
import jwt from "jsonwebtoken";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const KEYS_CACHE_MS = 6 * 60 * 60 * 1000;

/** The iOS app's bundle ID; the `aud` of tokens issued to the native app. */
const DEFAULT_APPLE_CLIENT_ID = "com.cricketscorecounter.mobile";

export class AppleAuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 401, code = "INVALID_APPLE_TOKEN") {
    super(message);
    this.name = "AppleAuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Accepted audiences (APPLE_CLIENT_ID, comma-separated). The first one is
 *  used as client_id for Apple's token / revoke endpoints. */
const getAppleClientIds = (): string[] => {
  const ids = (process.env.APPLE_CLIENT_ID || DEFAULT_APPLE_CLIENT_ID)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : [DEFAULT_APPLE_CLIENT_ID];
};

// ---------------------------------------------------------------------------
// Apple public keys (JWKS), cached; refetched when an unknown kid shows up
// (Apple rotates keys).
// ---------------------------------------------------------------------------
type AppleJwk = { kid: string; kty: string; alg?: string; n: string; e: string };
let cachedKeys: { fetchedAt: number; keys: Map<string, KeyObject> } | null =
  null;

const fetchAppleKeys = async (): Promise<Map<string, KeyObject>> => {
  let response: globalThis.Response;
  try {
    response = await fetch(APPLE_KEYS_URL);
  } catch {
    throw new AppleAuthError("Unable to reach Apple to verify sign-in", 502, "APPLE_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new AppleAuthError("Unable to reach Apple to verify sign-in", 502, "APPLE_UNAVAILABLE");
  }
  const body = (await response.json().catch(() => ({}))) as { keys?: AppleJwk[] };
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    try {
      keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: "jwk" }));
    } catch {
      // Skip a key we can't import.
    }
  }
  cachedKeys = { fetchedAt: Date.now(), keys };
  return keys;
};

const getAppleKey = async (kid: string): Promise<KeyObject | null> => {
  const fresh = cachedKeys && Date.now() - cachedKeys.fetchedAt < KEYS_CACHE_MS;
  if (fresh && cachedKeys!.keys.has(kid)) return cachedKeys!.keys.get(kid)!;
  const keys = await fetchAppleKeys();
  return keys.get(kid) ?? null;
};

export type AppleIdentity = {
  /** Stable Apple user ID for this app's team. */
  sub: string;
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
};

const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const isTrue = (value: unknown) => value === true || value === "true";

/**
 * @param rawNonce the raw nonce from the app; the app gave Apple
 *   sha256hex(rawNonce), which Apple copies into the token's `nonce` claim.
 */
export const verifyAppleIdentityToken = async (
  identityToken: string,
  rawNonce: string,
): Promise<AppleIdentity> => {
  const decoded = jwt.decode(identityToken, { complete: true });
  const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
  if (!kid) throw new AppleAuthError("Invalid Apple token");

  const key = await getAppleKey(kid);
  if (!key) throw new AppleAuthError("Invalid Apple token");

  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(identityToken, key, {
      algorithms: ["RS256"],
      issuer: APPLE_ISSUER,
      audience: getAppleClientIds() as [string, ...string[]],
    });
    if (typeof verified === "string") throw new Error("Unexpected payload");
    payload = verified;
  } catch {
    throw new AppleAuthError("Invalid or expired Apple token");
  }

  if (!payload.sub) throw new AppleAuthError("Invalid Apple token");
  if (typeof payload.nonce !== "string" || payload.nonce !== sha256Hex(rawNonce)) {
    throw new AppleAuthError("Invalid Apple token");
  }

  const email =
    typeof payload.email === "string" && payload.email.trim()
      ? payload.email.trim().toLowerCase()
      : undefined;

  return {
    sub: String(payload.sub),
    email,
    emailVerified: isTrue(payload.email_verified),
    isPrivateEmail: isTrue(payload.is_private_email),
  };
};

// ---------------------------------------------------------------------------
// Client secret + token endpoints (need APPLE_TEAM_ID, APPLE_KEY_ID and
// APPLE_PRIVATE_KEY, the .p8 "Sign in with Apple" key).
// ---------------------------------------------------------------------------
export const isAppleTokenApiConfigured = (): boolean =>
  Boolean(
    process.env.APPLE_TEAM_ID?.trim() &&
      process.env.APPLE_KEY_ID?.trim() &&
      process.env.APPLE_PRIVATE_KEY?.trim(),
  );

const createClientSecret = (): string => {
  // Env vars often store the .p8 on one line with literal "\n".
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    keyid: process.env.APPLE_KEY_ID!.trim(),
    issuer: process.env.APPLE_TEAM_ID!.trim(),
    audience: APPLE_ISSUER,
    subject: getAppleClientIds()[0],
    expiresIn: "5m",
  });
};

const postAppleForm = (path: string, form: Record<string, string>) =>
  fetch(`${APPLE_ISSUER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });

/** Returns Apple's refresh token, or null if it couldn't be obtained (never
 *  throws: a failed exchange must not block an otherwise valid sign-in). */
export const exchangeAppleAuthorizationCode = async (
  authorizationCode: string,
): Promise<string | null> => {
  if (!isAppleTokenApiConfigured()) {
    console.warn(
      "Apple code exchange skipped: APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY not set",
    );
    return null;
  }
  try {
    const response = await postAppleForm("/auth/token", {
      client_id: getAppleClientIds()[0],
      client_secret: createClientSecret(),
      code: authorizationCode,
      grant_type: "authorization_code",
    });
    const data = (await response.json().catch(() => ({}))) as {
      refresh_token?: string;
      error?: string;
    };
    if (!response.ok || !data.refresh_token) {
      console.error("Apple code exchange failed", {
        status: response.status,
        error: data.error,
      });
      return null;
    }
    return data.refresh_token;
  } catch (error) {
    console.error("Apple code exchange error", {
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
};

/** Best effort: logs and returns false on failure, never throws. */
export const revokeAppleToken = async (refreshToken: string): Promise<boolean> => {
  if (!isAppleTokenApiConfigured()) {
    console.warn("Apple token revoke skipped: Apple key env vars not set");
    return false;
  }
  try {
    const response = await postAppleForm("/auth/revoke", {
      client_id: getAppleClientIds()[0],
      client_secret: createClientSecret(),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    if (!response.ok) {
      console.error("Apple token revoke failed", { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Apple token revoke error", {
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
};
