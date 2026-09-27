import type { NextFunction, Request, Response } from "express";
import { User } from "../models/User";
import { verifyTokenWithRefresh } from "../utils/jwt";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    phoneNumber?: string;
  };
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token || !process.env.JWT_SECRET) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const verification = verifyTokenWithRefresh(token);
    if (verification.status !== "valid") {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (verification.refreshedToken) {
      res.setHeader("X-Access-Token", verification.refreshedToken);
      res.setHeader("Access-Control-Expose-Headers", "X-Access-Token");
    }

    const user = await User.findById(verification.userId);
    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email ?? "",
      phoneNumber: user.phoneNumber,
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
  }
};

// Attaches req.user when a valid token is present, but never rejects the
// request -- used for endpoints (like analytics tracking) that should work
// for both logged-in and anonymous callers.
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token || !process.env.JWT_SECRET) {
      next();
      return;
    }

    const verification = verifyTokenWithRefresh(token);
    if (verification.status !== "valid") {
      next();
      return;
    }

    const user = await User.findById(verification.userId);
    if (user) {
      req.user = {
        id: String(user._id),
        name: user.name,
        email: user.email ?? "",
        phoneNumber: user.phoneNumber,
      };
    }
    next();
  } catch (error) {
    next();
  }
};

// Restricts an already-authenticated request (mount after requireAuth) to a
// small allowlist of admin emails, configurable via ADMIN_EMAILS
// (comma-separated, falling back to the older ANALYTICS_ADMIN_EMAILS name)
// so it can be changed without a code deploy. Generic on purpose -- it now
// gates more than just analytics endpoints (e.g. the promo banner admin
// routes).
const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ||
  process.env.ANALYTICS_ADMIN_EMAILS ||
  "gotimonik@gmail.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  const email = req.user?.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  next();
};

// Back-compat alias -- analytics routes were the first admin-gated
// endpoints and already import this name; keep it working unchanged.
export const requireAnalyticsAdmin = requireAdmin;
