"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAnalyticsAdmin = exports.requireAdmin = exports.optionalAuth = exports.requireAuth = void 0;
const User_1 = require("../models/User");
const jwt_1 = require("../utils/jwt");
const requireAuth = async (req, res, next) => {
    var _a;
    try {
        const authHeader = req.headers.authorization;
        const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))
            ? authHeader.slice("Bearer ".length)
            : null;
        if (!token || !process.env.JWT_SECRET) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const verification = (0, jwt_1.verifyTokenWithRefresh)(token);
        if (verification.status !== "valid") {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        if (verification.refreshedToken) {
            res.setHeader("X-Access-Token", verification.refreshedToken);
            res.setHeader("Access-Control-Expose-Headers", "X-Access-Token");
        }
        const user = await User_1.User.findById(verification.userId);
        if (!user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        req.user = {
            id: String(user._id),
            name: user.name,
            email: (_a = user.email) !== null && _a !== void 0 ? _a : "",
            phoneNumber: user.phoneNumber,
        };
        next();
    }
    catch (error) {
        res.status(401).json({ message: "Unauthorized" });
    }
};
exports.requireAuth = requireAuth;
// Attaches req.user when a valid token is present, but never rejects the
// request -- used for endpoints (like analytics tracking) that should work
// for both logged-in and anonymous callers.
const optionalAuth = async (req, res, next) => {
    var _a;
    try {
        const authHeader = req.headers.authorization;
        const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))
            ? authHeader.slice("Bearer ".length)
            : null;
        if (!token || !process.env.JWT_SECRET) {
            next();
            return;
        }
        const verification = (0, jwt_1.verifyTokenWithRefresh)(token);
        if (verification.status !== "valid") {
            next();
            return;
        }
        const user = await User_1.User.findById(verification.userId);
        if (user) {
            req.user = {
                id: String(user._id),
                name: user.name,
                email: (_a = user.email) !== null && _a !== void 0 ? _a : "",
                phoneNumber: user.phoneNumber,
            };
        }
        next();
    }
    catch (error) {
        next();
    }
};
exports.optionalAuth = optionalAuth;
// Restricts an already-authenticated request (mount after requireAuth) to a
// small allowlist of admin emails, configurable via ADMIN_EMAILS
// (comma-separated, falling back to the older ANALYTICS_ADMIN_EMAILS name)
// so it can be changed without a code deploy. Generic on purpose -- it now
// gates more than just analytics endpoints (e.g. the promo banner admin
// routes).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ||
    process.env.ANALYTICS_ADMIN_EMAILS ||
    "gotimonik@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
const requireAdmin = (req, res, next) => {
    var _a, _b;
    const email = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.email) === null || _b === void 0 ? void 0 : _b.toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
// Back-compat alias -- analytics routes were the first admin-gated
// endpoints and already import this name; keep it working unchanged.
exports.requireAnalyticsAdmin = exports.requireAdmin;
//# sourceMappingURL=authMiddleware.js.map