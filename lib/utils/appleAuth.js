"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeAppleToken = exports.exchangeAppleAuthorizationCode = exports.isAppleTokenApiConfigured = exports.verifyAppleIdentityToken = exports.AppleAuthError = void 0;
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
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const KEYS_CACHE_MS = 6 * 60 * 60 * 1000;
/** The iOS app's bundle ID; the `aud` of tokens issued to the native app. */
const DEFAULT_APPLE_CLIENT_ID = "com.cricketscorecounter.mobile";
class AppleAuthError extends Error {
    constructor(message, statusCode = 401, code = "INVALID_APPLE_TOKEN") {
        super(message);
        this.name = "AppleAuthError";
        this.statusCode = statusCode;
        this.code = code;
    }
}
exports.AppleAuthError = AppleAuthError;
/** Accepted audiences (APPLE_CLIENT_ID, comma-separated). The first one is
 *  used as client_id for Apple's token / revoke endpoints. */
const getAppleClientIds = () => {
    const ids = (process.env.APPLE_CLIENT_ID || DEFAULT_APPLE_CLIENT_ID)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    return ids.length ? ids : [DEFAULT_APPLE_CLIENT_ID];
};
let cachedKeys = null;
const fetchAppleKeys = async () => {
    var _a;
    let response;
    try {
        response = await fetch(APPLE_KEYS_URL);
    }
    catch (_b) {
        throw new AppleAuthError("Unable to reach Apple to verify sign-in", 502, "APPLE_UNAVAILABLE");
    }
    if (!response.ok) {
        throw new AppleAuthError("Unable to reach Apple to verify sign-in", 502, "APPLE_UNAVAILABLE");
    }
    const body = (await response.json().catch(() => ({})));
    const keys = new Map();
    for (const jwk of (_a = body.keys) !== null && _a !== void 0 ? _a : []) {
        try {
            keys.set(jwk.kid, (0, crypto_1.createPublicKey)({ key: jwk, format: "jwk" }));
        }
        catch (_c) {
            // Skip a key we can't import.
        }
    }
    cachedKeys = { fetchedAt: Date.now(), keys };
    return keys;
};
const getAppleKey = async (kid) => {
    var _a;
    const fresh = cachedKeys && Date.now() - cachedKeys.fetchedAt < KEYS_CACHE_MS;
    if (fresh && cachedKeys.keys.has(kid))
        return cachedKeys.keys.get(kid);
    const keys = await fetchAppleKeys();
    return (_a = keys.get(kid)) !== null && _a !== void 0 ? _a : null;
};
const sha256Hex = (value) => (0, crypto_1.createHash)("sha256").update(value).digest("hex");
const isTrue = (value) => value === true || value === "true";
/**
 * @param rawNonce the raw nonce from the app; the app gave Apple
 *   sha256hex(rawNonce), which Apple copies into the token's `nonce` claim.
 */
const verifyAppleIdentityToken = async (identityToken, rawNonce) => {
    const decoded = jsonwebtoken_1.default.decode(identityToken, { complete: true });
    const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
    if (!kid)
        throw new AppleAuthError("Invalid Apple token");
    const key = await getAppleKey(kid);
    if (!key)
        throw new AppleAuthError("Invalid Apple token");
    let payload;
    try {
        const verified = jsonwebtoken_1.default.verify(identityToken, key, {
            algorithms: ["RS256"],
            issuer: APPLE_ISSUER,
            audience: getAppleClientIds(),
        });
        if (typeof verified === "string")
            throw new Error("Unexpected payload");
        payload = verified;
    }
    catch (_a) {
        throw new AppleAuthError("Invalid or expired Apple token");
    }
    if (!payload.sub)
        throw new AppleAuthError("Invalid Apple token");
    if (typeof payload.nonce !== "string" || payload.nonce !== sha256Hex(rawNonce)) {
        throw new AppleAuthError("Invalid Apple token");
    }
    const email = typeof payload.email === "string" && payload.email.trim()
        ? payload.email.trim().toLowerCase()
        : undefined;
    return {
        sub: String(payload.sub),
        email,
        emailVerified: isTrue(payload.email_verified),
        isPrivateEmail: isTrue(payload.is_private_email),
    };
};
exports.verifyAppleIdentityToken = verifyAppleIdentityToken;
// ---------------------------------------------------------------------------
// Client secret + token endpoints (need APPLE_TEAM_ID, APPLE_KEY_ID and
// APPLE_PRIVATE_KEY, the .p8 "Sign in with Apple" key).
// ---------------------------------------------------------------------------
const isAppleTokenApiConfigured = () => {
    var _a, _b, _c;
    return Boolean(((_a = process.env.APPLE_TEAM_ID) === null || _a === void 0 ? void 0 : _a.trim()) &&
        ((_b = process.env.APPLE_KEY_ID) === null || _b === void 0 ? void 0 : _b.trim()) &&
        ((_c = process.env.APPLE_PRIVATE_KEY) === null || _c === void 0 ? void 0 : _c.trim()));
};
exports.isAppleTokenApiConfigured = isAppleTokenApiConfigured;
const createClientSecret = () => {
    // Env vars often store the .p8 on one line with literal "\n".
    const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    return jsonwebtoken_1.default.sign({}, privateKey, {
        algorithm: "ES256",
        keyid: process.env.APPLE_KEY_ID.trim(),
        issuer: process.env.APPLE_TEAM_ID.trim(),
        audience: APPLE_ISSUER,
        subject: getAppleClientIds()[0],
        expiresIn: "5m",
    });
};
const postAppleForm = (path, form) => fetch(`${APPLE_ISSUER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
});
/** Returns Apple's refresh token, or null if it couldn't be obtained (never
 *  throws: a failed exchange must not block an otherwise valid sign-in). */
const exchangeAppleAuthorizationCode = async (authorizationCode) => {
    if (!(0, exports.isAppleTokenApiConfigured)()) {
        console.warn("Apple code exchange skipped: APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY not set");
        return null;
    }
    try {
        const response = await postAppleForm("/auth/token", {
            client_id: getAppleClientIds()[0],
            client_secret: createClientSecret(),
            code: authorizationCode,
            grant_type: "authorization_code",
        });
        const data = (await response.json().catch(() => ({})));
        if (!response.ok || !data.refresh_token) {
            console.error("Apple code exchange failed", {
                status: response.status,
                error: data.error,
            });
            return null;
        }
        return data.refresh_token;
    }
    catch (error) {
        console.error("Apple code exchange error", {
            error: error instanceof Error ? error.message : error,
        });
        return null;
    }
};
exports.exchangeAppleAuthorizationCode = exchangeAppleAuthorizationCode;
/** Best effort: logs and returns false on failure, never throws. */
const revokeAppleToken = async (refreshToken) => {
    if (!(0, exports.isAppleTokenApiConfigured)()) {
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
    }
    catch (error) {
        console.error("Apple token revoke error", {
            error: error instanceof Error ? error.message : error,
        });
        return false;
    }
};
exports.revokeAppleToken = revokeAppleToken;
//# sourceMappingURL=appleAuth.js.map