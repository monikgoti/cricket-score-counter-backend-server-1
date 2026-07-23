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
