"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getCurrentUser = exports.setPassword = exports.resetPassword = exports.refreshToken = exports.verifyMobileOtp = exports.requestMobileOtp = exports.googleLogin = exports.login = exports.signup = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const OtpVerification_1 = require("../models/OtpVerification");
const User_1 = require("../models/User");
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
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
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
        const existingUser = await User_1.User.findOne({ email });
        if (existingUser) {
            res.status(409).json({ message: "User already exists" });
            return;
        }
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
        const hashedPassword = await bcryptjs_1.default.hash(password, saltRounds);
        const user = await User_1.User.create({
            name,
            email,
            password: hashedPassword,
            authProvider: "password",
        });
        res.status(201).json(createAuthResponse("Signup successful", user));
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
    var _a, _b;
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
        let user = await User_1.User.findOne({
            $or: [{ googleId: tokenInfo.sub }, { email }],
        }).select("+password");
        if (!user) {
            // First-time Google signup
            user = await User_1.User.create({
                name: tokenInfo.name || email.split("@")[0],
                email,
                googleId: tokenInfo.sub,
                avatarUrl: tokenInfo.picture,
                authProvider: "google",
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
            await user.save();
        }
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
const requestMobileOtp = async (req, res) => {
    var _a;
    try {
        const phoneNumber = normalizePhoneNumber((_a = req.body) === null || _a === void 0 ? void 0 : _a.phoneNumber);
        if (!phoneNumber) {
            res.status(400).json({ message: "Valid phone number is required" });
            return;
        }
        const otp = generateOtp();
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
        const otpHash = await bcryptjs_1.default.hash(otp, saltRounds);
        const expiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
        await OtpVerification_1.OtpVerification.findOneAndUpdate({ phoneNumber }, { phoneNumber, otpHash, expiresAt, attempts: 0 }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
        if (process.env.NODE_ENV !== "production") {
            console.log(`OTP for ${phoneNumber}: ${otp}`);
        }
        res.status(200).json(Object.assign({ message: "OTP sent" }, (process.env.OTP_DEBUG_RESPONSE === "true" ? { otp } : {})));
    }
    catch (error) {
        console.error("Request mobile OTP error", error);
        res.status(500).json({ message: "Unable to send OTP" });
    }
};
exports.requestMobileOtp = requestMobileOtp;
const verifyMobileOtp = async (req, res) => {
    var _a, _b;
    try {
        const phoneNumber = normalizePhoneNumber((_a = req.body) === null || _a === void 0 ? void 0 : _a.phoneNumber);
        const otp = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.otp) === "string" ? req.body.otp.trim() : "";
        if (!phoneNumber || !otp) {
            res.status(400).json({ message: "Phone number and OTP are required" });
            return;
        }
        const otpRecord = await OtpVerification_1.OtpVerification.findOne({ phoneNumber }).select("+otpHash");
        if (!otpRecord || otpRecord.expiresAt < new Date()) {
            res.status(401).json({ message: "Invalid or expired OTP" });
            return;
        }
        if (otpRecord.attempts >= Number(process.env.OTP_MAX_ATTEMPTS || 5)) {
            await OtpVerification_1.OtpVerification.deleteOne({ _id: otpRecord._id });
            res.status(429).json({ message: "Too many OTP attempts" });
            return;
        }
        const otpMatches = await bcryptjs_1.default.compare(otp, otpRecord.otpHash);
        if (!otpMatches) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            res.status(401).json({ message: "Invalid or expired OTP" });
            return;
        }
        await OtpVerification_1.OtpVerification.deleteOne({ _id: otpRecord._id });
        let user = await User_1.User.findOne({ phoneNumber });
        if (!user) {
            user = await User_1.User.create({
                name: phoneNumber,
                phoneNumber,
                phoneVerifiedAt: new Date(),
                authProvider: "mobile",
            });
        }
        else {
            user.phoneNumber = phoneNumber;
            user.phoneVerifiedAt = new Date();
            user.authProvider = "mobile";
            await user.save();
        }
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
const resetPassword = async (req, res) => {
    var _a, _b;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const newPassword = (_b = req.body) === null || _b === void 0 ? void 0 : _b.newPassword;
        if (!email || !isStrongEnoughPassword(newPassword)) {
            res.status(400).json({
                message: "Valid email and new password with 6+ characters are required",
            });
            return;
        }
        const user = await User_1.User.findOne({ email }).select("+password");
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
        user.password = await bcryptjs_1.default.hash(newPassword, saltRounds);
        await user.save();
        res.status(200).json({ message: "Password reset successful" });
    }
    catch (error) {
        console.error("Reset password error", error);
        res.status(500).json({ message: "Unable to reset password" });
    }
};
exports.resetPassword = resetPassword;
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