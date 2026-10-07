import bcrypt from "bcryptjs";
import mongoose, { Types, type ClientSession } from "mongoose";
import type { Request, Response } from "express";
import { AnalyticsEvent } from "../models/AnalyticsEvent";
import { EmailOtp } from "../models/EmailOtp";
import { OtpVerification } from "../models/OtpVerification";
import { Player } from "../models/Player";
import { PlayerIdentity } from "../models/PlayerIdentity";
import { SavedMatch } from "../models/SavedMatch";
import { SavedPlayerTeam } from "../models/SavedPlayerTeam";
import { Tournament } from "../models/Tournament";
import { TournamentMatch } from "../models/TournamentMatch";
import { TournamentTeam } from "../models/TournamentTeam";
import { User } from "../models/User";
import { verifyTokenWithRefresh } from "../utils/jwt";
import { revokeAppleToken } from "../utils/appleAuth";

export const DELETE_ACCOUNT_CONFIRMATION = "DELETE";

// ---------------------------------------------------------------------------
// Rate limiting: 5 attempts per user per 15 minutes. Mostly guards the
// password check against brute force. In-memory, so it is per server
// instance - good enough for a single Node process; swap for Redis if the
// API is ever scaled horizontally.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const attemptsByUser = new Map<string, number[]>();

const isRateLimited = (userId: string): boolean => {
  const now = Date.now();
  const recent = (attemptsByUser.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  recent.push(now);
  attemptsByUser.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX_ATTEMPTS;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
};

export type AccountDeletionCounts = Record<string, number>;

/**
 * Hard-deletes a user and every document they own. Nothing is soft-deleted
 * or anonymised: documents are physically removed.
 *
 * Runs inside the given session's transaction when one is passed, so either
 * everything goes or nothing does. Operations run sequentially because a
 * MongoDB transaction does not support concurrent operations on one session.
 */
export const hardDeleteUserData = async (
  user: { _id: Types.ObjectId; phoneNumber?: string; email?: string },
  session?: ClientSession,
): Promise<AccountDeletionCounts> => {
  const userId = user._id;
  const opts = session ? { session } : {};
  const counts: AccountDeletionCounts = {};

  // Tournaments the user organised, plus every team and fixture in them
  // (matched by tournament id too, in case an older child doc has a
  // different organizer value).
  const tournamentIds = (
    await Tournament.find({ organizer: userId }, { _id: 1 }, opts).lean()
  ).map((tournament) => tournament._id);
  const inUsersTournaments = {
    $or: [{ organizer: userId }, { tournament: { $in: tournamentIds } }],
  };

  counts.tournamentMatches = (
    await TournamentMatch.deleteMany(inUsersTournaments, opts)
  ).deletedCount;
  counts.tournamentTeams = (
    await TournamentTeam.deleteMany(inUsersTournaments, opts)
  ).deletedCount;
  counts.tournaments = (
    await Tournament.deleteMany({ organizer: userId }, opts)
  ).deletedCount;

  // Team library, the player profiles the user created, and players.
  counts.savedPlayerTeams = (
    await SavedPlayerTeam.deleteMany({ owner: userId }, opts)
  ).deletedCount;
  counts.playerIdentities = (
    await PlayerIdentity.deleteMany({ createdBy: userId }, opts)
  ).deletedCount;
  counts.players = (await Player.deleteMany({ user: userId }, opts))
    .deletedCount;

  // Saved matches / match history.
  counts.savedMatches = (await SavedMatch.deleteMany({ user: userId }, opts))
    .deletedCount;

  // Analytics: every event tied to the user, plus every event from the
  // browser/app sessions they were signed in on (so anonymous page views
  // from those same sessions don't linger either).
  const sessionIds = (
    await AnalyticsEvent.distinct("sessionId", { userId }).session(
      session ?? null,
    )
  ).filter(
    (sessionId): sessionId is string =>
      typeof sessionId === "string" && sessionId.length > 0,
  );
  counts.analyticsEvents = (
    await AnalyticsEvent.deleteMany(
      {
        $or: [
          { userId },
          ...(sessionIds.length ? [{ sessionId: { $in: sessionIds } }] : []),
        ],
      },
      opts,
    )
  ).deletedCount;

  // Pending OTP codes for the user's phone number.
  counts.otpVerifications = user.phoneNumber
    ? (await OtpVerification.deleteMany({ phoneNumber: user.phoneNumber }, opts))
        .deletedCount
    : 0;

  // Email verification / password reset codes.
  counts.emailOtps = user.email
    ? (await EmailOtp.deleteMany({ email: user.email }, opts)).deletedCount
    : 0;

  // The user record itself goes last.
  counts.users = (await User.deleteOne({ _id: userId }, opts)).deletedCount;

  return counts;
};

const isTransactionUnsupported = (error: unknown): boolean => {
  const err = error as { code?: number; codeName?: string; message?: string };
  return (
    err?.code === 20 || // IllegalOperation: standalone server, no replica set
    err?.codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed|replica set/i.test(err?.message ?? "")
  );
};

/**
 * DELETE /api/v1/auth/account
 * Body: { confirmation: "DELETE", password?: string }
 * See docs/delete-account-api.md in the web app repo.
 */
export const deleteAccount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // Authenticate here rather than via requireAuth so a retry after a
  // successful delete (e.g. the response was lost on a flaky connection)
  // gets 200 instead of 401 - requireAuth rejects tokens whose user no
  // longer exists.
  const token = getBearerToken(req);
  const verification =
    token && process.env.JWT_SECRET ? verifyTokenWithRefresh(token) : null;
  if (!verification || verification.status !== "valid") {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const userId = verification.userId;
  if (!Types.ObjectId.isValid(userId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (req.body?.confirmation !== DELETE_ACCOUNT_CONFIRMATION) {
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
    const user = await User.findById(userId).select(
      "+password +appleRefreshToken",
    );
    if (!user) {
      // Already deleted - idempotent success.
      res.status(200).json({ deleted: true });
      return;
    }

    if (user.password) {
      const password = req.body?.password;
      const passwordMatches =
        typeof password === "string" &&
        password.length > 0 &&
        (await bcrypt.compare(password, user.password));
      if (!passwordMatches) {
        // 403, not 401: the client treats 401 as "access token expired".
        res.status(403).json({
          message:
            typeof password === "string" && password
              ? "Incorrect password."
              : "Enter your password to delete your account.",
        });
        return;
      }
    }

    // Sign in with Apple: revoke the user's Apple token so the app is
    // unlinked from their Apple ID (App Store Guideline 5.1.1(v)). Best
    // effort - never block deletion on Apple being reachable.
    let appleTokenRevoked: boolean | undefined;
    if (user.appleRefreshToken) {
      appleTokenRevoked = await revokeAppleToken(user.appleRefreshToken);
    }

    const target = {
      _id: user._id as Types.ObjectId,
      phoneNumber: user.phoneNumber,
      email: user.email,
    };

    let counts: AccountDeletionCounts;
    try {
      counts = await mongoose.connection.transaction((session) =>
        hardDeleteUserData(target, session),
      );
    } catch (error) {
      if (!isTransactionUnsupported(error)) throw error;
      // Local standalone MongoDB (no replica set) can't run transactions.
      // Fall back to sequential deletes; the user doc is deleted last, so
      // a failure part-way can simply be retried.
      counts = await hardDeleteUserData(target);
    }

    attemptsByUser.delete(userId);
    // Audit log: id and counts only - never email, name or password.
    console.info("Account deleted", {
      userId,
      ...counts,
      ...(appleTokenRevoked !== undefined ? { appleTokenRevoked } : {}),
    });

    res.status(200).json({ deleted: true });
  } catch (error) {
    console.error("Delete account error", {
      userId,
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      message: "We couldn't delete your account. Please try again.",
    });
  }
};
