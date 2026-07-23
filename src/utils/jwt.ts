import jwt, {
  TokenExpiredError,
  type Secret,
  type SignOptions,
} from "jsonwebtoken";

type JwtPayloadWithUser = jwt.JwtPayload & {
  userId?: string;
  tokenType?: "access" | "refresh";
};

export type TokenVerificationResult =
  | {
      status: "valid";
      userId: string;
      refreshedToken?: string;
    }
  | {
      status: "invalid";
    };

const getJwtSecret = (): Secret => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required");
  }

  return jwtSecret;
};

export const createToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ||
      "7d") as SignOptions["expiresIn"],
  };

  return jwt.sign({ userId, tokenType: "access" }, getJwtSecret(), options);
};

export const createRefreshToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ||
      "30d") as SignOptions["expiresIn"],
  };

  return jwt.sign({ userId, tokenType: "refresh" }, getJwtSecret(), options);
};

const getRefreshGraceSeconds = (): number => {
  const configuredDays = Number(process.env.JWT_REFRESH_GRACE_DAYS || 30);
  const days = Number.isFinite(configuredDays) && configuredDays > 0
    ? configuredDays
    : 30;

  return days * 24 * 60 * 60;
};

const getUserIdFromDecodedToken = (decoded: unknown): string | null => {
  if (!decoded || typeof decoded !== "object") {
    return null;
  }

  const userId = (decoded as JwtPayloadWithUser).userId;
  return typeof userId === "string" && userId ? userId : null;
};

const getTokenTypeFromDecodedToken = (
  decoded: unknown,
): "access" | "refresh" | null => {
  if (!decoded || typeof decoded !== "object") {
    return null;
  }

  const tokenType = (decoded as JwtPayloadWithUser).tokenType;
  return tokenType === "access" || tokenType === "refresh" ? tokenType : null;
};

export const verifyTokenWithRefresh = (token: string): TokenVerificationResult => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = getUserIdFromDecodedToken(decoded);
    const tokenType = getTokenTypeFromDecodedToken(decoded);
    return userId && tokenType !== "refresh"
      ? { status: "valid", userId }
      : { status: "invalid" };
  } catch (error) {
    if (!(error instanceof TokenExpiredError)) {
      return { status: "invalid" };
    }

    const decoded = jwt.verify(token, getJwtSecret(), {
      ignoreExpiration: true,
    });
    const userId = getUserIdFromDecodedToken(decoded);
    const expiresAt = (decoded as JwtPayloadWithUser)?.exp;
    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (
      !userId ||
      typeof expiresAt !== "number" ||
      nowInSeconds - expiresAt > getRefreshGraceSeconds()
    ) {
      return { status: "invalid" };
    }

    return {
      status: "valid",
      userId,
      refreshedToken: createToken(userId),
    };
  }
};

export const verifyRefreshToken = (token: string): TokenVerificationResult => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = getUserIdFromDecodedToken(decoded);
    const tokenType = getTokenTypeFromDecodedToken(decoded);

    return userId && tokenType === "refresh"
      ? { status: "valid", userId }
      : { status: "invalid" };
  } catch (error) {
    return { status: "invalid" };
  }
};
