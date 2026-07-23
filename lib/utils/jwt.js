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
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyTokenWithRefresh = exports.createRefreshToken = exports.createToken = void 0;
const jsonwebtoken_1 = __importStar(require("jsonwebtoken"));
const getJwtSecret = () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT_SECRET is required");
    }
    return jwtSecret;
};
const createToken = (userId) => {
    const options = {
        expiresIn: (process.env.JWT_EXPIRES_IN ||
            "7d"),
    };
    return jsonwebtoken_1.default.sign({ userId, tokenType: "access" }, getJwtSecret(), options);
};
exports.createToken = createToken;
const createRefreshToken = (userId) => {
    const options = {
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ||
            "30d"),
    };
    return jsonwebtoken_1.default.sign({ userId, tokenType: "refresh" }, getJwtSecret(), options);
};
exports.createRefreshToken = createRefreshToken;
const getRefreshGraceSeconds = () => {
    const configuredDays = Number(process.env.JWT_REFRESH_GRACE_DAYS || 30);
    const days = Number.isFinite(configuredDays) && configuredDays > 0
        ? configuredDays
        : 30;
    return days * 24 * 60 * 60;
};
const getUserIdFromDecodedToken = (decoded) => {
    if (!decoded || typeof decoded !== "object") {
        return null;
    }
    const userId = decoded.userId;
    return typeof userId === "string" && userId ? userId : null;
};
const getTokenTypeFromDecodedToken = (decoded) => {
    if (!decoded || typeof decoded !== "object") {
        return null;
    }
    const tokenType = decoded.tokenType;
    return tokenType === "access" || tokenType === "refresh" ? tokenType : null;
};
const verifyTokenWithRefresh = (token) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret());
        const userId = getUserIdFromDecodedToken(decoded);
        const tokenType = getTokenTypeFromDecodedToken(decoded);
        return userId && tokenType !== "refresh"
            ? { status: "valid", userId }
            : { status: "invalid" };
    }
    catch (error) {
        if (!(error instanceof jsonwebtoken_1.TokenExpiredError)) {
            return { status: "invalid" };
        }
        const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret(), {
            ignoreExpiration: true,
        });
        const userId = getUserIdFromDecodedToken(decoded);
        const expiresAt = decoded === null || decoded === void 0 ? void 0 : decoded.exp;
        const nowInSeconds = Math.floor(Date.now() / 1000);
        if (!userId ||
            typeof expiresAt !== "number" ||
            nowInSeconds - expiresAt > getRefreshGraceSeconds()) {
            return { status: "invalid" };
        }
        return {
            status: "valid",
            userId,
            refreshedToken: (0, exports.createToken)(userId),
        };
    }
};
exports.verifyTokenWithRefresh = verifyTokenWithRefresh;
const verifyRefreshToken = (token) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret());
        const userId = getUserIdFromDecodedToken(decoded);
        const tokenType = getTokenTypeFromDecodedToken(decoded);
        return userId && tokenType === "refresh"
            ? { status: "valid", userId }
            : { status: "invalid" };
    }
    catch (error) {
        return { status: "invalid" };
    }
};
exports.verifyRefreshToken = verifyRefreshToken;
//# sourceMappingURL=jwt.js.map