"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getCurrentUser = exports.setPassword = exports.resendVerificationEmail = exports.verifyEmail = exports.resetPassword = exports.forgotPassword = exports.refreshToken = exports.verifyMobileOtp = exports.requestMobileOtp = exports.getAuthConfig = exports.appleLogin = exports.googleLogin = exports.login = exports.signup = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const OtpVerification_1 = require("../models/OtpVerification");
const User_1 = require("../models/User");
const analytics_1 = require("../utils/analytics");
const emailOtp_1 = require("../utils/emailOtp");
const mailer_1 = require("../utils/mailer");
const sms_1 = require("../utils/sms");
const crypto_1 = require("crypto");
const appleAuth_1 = require("../utils/appleAuth");
const jwt_1 = require("../utils/jwt");
const normalizeEmail = (email) => {
    if (typeof email !== "string") {
        return null;
    }
    const normalizedEmail = email.trim().toLowerCase();
    return normalizedEmail.length > 0 ? normalizedEmail : null;
};
const isStrongEnoughPassword = (password) => {
    return typeof password === "string" && password.length >= 6;
};
const normalizePhoneNumber = (phoneNumber) => {
    if (typeof phoneNumber !== "string") {
        return null;
    }
    const compactPhoneNumber = phoneNumber.replace(/[\s().-]/g, "");
    if (/^\+\d{8,15}$/.test(compactPhoneNumber)) {
        return compactPhoneNumber;
    }
    if (/^\d{10}$/.test(compactPhoneNumber)) {
        return `+91${compactPhoneNumber}`;
    }
    if (/^\d{8,15}$/.test(compactPhoneNumber)) {
        return `+${compactPhoneNumber}`;
    }
    return null;
};
const serializeUser = (user) => {
    var _a, _b, _c, _d;
    return ({
        id: String(user._id),
        name: user.name,
        email: (_a = user.email) !== null && _a !== void 0 ? _a : "",
        phoneNumber: (_b = user.phoneNumber) !== null && _b !== void 0 ? _b : "",
        authProvider: (_c = user.authProvider) !== null && _c !== void 0 ? _c : "password",
        avatarUrl: (_d = user.avatarUrl) !== null && _d !== void 0 ? _d : "",
        hasPassword: Boolean(user.password),
        emailVerified: user.emailVerified !== false,
    });
};
const createAuthResponse = (message, user) => {
    const userId = String(user._id);
    const accessToken = (0, jwt_1.createToken)(userId);
    const refreshToken = (0, jwt_1.createRefreshToken)(userId);
    return {
        message,
        token: accessToken,
        accessToken,
        refreshToken,
        user: serializeUser(user),
    };
};
class AuthProviderError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}
const verifyGoogleIdToken = async (idToken) => {
    const googleClientIds = (process.env.GOOGLE_CLIENT_ID || "")
        .split(",")
        .map((clientId) => clientId.trim())
        .filter(Boolean);
    if (!googleClientIds.length) {
        throw new AuthProviderError("GOOGLE_CLIENT_ID is required", 500);
    }
    let response;
    try {
        response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    }
    catch (error) {
        throw new AuthProviderError("Unable to reach Google token verification", 502);
    }
    const tokenInfo = (await response
        .json()
        .catch(() => ({})));
    if (!response.ok || tokenInfo.error) {
        return null;
    }
    if (!tokenInfo.aud ||
        !googleClientIds.includes(tokenInfo.aud) ||
        !tokenInfo.sub ||
        !tokenInfo.email) {
        return null;
    }
    return tokenInfo;
};
const generateOtp = () => (0, crypto_1.randomInt)(0, 1000000).toString().padStart(6, "0");
// ---------------------------------------------------------------------------
// Email verification codes
// ---------------------------------------------------------------------------
/** Sends a code; on failure responds with a 5xx and returns null. */
const sendEmailCode = async (res, email, purpose, name) => {
    try {
        return await (0, emailOtp_1.issueEmailOtp)(email, purpose, name);
    }
    catch (error) {
        console.error("Send email code error", {
            purpose,
            error: error instanceof Error ? error.message : error,
        });
        res.status(error instanceof mailer_1.MailerNotConfiguredError ? 503 : 502).json({
            message: "We couldn't send the email right now. Please try again in a few minutes.",
        });
        return null;
    }
};
const resendInfo = (result) => (Object.assign({ resendAfterSeconds: result.resendAfterSeconds }, (result.status === "limited"
    ? {
        message: "Too many codes requested. Please use the latest code we sent, or try again later.",
    }
    : {})));
const getOtpFromBody = (body) => {
    var _a, _b;
    const value = (_a = body) !== null && _a !== void 0 ? _a : {};
    const raw = (_b = value.otp) !== null && _b !== void 0 ? _b : value.code;
    return typeof raw === "string" || typeof raw === "number"
        ? String(raw).replace(/\s/g, "")
        : "";
};
const signup = async (req, res) => {
    var _a, _b, _c;
    try {
        const name = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) === "string" ? req.body.name.trim() : "";
        const email = normalizeEmail((_b = req.body) === null || _b === void 0 ? void 0 : _b.email);
        const password = (_c = req.body) === null || _c === void 0 ? void 0 : _c.password;
        if (!name || !email || !isStrongEnoughPassword(password)) {
            res.status(400).json({
                message: "Name, valid email, and password with 6+ characters are required",
            });
            return;
        }
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
        const hashedPassword = await bcryptjs_1.default.hash(password, saltRounds);
        let user = await User_1.User.findOne({ email });
        if (user && user.emailVerified !== false) {
            res.status(409).json({ message: "User already exists" });
            return;
        }
        if (user) {
            // Signed up before but never verified: whoever owns the inbox should
            // be able to finish, so take the latest details and send a new code.
            user.name = name;
            user.password = hashedPassword;
            await user.save();
        }
        else {
            user = await User_1.User.create({
                name,
                email,
                password: hashedPassword,
                authProvider: "password",
                emailVerified: false,
            });
            (0, analytics_1.trackEvent)(req, {
                type: "USER_SIGNUP",
                userId: String(user._id),
                metadata: { provider: "password" },
            });
        }
        const sent = await sendEmailCode(res, email, "verify_email", name);
        if (!sent)
            return;
        // No tokens until the email is verified (POST /auth/email/verify).
        res.status(201).json(Object.assign({ message: "We've sent a 6-digit code to your email.", verificationRequired: true, email }, resendInfo(sent)));
    }
    catch (error) {
        console.error("Signup error", error);
        res.status(500).json({ message: "Unable to signup" });
    }
};
exports.signup = signup;
const login = async (req, res) => {
    var _a, _b;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const password = (_b = req.body) === null || _b === void 0 ? void 0 : _b.password;
        if (!email || typeof password !== "string") {
            res.status(400).json({
                message: "Email and password are required",
            });
            return;
        }
        const user = await User_1.User.findOne({ email }).select("+password");
        if (!user) {
            res.status(401).json({
                message: "Invalid email or password",
            });
            return;
        }
        // User registered only with Google
        if (!user.password) {
            res.status(400).json({
                message: "This account was created using Google Sign-In. Please continue with Google or set a password to enable email login.",
            });
            return;
        }
        const passwordMatches = await bcryptjs_1.default.compare(password, user.password);
        if (!passwordMatches) {
            res.status(401).json({
                message: "Invalid email or password",
            });
            return;
        }
        if (user.emailVerified === false) {
            const sent = await sendEmailCode(res, email, "verify_email", user.name);
            if (!sent)
                return;
            res.status(403).json(Object.assign({ code: "EMAIL_NOT_VERIFIED", message: "Please verify your email. We've sent a 6-digit code to it.", email }, resendInfo(sent)));
            return;
        }
        (0, analytics_1.trackEvent)(req, {
            type: "USER_LOGIN",
            userId: String(user._id),
            metadata: { provider: "password" },
        });
        res.status(200).json(createAuthResponse("Login successful", user));
    }
    catch (error) {
        console.error("Login error", error);
        res.status(500).json({
            message: "Unable to login",
        });
    }
};
exports.login = login;
const googleLogin = async (req, res) => {
    var _a, _b, _c, _d;
    try {
        const idToken = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.idToken) === "string"
            ? req.body.idToken
            : typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.credential) === "string"
                ? req.body.credential
                : "";
        if (!idToken) {
            res.status(400).json({ message: "Google idToken is required" });
            return;
        }
        const tokenInfo = await verifyGoogleIdToken(idToken);
        if (!tokenInfo) {
            res.status(401).json({ message: "Invalid Google token" });
            return;
        }
        const email = normalizeEmail(tokenInfo.email);
        if (!email) {
            res.status(400).json({ message: "Google account email is required" });
            return;
        }
        // Only trust (and link accounts by) an email Google has verified.
        const googleEmailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === "true";
        if (!googleEmailVerified) {
            res.status(400).json({
                message: "Your Google account's email isn't verified. Verify it with Google, or sign up with email instead.",
            });
            return;
        }
        let user = await User_1.User.findOne({
            $or: [{ googleId: tokenInfo.sub }, { email }],
        }).select("+password");
        let isNewUser = false;
        // "login" (the Login page) must never create an account; only the
        // Sign Up page ("signup") may. Older app versions send no intent and
        // keep the previous create-if-missing behaviour.
        const intent = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.intent) === "login" || ((_d = req.body) === null || _d === void 0 ? void 0 : _d.intent) === "signup"
            ? req.body.intent
            : "signup";
        if (!user && intent === "login") {
            res.status(404).json({
                code: "ACCOUNT_NOT_FOUND",
                message: "No account found for this Google account. Please sign up first.",
                email,
            });
            return;
        }
        if (!user) {
            // First-time Google signup
            isNewUser = true;
            user = await User_1.User.create({
                name: tokenInfo.name || email.split("@")[0],
                email,
                googleId: tokenInfo.sub,
                avatarUrl: tokenInfo.picture,
                authProvider: "google",
                emailVerified: true,
                emailVerifiedAt: new Date(),
            });
        }
        else {
            // Link Google account if not already linked
            if (!user.googleId) {
                user.googleId = tokenInfo.sub;
            }
            user.email = user.email || email;
            user.name = tokenInfo.name || user.name;
            user.avatarUrl = tokenInfo.picture || user.avatarUrl;
            user.authProvider = "google";
            if (user.emailVerified === false) {
                // Google just proved ownership of this email.
                user.emailVerified = true;
                user.emailVerifiedAt = new Date();
            }
            await user.save();
        }
        (0, analytics_1.trackEvent)(req, {
            type: isNewUser ? "USER_SIGNUP" : "USER_LOGIN",
            userId: String(user._id),
            metadata: { provider: "google" },
        });
        res.status(200).json(createAuthResponse("Google login successful", user));
    }
    catch (error) {
        console.error("Google login error", error);
        if (error instanceof AuthProviderError) {
            res.status(error.statusCode).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: "Unable to login with Google" });
    }
};
exports.googleLogin = googleLogin;
/**
 * POST /api/v1/auth/apple  (iOS app, Sign in with Apple)
 * Body: { identityToken, authorizationCode, nonce, intent, name?, givenName?, familyName? }
 * See docs/apple-sign-in-api.md in the web app repo.
 */
const appleLogin = async (req, res) => {
    var _a, _b;
    try {
        const body = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        const identityToken = typeof body.identityToken === "string" ? body.identityToken.trim() : "";
        const rawNonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
        const authorizationCode = typeof body.authorizationCode === "string"
            ? body.authorizationCode.trim()
            : "";
        if (!identityToken || !rawNonce) {
            res.status(400).json({
                code: "INVALID_REQUEST",
                message: "Apple identityToken and nonce are required",
            });
            return;
        }
        const apple = await (0, appleAuth_1.verifyAppleIdentityToken)(identityToken, rawNonce);
        // Apple only shares the name on the very first authorization (and never
        // in the token), so the app forwards it when it has it.
        const providedName = (_b = [
            typeof body.name === "string" ? body.name : "",
            [body.givenName, body.familyName]
                .filter((part) => typeof part === "string" && part.trim())
                .join(" "),
        ]
            .map((value) => value.trim())
            .find(Boolean)) === null || _b === void 0 ? void 0 : _b.slice(0, 100);
        // Look up by Apple ID first: later sign-ins may carry no email at all.
        let user = await User_1.User.findOne({ appleId: apple.sub }).select("+password +appleRefreshToken");
        // Then link to an existing account with the same (Apple-verified) email.
        const linkEmail = apple.email && apple.emailVerified ? normalizeEmail(apple.email) : null;
        if (!user && linkEmail) {
            user = await User_1.User.findOne({ email: linkEmail }).select("+password +appleRefreshToken");
        }
        // "login" (the Login page) must never create an account; only the
        // Sign Up page ("signup") may.
        const intent = getAuthIntent(body);
        if (!user && intent === "login") {
            res.status(404).json({
                code: "ACCOUNT_NOT_FOUND",
                message: "No account found for this Apple ID. Please sign up first.",
            });
            return;
        }
        const appleRefreshToken = authorizationCode
            ? await (0, appleAuth_1.exchangeAppleAuthorizationCode)(authorizationCode)
            : null;
        let isNewUser = false;
        if (!user) {
            isNewUser = true;
            user = await User_1.User.create(Object.assign(Object.assign(Object.assign(Object.assign({ name: providedName ||
                    (linkEmail && !apple.isPrivateEmail
                        ? linkEmail.split("@")[0]
                        : "Cricket Fan") }, (linkEmail ? { email: linkEmail } : {})), { appleId: apple.sub }), (appleRefreshToken ? { appleRefreshToken } : {})), { authProvider: "apple", emailVerified: true, emailVerifiedAt: new Date() }));
        }
        else {
            if (!user.appleId) {
                user.appleId = apple.sub;
            }
            if (appleRefreshToken) {
                user.appleRefreshToken = appleRefreshToken;
            }
            if (!user.email && linkEmail) {
                const emailTaken = await User_1.User.exists({
                    email: linkEmail,
                    _id: { $ne: user._id },
                });
                if (!emailTaken)
                    user.email = linkEmail;
            }
            if (providedName && (!user.name || user.name === "Cricket Fan")) {
                user.name = providedName;
            }
            user.authProvider = "apple";
            if (user.emailVerified === false && linkEmail && user.email === linkEmail) {
                // Apple just proved ownership of this email.
                user.emailVerified = true;
                user.emailVerifiedAt = new Date();
            }
            await user.save();
        }
        (0, analytics_1.trackEvent)(req, {
            type: isNewUser ? "USER_SIGNUP" : "USER_LOGIN",
            userId: String(user._id),
            metadata: { provider: "apple" },
        });
        res.status(200).json(createAuthResponse("Apple login successful", user));
    }
    catch (error) {
        if (error instanceof appleAuth_1.AppleAuthError) {
            res
                .status(error.statusCode)
                .json({ code: error.code, message: error.message });
            return;
        }
        console.error("Apple login error", {
            error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({ message: "Unable to sign in with Apple" });
    }
};
exports.appleLogin = appleLogin;
const MOBILE_OTP_MINUTES = () => Number(process.env.OTP_EXPIRES_MINUTES || 10);
const MOBILE_OTP_MAX_ATTEMPTS = () => Number(process.env.OTP_MAX_ATTEMPTS || 5);
const MOBILE_OTP_RESEND_SECONDS = () => Number(process.env.OTP_RESEND_SECONDS || 60);
const MOBILE_OTP_MAX_SENDS_PER_HOUR = () => Number(process.env.OTP_MAX_SENDS_PER_HOUR || 5);
const HOUR_MS = 60 * 60 * 1000;
/** "login" (Login page) never creates an account; "signup" may. No intent
 *  (older app versions) keeps the old create-if-missing behaviour. */
const getAuthIntent = (body) => {
    const intent = body === null || body === void 0 ? void 0 : body.intent;
    return intent === "login" ? "login" : "signup";
};
const mobileAccountNotFound = (res, phoneNumber) => {
    res.status(404).json({
        code: "ACCOUNT_NOT_FOUND",
        message: "No account found for this mobile number. Please sign up first.",
        phoneNumber,
    });
};
// What the app can offer on its login screens (no secrets).
const getAuthConfig = (_req, res) => {
    res.status(200).json({ mobileOtpLogin: (0, sms_1.isMobileLoginAvailable)() });
};
exports.getAuthConfig = getAuthConfig;
const requestMobileOtp = async (req, res) => {
    var _a, _b;
    try {
        const phoneNumber = normalizePhoneNumber((_a = req.body) === null || _a === void 0 ? void 0 : _a.phoneNumber);
        if (!phoneNumber) {
            res.status(400).json({
                message: "Enter a valid mobile number with country code, e.g. +91 9876543210",
            });
            return;
        }
        if (!(0, sms_1.isMobileLoginAvailable)()) {
            res.status(503).json({ message: "Mobile login isn't available right now. Please use email." });
            return;
        }
        // Don't spend SMS credits on numbers that can't log in anyway.
        if (getAuthIntent(req.body) === "login" &&
            !(await User_1.User.exists({ phoneNumber }))) {
            mobileAccountNotFound(res, phoneNumber);
            return;
        }
        const now = Date.now();
        const existing = await OtpVerification_1.OtpVerification.findOne({ phoneNumber });
        let sendCount = 0;
        let windowStart = new Date(now);
        if (existing === null || existing === void 0 ? void 0 : existing.lastSentAt) {
            const cooldownMs = MOBILE_OTP_RESEND_SECONDS() * 1000;
            const sinceLast = now - existing.lastSentAt.getTime();
            if (sinceLast < cooldownMs) {
                res.status(429).json({
                    code: "OTP_COOLDOWN",
                    message: "Please wait before requesting another code.",
                    resendAfterSeconds: Math.ceil((cooldownMs - sinceLast) / 1000),
                });
                return;
            }
            if (existing.sendWindowStartedAt &&
                now - existing.sendWindowStartedAt.getTime() < HOUR_MS) {
                sendCount = (_b = existing.sendCount) !== null && _b !== void 0 ? _b : 0;
                windowStart = existing.sendWindowStartedAt;
            }
            if (sendCount >= MOBILE_OTP_MAX_SENDS_PER_HOUR()) {
                res.status(429).json({
                    code: "OTP_LIMIT",
                    message: "Too many codes requested. Please try again later.",
                    resendAfterSeconds: Math.ceil((windowStart.getTime() + HOUR_MS - now) / 1000),
                });
                return;
            }
        }
        const otp = generateOtp();
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
        const otpHash = await bcryptjs_1.default.hash(otp, saltRounds);
        const minutes = MOBILE_OTP_MINUTES();
        const codeExpiresAt = new Date(now + minutes * 60 * 1000);
        await OtpVerification_1.OtpVerification.findOneAndUpdate({ phoneNumber }, {
            phoneNumber,
            otpHash,
            codeExpiresAt,
            expiresAt: new Date(Math.max(codeExpiresAt.getTime(), windowStart.getTime() + HOUR_MS)),
            attempts: 0,
            lastSentAt: new Date(now),
            sendCount: sendCount + 1,
            sendWindowStartedAt: windowStart,
        }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
        // Direct mode: skip the SMS and hand the code back in the response.
        if ((0, sms_1.isDirectOtpMode)()) {
            res.status(200).json({
                message: "Here is your code.",
                delivery: "direct",
                otp,
                resendAfterSeconds: MOBILE_OTP_RESEND_SECONDS(),
            });
            return;
        }
        try {
            await (0, sms_1.sendSms)(phoneNumber, (0, sms_1.buildOtpSms)(otp, minutes));
        }
        catch (error) {
            // Let them retry straight away instead of waiting out the cooldown.
            await OtpVerification_1.OtpVerification.updateOne({ phoneNumber }, { lastSentAt: new Date(0), $inc: { sendCount: -1 } });
            console.error("Send SMS error", {
                error: error instanceof Error ? error.message : error,
            });
            res.status(error instanceof sms_1.SmsNotConfiguredError ? 503 : 502).json({
                message: "We couldn't send the SMS right now. Please try again in a few minutes, or use email.",
            });
            return;
        }
        res.status(200).json(Object.assign({ message: "OTP sent", delivery: "sms", resendAfterSeconds: MOBILE_OTP_RESEND_SECONDS() }, (process.env.OTP_DEBUG_RESPONSE === "true" &&
            process.env.NODE_ENV !== "production"
            ? { otp }
            : {})));
    }
    catch (error) {
        console.error("Request mobile OTP error", error);
        res.status(500).json({ message: "Unable to send OTP" });
    }
};
exports.requestMobileOtp = requestMobileOtp;
const verifyMobileOtp = async (req, res) => {
    var _a, _b, _c;
    try {
        const phoneNumber = normalizePhoneNumber((_a = req.body) === null || _a === void 0 ? void 0 : _a.phoneNumber);
        const otp = getOtpFromBody(req.body);
        if (!phoneNumber || !otp) {
            res.status(400).json({ message: "Phone number and OTP are required" });
            return;
        }
        const otpRecord = await OtpVerification_1.OtpVerification.findOne({ phoneNumber }).select("+otpHash");
        const codeExpiresAt = (_b = otpRecord === null || otpRecord === void 0 ? void 0 : otpRecord.codeExpiresAt) !== null && _b !== void 0 ? _b : otpRecord === null || otpRecord === void 0 ? void 0 : otpRecord.expiresAt;
        if (!otpRecord || !codeExpiresAt || codeExpiresAt.getTime() < Date.now()) {
            res.status(401).json({ code: "INVALID_OTP", message: "That code has expired. Request a new one." });
            return;
        }
        if (otpRecord.attempts >= MOBILE_OTP_MAX_ATTEMPTS()) {
            res.status(429).json({ code: "INVALID_OTP", message: "Too many wrong attempts. Request a new code." });
            return;
        }
        const otpMatches = /^\d{6}$/.test(otp) && (await bcryptjs_1.default.compare(otp, otpRecord.otpHash));
        if (!otpMatches) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            res.status(401).json({
                code: "INVALID_OTP",
                message: otpRecord.attempts >= MOBILE_OTP_MAX_ATTEMPTS()
                    ? "Too many wrong attempts. Request a new code."
                    : "That code isn't right. Check the SMS and try again.",
            });
            return;
        }
        // Consume the code but keep the send counters until the doc's TTL.
        await OtpVerification_1.OtpVerification.updateOne({ _id: otpRecord._id }, { codeExpiresAt: new Date(0), attempts: 0 });
        let user = await User_1.User.findOne({ phoneNumber });
        let isNewUser = false;
        if (!user) {
            if (getAuthIntent(req.body) === "login") {
                mobileAccountNotFound(res, phoneNumber);
                return;
            }
            isNewUser = true;
            user = await User_1.User.create({
                name: typeof ((_c = req.body) === null || _c === void 0 ? void 0 : _c.name) === "string" && req.body.name.trim()
                    ? req.body.name.trim()
                    : phoneNumber,
                phoneNumber,
                phoneVerifiedAt: new Date(),
                authProvider: "mobile",
            });
        }
        else {
            user.phoneVerifiedAt = new Date();
            user.authProvider = "mobile";
            await user.save();
        }
        (0, analytics_1.trackEvent)(req, {
            type: isNewUser ? "USER_SIGNUP" : "USER_LOGIN",
            userId: String(user._id),
            metadata: { provider: "mobile" },
        });
        res.status(200).json(createAuthResponse("Mobile login successful", user));
    }
    catch (error) {
        console.error("Verify mobile OTP error", error);
        res.status(500).json({ message: "Unable to verify OTP" });
    }
};
exports.verifyMobileOtp = verifyMobileOtp;
const refreshToken = async (req, res) => {
    var _a;
    try {
        const authHeader = req.headers.authorization;
        const tokenFromHeader = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))
            ? authHeader.slice("Bearer ".length)
            : "";
        const refreshTokenValue = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.refreshToken) === "string"
            ? req.body.refreshToken
            : typeof req.headers["x-refresh-token"] === "string"
                ? req.headers["x-refresh-token"]
                : tokenFromHeader;
        if (!refreshTokenValue) {
            res.status(400).json({ message: "Refresh token is required" });
            return;
        }
        const verification = (0, jwt_1.verifyRefreshToken)(refreshTokenValue);
        if (verification.status !== "valid") {
            res.status(401).json({ message: "Invalid or expired refresh token" });
            return;
        }
        const user = await User_1.User.findById(verification.userId).select("+password");
        if (!user) {
            res.status(401).json({ message: "Invalid or expired refresh token" });
            return;
        }
        res.status(200).json(createAuthResponse("Token refreshed", user));
    }
    catch (error) {
        console.error("Refresh token error", error);
        res.status(500).json({ message: "Unable to refresh token" });
    }
};
exports.refreshToken = refreshToken;
// Step 1 of a password reset: email a code. Always answers the same way,
// whether or not the email has an account, so it can't be used to find
// out who is registered.
const forgotPassword = async (req, res) => {
    var _a;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        if (!email) {
            res.status(400).json({ message: "A valid email is required" });
            return;
        }
        const generic = {
            message: "If an account exists for this email, we've sent a 6-digit code to it.",
        };
        const user = await User_1.User.findOne({ email });
        if (!user) {
            res.status(200).json(Object.assign(Object.assign({}, generic), { resendAfterSeconds: 60 }));
            return;
        }
        const sent = await sendEmailCode(res, email, "reset_password", user.name);
        if (!sent)
            return;
        res.status(200).json(Object.assign(Object.assign({}, generic), resendInfo(sent)));
    }
    catch (error) {
        console.error("Forgot password error", error);
        res.status(500).json({ message: "Unable to send reset code" });
    }
};
exports.forgotPassword = forgotPassword;
// Step 2: the emailed code + a new password. Logs the user in on success.
const resetPassword = async (req, res) => {
    var _a, _b, _c, _d;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const otp = getOtpFromBody(req.body);
        const newPassword = (_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.newPassword) !== null && _c !== void 0 ? _c : (_d = req.body) === null || _d === void 0 ? void 0 : _d.password;
        if (!email || !otp) {
            res.status(400).json({
                message: "Email and the 6-digit code from your email are required",
            });
            return;
        }
        if (!isStrongEnoughPassword(newPassword)) {
            res.status(400).json({
                message: "New password must be at least 6 characters",
            });
            return;
        }
        const result = await (0, emailOtp_1.verifyEmailOtp)(email, "reset_password", otp);
        if (result !== "ok") {
            res.status(400).json({ code: "INVALID_OTP", message: emailOtp_1.OTP_ERROR_MESSAGES[result] });
            return;
        }
        const user = await User_1.User.findOne({ email }).select("+password");
        if (!user) {
            res.status(400).json({ code: "INVALID_OTP", message: emailOtp_1.OTP_ERROR_MESSAGES.expired });
            return;
        }
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
        user.password = await bcryptjs_1.default.hash(newPassword, saltRounds);
        if (user.emailVerified === false) {
            // The code proves they own the inbox.
            user.emailVerified = true;
            user.emailVerifiedAt = new Date();
        }
        await user.save();
        res
            .status(200)
            .json(createAuthResponse("Password reset successful", user));
    }
    catch (error) {
        console.error("Reset password error", error);
        res.status(500).json({ message: "Unable to reset password" });
    }
};
exports.resetPassword = resetPassword;
const verifyEmail = async (req, res) => {
    var _a;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const otp = getOtpFromBody(req.body);
        if (!email || !otp) {
            res.status(400).json({ message: "Email and the 6-digit code are required" });
            return;
        }
        const user = await User_1.User.findOne({ email }).select("+password");
        if (!user) {
            res.status(400).json({ code: "INVALID_OTP", message: emailOtp_1.OTP_ERROR_MESSAGES.expired });
            return;
        }
        if (user.emailVerified === false) {
            const result = await (0, emailOtp_1.verifyEmailOtp)(email, "verify_email", otp);
            if (result !== "ok") {
                res.status(400).json({ code: "INVALID_OTP", message: emailOtp_1.OTP_ERROR_MESSAGES[result] });
                return;
            }
            user.emailVerified = true;
            user.emailVerifiedAt = new Date();
            await user.save();
        }
        else {
            // Already verified: still require a correct code before handing out
            // tokens, otherwise this endpoint would be a password-less login.
            const result = await (0, emailOtp_1.verifyEmailOtp)(email, "verify_email", otp);
            if (result !== "ok") {
                res.status(400).json({ code: "INVALID_OTP", message: emailOtp_1.OTP_ERROR_MESSAGES[result] });
                return;
            }
        }
        (0, analytics_1.trackEvent)(req, {
            type: "USER_LOGIN",
            userId: String(user._id),
            metadata: { provider: "password", via: "email_verification" },
        });
        res.status(200).json(createAuthResponse("Email verified", user));
    }
    catch (error) {
        console.error("Verify email error", error);
        res.status(500).json({ message: "Unable to verify email" });
    }
};
exports.verifyEmail = verifyEmail;
const resendVerificationEmail = async (req, res) => {
    var _a;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        if (!email) {
            res.status(400).json({ message: "A valid email is required" });
            return;
        }
        const user = await User_1.User.findOne({ email });
        // Same answer whether or not there's anything to verify.
        if (!user || user.emailVerified !== false) {
            res.status(200).json({
                message: "If this email needs verifying, we've sent a new code.",
                resendAfterSeconds: 60,
            });
            return;
        }
        const sent = await sendEmailCode(res, email, "verify_email", user.name);
        if (!sent)
            return;
        res.status(200).json(Object.assign({ message: sent.status === "sent"
                ? "We've sent a new code to your email."
                : "Please wait before requesting another code." }, resendInfo(sent)));
    }
    catch (error) {
        console.error("Resend verification error", error);
        res.status(500).json({ message: "Unable to resend code" });
    }
};
exports.resendVerificationEmail = resendVerificationEmail;
// Lets a user set a password on an account that has none yet (e.g. a
// Google-only signup), or change an existing password. When a password is
// already set, the caller must supply the correct currentPassword.
const setPassword = async (req, res) => {
    var _a, _b, _c, _d, _e;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const newPassword = (_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.password) !== null && _c !== void 0 ? _c : (_d = req.body) === null || _d === void 0 ? void 0 : _d.newPassword;
        const currentPassword = (_e = req.body) === null || _e === void 0 ? void 0 : _e.currentPassword;
        if (!isStrongEnoughPassword(newPassword)) {
            res.status(400).json({
                message: "New password must be at least 6 characters",
            });
            return;
        }
        const user = await User_1.User.findById(userId).select("+password");
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        if (!user.email) {
            res.status(400).json({
                message: "Add a verified email to your account (e.g. by signing in with Google) before setting a password.",
            });
            return;
        }
        if (user.password) {
            if (typeof currentPassword !== "string" || !currentPassword) {
                res.status(400).json({
                    message: "Current password is required to change your password",
                });
                return;
            }
            const currentPasswordMatches = await bcryptjs_1.default.compare(currentPassword, user.password);
            if (!currentPasswordMatches) {
                res.status(401).json({ message: "Current password is incorrect" });
                return;
            }
        }
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
        user.password = await bcryptjs_1.default.hash(newPassword, saltRounds);
        await user.save();
        res.status(200).json({
            message: "Password set successfully",
            user: serializeUser(user),
        });
    }
    catch (error) {
        console.error("Set password error", error);
        res.status(500).json({ message: "Unable to set password" });
    }
};
exports.setPassword = setPassword;
const getCurrentUser = async (req, res) => {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const user = await User_1.User.findById(userId).select("+password");
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        res.status(200).json({ user: serializeUser(user) });
    }
    catch (error) {
        console.error("Get current user error", error);
        res.status(500).json({ message: "Unable to fetch current user" });
    }
};
exports.getCurrentUser = getCurrentUser;
const logout = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))
            ? authHeader.slice("Bearer ".length)
            : null;
        if (!token) {
            res.status(400).json({ message: "Authorization token is required" });
            return;
        }
        res.status(200).json({ message: "Logout successful" });
    }
    catch (error) {
        console.error("Logout error", error);
        res.status(500).json({ message: "Unable to logout" });
    }
};
exports.logout = logout;
//# sourceMappingURL=authController.js.map