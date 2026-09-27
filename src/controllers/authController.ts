import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { OtpVerification } from "../models/OtpVerification";
import { User } from "../models/User";
import { trackEvent } from "../utils/analytics";
import {
  createRefreshToken,
  createToken,
  verifyRefreshToken,
} from "../utils/jwt";

const normalizeEmail = (email: unknown): string | null => {
  if (typeof email !== "string") {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  return normalizedEmail.length > 0 ? normalizedEmail : null;
};

const isStrongEnoughPassword = (password: unknown): password is string => {
  return typeof password === "string" && password.length >= 6;
};

const normalizePhoneNumber = (phoneNumber: unknown): string | null => {
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

const serializeUser = (user: {
  _id: unknown;
  name: string;
  email?: string;
  password?: string;
  phoneNumber?: string;
  authProvider?: string;
  avatarUrl?: string;
}) => ({
  id: String(user._id),
  name: user.name,
  email: user.email ?? "",
  phoneNumber: user.phoneNumber ?? "",
  authProvider: user.authProvider ?? "password",
  avatarUrl: user.avatarUrl ?? "",
  hasPassword: Boolean(user.password),
});

const createAuthResponse = (
  message: string,
  user: {
    _id: unknown;
    name: string;
    email?: string;
    password?: string;
    phoneNumber?: string;
    authProvider?: string;
    avatarUrl?: string;
  },
) => {
  const userId = String(user._id);
  const accessToken = createToken(userId);
  const refreshToken = createRefreshToken(userId);

  return {
    message,
    token: accessToken,
    accessToken,
    refreshToken,
    user: serializeUser(user),
  };
};

type GoogleTokenInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  error?: string;
  error_description?: string;
};

class AuthProviderError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const verifyGoogleIdToken = async (
  idToken: string,
): Promise<GoogleTokenInfo | null> => {
  const googleClientIds = (process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((clientId) => clientId.trim())
    .filter(Boolean);
  if (!googleClientIds.length) {
    throw new AuthProviderError("GOOGLE_CLIENT_ID is required", 500);
  }

  let response: globalThis.Response;
  try {
    response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        idToken,
      )}`,
    );
  } catch (error) {
    throw new AuthProviderError(
      "Unable to reach Google token verification",
      502,
    );
  }
  const tokenInfo = (await response
    .json()
    .catch(() => ({}))) as GoogleTokenInfo;

  if (!response.ok || tokenInfo.error) {
    return null;
  }
  if (
    !tokenInfo.aud ||
    !googleClientIds.includes(tokenInfo.aud) ||
    !tokenInfo.sub ||
    !tokenInfo.email
  ) {
    return null;
  }

  return tokenInfo;
};

const generateOtp = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!name || !email || !isStrongEnoughPassword(password)) {
      res.status(400).json({
        message:
          "Name, valid email, and password with 6+ characters are required",
      });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ message: "User already exists" });
      return;
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      authProvider: "password",
    });

    trackEvent(req, {
      type: "USER_SIGNUP",
      userId: String(user._id),
      metadata: { provider: "password" },
    });

    res.status(201).json(createAuthResponse("Signup successful", user));
  } catch (error) {
    console.error("Signup error", error);
    res.status(500).json({ message: "Unable to signup" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || typeof password !== "string") {
      res.status(400).json({
        message: "Email and password are required",
      });
      return;
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      res.status(401).json({
        message: "Invalid email or password",
      });
      return;
    }

    // User registered only with Google
    if (!user.password) {
      res.status(400).json({
        message:
          "This account was created using Google Sign-In. Please continue with Google or set a password to enable email login.",
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      res.status(401).json({
        message: "Invalid email or password",
      });
      return;
    }

    trackEvent(req, {
      type: "USER_LOGIN",
      userId: String(user._id),
      metadata: { provider: "password" },
    });

    res.status(200).json(createAuthResponse("Login successful", user));
  } catch (error) {
    console.error("Login error", error);
    res.status(500).json({
      message: "Unable to login",
    });
  }
};

export const googleLogin = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const idToken =
      typeof req.body?.idToken === "string"
        ? req.body.idToken
        : typeof req.body?.credential === "string"
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

    let user = await User.findOne({
      $or: [{ googleId: tokenInfo.sub }, { email }],
    }).select("+password");
    let isNewUser = false;

    if (!user) {
      // First-time Google signup
      isNewUser = true;
      user = await User.create({
        name: tokenInfo.name || email.split("@")[0],
        email,
        googleId: tokenInfo.sub,
        avatarUrl: tokenInfo.picture,
        authProvider: "google",
      });
    } else {
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

    trackEvent(req, {
      type: isNewUser ? "USER_SIGNUP" : "USER_LOGIN",
      userId: String(user._id),
      metadata: { provider: "google" },
    });

    res.status(200).json(createAuthResponse("Google login successful", user));
  } catch (error) {
    console.error("Google login error", error);

    if (error instanceof AuthProviderError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: "Unable to login with Google" });
  }
};

export const requestMobileOtp = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    if (!phoneNumber) {
      res.status(400).json({ message: "Valid phone number is required" });
      return;
    }

    const otp = generateOtp();
    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
    const otpHash = await bcrypt.hash(otp, saltRounds);
    const expiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await OtpVerification.findOneAndUpdate(
      { phoneNumber },
      { phoneNumber, otpHash, expiresAt, attempts: 0 },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(`OTP for ${phoneNumber}: ${otp}`);
    }

    res.status(200).json({
      message: "OTP sent",
      ...(process.env.OTP_DEBUG_RESPONSE === "true" ? { otp } : {}),
    });
  } catch (error) {
    console.error("Request mobile OTP error", error);
    res.status(500).json({ message: "Unable to send OTP" });
  }
};

export const verifyMobileOtp = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";

    if (!phoneNumber || !otp) {
      res.status(400).json({ message: "Phone number and OTP are required" });
      return;
    }

    const otpRecord = await OtpVerification.findOne({ phoneNumber }).select(
      "+otpHash",
    );
    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      res.status(401).json({ message: "Invalid or expired OTP" });
      return;
    }

    if (otpRecord.attempts >= Number(process.env.OTP_MAX_ATTEMPTS || 5)) {
      await OtpVerification.deleteOne({ _id: otpRecord._id });
      res.status(429).json({ message: "Too many OTP attempts" });
      return;
    }

    const otpMatches = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!otpMatches) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      res.status(401).json({ message: "Invalid or expired OTP" });
      return;
    }

    await OtpVerification.deleteOne({ _id: otpRecord._id });

    let user = await User.findOne({ phoneNumber });
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = await User.create({
        name: phoneNumber,
        phoneNumber,
        phoneVerifiedAt: new Date(),
        authProvider: "mobile",
      });
    } else {
      user.phoneNumber = phoneNumber;
      user.phoneVerifiedAt = new Date();
      user.authProvider = "mobile";
      await user.save();
    }

    trackEvent(req, {
      type: isNewUser ? "USER_SIGNUP" : "USER_LOGIN",
      userId: String(user._id),
      metadata: { provider: "mobile" },
    });

    res.status(200).json(createAuthResponse("Mobile login successful", user));
  } catch (error) {
    console.error("Verify mobile OTP error", error);
    res.status(500).json({ message: "Unable to verify OTP" });
  }
};

export const refreshToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";
    const refreshTokenValue =
      typeof req.body?.refreshToken === "string"
        ? req.body.refreshToken
        : typeof req.headers["x-refresh-token"] === "string"
          ? req.headers["x-refresh-token"]
          : tokenFromHeader;

    if (!refreshTokenValue) {
      res.status(400).json({ message: "Refresh token is required" });
      return;
    }

    const verification = verifyRefreshToken(refreshTokenValue);
    if (verification.status !== "valid") {
      res.status(401).json({ message: "Invalid or expired refresh token" });
      return;
    }

    const user = await User.findById(verification.userId).select("+password");
    if (!user) {
      res.status(401).json({ message: "Invalid or expired refresh token" });
      return;
    }

    res.status(200).json(createAuthResponse("Token refreshed", user));
  } catch (error) {
    console.error("Refresh token error", error);
    res.status(500).json({ message: "Unable to refresh token" });
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const newPassword = req.body?.newPassword;

    if (!email || !isStrongEnoughPassword(newPassword)) {
      res.status(400).json({
        message: "Valid email and new password with 6+ characters are required",
      });
      return;
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
    user.password = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error", error);
    res.status(500).json({ message: "Unable to reset password" });
  }
};

// Lets a user set a password on an account that has none yet (e.g. a
// Google-only signup), or change an existing password. When a password is
// already set, the caller must supply the correct currentPassword.
export const setPassword = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const newPassword = req.body?.password ?? req.body?.newPassword;
    const currentPassword = req.body?.currentPassword;

    if (!isStrongEnoughPassword(newPassword)) {
      res.status(400).json({
        message: "New password must be at least 6 characters",
      });
      return;
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!user.email) {
      res.status(400).json({
        message:
          "Add a verified email to your account (e.g. by signing in with Google) before setting a password.",
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

      const currentPasswordMatches = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!currentPasswordMatches) {
        res.status(401).json({ message: "Current password is incorrect" });
        return;
      }
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
    user.password = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    res.status(200).json({
      message: "Password set successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Set password error", error);
    res.status(500).json({ message: "Unable to set password" });
  }
};

export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ user: serializeUser(user) });
  } catch (error) {
    console.error("Get current user error", error);
    res.status(500).json({ message: "Unable to fetch current user" });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      res.status(400).json({ message: "Authorization token is required" });
      return;
    }

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error", error);
    res.status(500).json({ message: "Unable to logout" });
  }
};
