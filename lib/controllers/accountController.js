"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = exports.hardDeleteUserData = exports.DELETE_ACCOUNT_CONFIRMATION = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = __importStar(require("mongoose"));
const AnalyticsEvent_1 = require("../models/AnalyticsEvent");
const EmailOtp_1 = require("../models/EmailOtp");
const OtpVerification_1 = require("../models/OtpVerification");
const Player_1 = require("../models/Player");
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const SavedMatch_1 = require("../models/SavedMatch");
const SavedPlayerTeam_1 = require("../models/SavedPlayerTeam");
const Tournament_1 = require("../models/Tournament");
const TournamentMatch_1 = require("../models/TournamentMatch");
const TournamentTeam_1 = require("../models/TournamentTeam");
const User_1 = require("../models/User");
const jwt_1 = require("../utils/jwt");
const appleAuth_1 = require("../utils/appleAuth");
exports.DELETE_ACCOUNT_CONFIRMATION = "DELETE";
// ---------------------------------------------------------------------------
// Rate limiting: 5 attempts per user per 15 minutes. Mostly guards the
// password check against brute force. In-memory, so it is per server
// instance - good enough for a single Node process; swap for Redis if the
// API is ever scaled horizontally.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const attemptsByUser = new Map();
const isRateLimited = (userId) => {
    var _a;
    const now = Date.now();
    const recent = ((_a = attemptsByUser.get(userId)) !== null && _a !== void 0 ? _a : []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
    recent.push(now);
    attemptsByUser.set(userId, recent);
    return recent.length > RATE_LIMIT_MAX_ATTEMPTS;
};
const getBearerToken = (req) => {
    const header = req.headers.authorization;
    return (header === null || header === void 0 ? void 0 : header.startsWith("Bearer ")) ? header.slice("Bearer ".length) : null;
};
/**
 * Hard-deletes a user and every document they own. Nothing is soft-deleted
 * or anonymised: documents are physically removed.
 *
 * Runs inside the given session's transaction when one is passed, so either
 * everything goes or nothing does. Operations run sequentially because a
 * MongoDB transaction does not support concurrent operations on one session.
 */
const hardDeleteUserData = async (user, session) => {
    const userId = user._id;
    const opts = session ? { session } : {};
    const counts = {};
    // Tournaments the user organised, plus every team and fixture in them
    // (matched by tournament id too, in case an older child doc has a
    // different organizer value).
    const tournamentIds = (await Tournament_1.Tournament.find({ organizer: userId }, { _id: 1 }, opts).lean()).map((tournament) => tournament._id);
    const inUsersTournaments = {
        $or: [{ organizer: userId }, { tournament: { $in: tournamentIds } }],
    };
    counts.tournamentMatches = (await TournamentMatch_1.TournamentMatch.deleteMany(inUsersTournaments, opts)).deletedCount;
    counts.tournamentTeams = (await TournamentTeam_1.TournamentTeam.deleteMany(inUsersTournaments, opts)).deletedCount;
    counts.tournaments = (await Tournament_1.Tournament.deleteMany({ organizer: userId }, opts)).deletedCount;
    // Team library, the player profiles the user created, and players.
    counts.savedPlayerTeams = (await SavedPlayerTeam_1.SavedPlayerTeam.deleteMany({ owner: userId }, opts)).deletedCount;
    counts.playerIdentities = (await PlayerIdentity_1.PlayerIdentity.deleteMany({ createdBy: userId }, opts)).deletedCount;
    counts.players = (await Player_1.Player.deleteMany({ user: userId }, opts))
        .deletedCount;
    // Saved matches / match history.
    counts.savedMatches = (await SavedMatch_1.SavedMatch.deleteMany({ user: userId }, opts))
        .deletedCount;
    // Analytics: every event tied to the user, plus every event from the
    // browser/app sessions they were signed in on (so anonymous page views
    // from those same sessions don't linger either).
    const sessionIds = (await AnalyticsEvent_1.AnalyticsEvent.distinct("sessionId", { userId }).session(session !== null && session !== void 0 ? session : null)).filter((sessionId) => typeof sessionId === "string" && sessionId.length > 0);
    counts.analyticsEvents = (await AnalyticsEvent_1.AnalyticsEvent.deleteMany({
        $or: [
            { userId },
            ...(sessionIds.length ? [{ sessionId: { $in: sessionIds } }] : []),
        ],
    }, opts)).deletedCount;
    // Pending OTP codes for the user's phone number.
    counts.otpVerifications = user.phoneNumber
        ? (await OtpVerification_1.OtpVerification.deleteMany({ phoneNumber: user.phoneNumber }, opts))
            .deletedCount
        : 0;
    // Email verification / password reset codes.
    counts.emailOtps = user.email
        ? (await EmailOtp_1.EmailOtp.deleteMany({ email: user.email }, opts)).deletedCount
        : 0;
    // The user record itself goes last.
    counts.users = (await User_1.User.deleteOne({ _id: userId }, opts)).deletedCount;
    return counts;
};
exports.hardDeleteUserData = hardDeleteUserData;
const isTransactionUnsupported = (error) => {
    var _a;
    const err = error;
    return ((err === null || err === void 0 ? void 0 : err.code) === 20 || // IllegalOperation: standalone server, no replica set
        (err === null || err === void 0 ? void 0 : err.codeName) === "IllegalOperation" ||
        /Transaction numbers are only allowed|replica set/i.test((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : ""));
};
/**
 * DELETE /api/v1/auth/account
 * Body: { confirmation: "DELETE", password?: string }
 * See docs/delete-account-api.md in the web app repo.
 */
const deleteAccount = async (req, res) => {
    var _a, _b;
    // Authenticate here rather than via requireAuth so a retry after a
    // successful delete (e.g. the response was lost on a flaky connection)
    // gets 200 instead of 401 - requireAuth rejects tokens whose user no
    // longer exists.
    const token = getBearerToken(req);
    const verification = token && process.env.JWT_SECRET ? (0, jwt_1.verifyTokenWithRefresh)(token) : null;
    if (!verification || verification.status !== "valid") {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const userId = verification.userId;
    if (!mongoose_1.Types.ObjectId.isValid(userId)) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    if (((_a = req.body) === null || _a === void 0 ? void 0 : _a.confirmation) !== exports.DELETE_ACCOUNT_CONFIRMATION) {
        res.status(400).json({ message: "Type DELETE to confirm." });
        return;
    }
    if (isRateLimited(userId)) {
        res
            .status(429)
            .json({ message: "Too many attempts. Please try again later." });
        return;
    }
    try {
        const user = await User_1.User.findById(userId).select("+password +appleRefreshToken");
        if (!user) {
            // Already deleted - idempotent success.
            res.status(200).json({ deleted: true });
            return;
        }
        if (user.password) {
            const password = (_b = req.body) === null || _b === void 0 ? void 0 : _b.password;
            const passwordMatches = typeof password === "string" &&
                password.length > 0 &&
                (await bcryptjs_1.default.compare(password, user.password));
            if (!passwordMatches) {
                // 403, not 401: the client treats 401 as "access token expired".
                res.status(403).json({
                    message: typeof password === "string" && password
                        ? "Incorrect password."
                        : "Enter your password to delete your account.",
                });
                return;
            }
        }
        // Sign in with Apple: revoke the user's Apple token so the app is
        // unlinked from their Apple ID (App Store Guideline 5.1.1(v)). Best
        // effort - never block deletion on Apple being reachable.
        let appleTokenRevoked;
        if (user.appleRefreshToken) {
            appleTokenRevoked = await (0, appleAuth_1.revokeAppleToken)(user.appleRefreshToken);
        }
        const target = {
            _id: user._id,
            phoneNumber: user.phoneNumber,
            email: user.email,
        };
        let counts;
        try {
            counts = await mongoose_1.default.connection.transaction((session) => (0, exports.hardDeleteUserData)(target, session));
        }
        catch (error) {
            if (!isTransactionUnsupported(error))
                throw error;
            // Local standalone MongoDB (no replica set) can't run transactions.
            // Fall back to sequential deletes; the user doc is deleted last, so
            // a failure part-way can simply be retried.
            counts = await (0, exports.hardDeleteUserData)(target);
        }
        attemptsByUser.delete(userId);
        // Audit log: id and counts only - never email, name or password.
        console.info("Account deleted", Object.assign(Object.assign({ userId }, counts), (appleTokenRevoked !== undefined ? { appleTokenRevoked } : {})));
        res.status(200).json({ deleted: true });
    }
    catch (error) {
        console.error("Delete account error", {
            userId,
            error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({
            message: "We couldn't delete your account. Please try again.",
        });
    }
};
exports.deleteAccount = deleteAccount;
//# sourceMappingURL=accountController.js.map