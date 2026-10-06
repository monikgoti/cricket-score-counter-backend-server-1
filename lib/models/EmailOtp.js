"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailOtp = exports.EMAIL_OTP_PURPOSES = void 0;
const mongoose_1 = require("mongoose");
exports.EMAIL_OTP_PURPOSES = ["verify_email", "reset_password"];
const emailOtpSchema = new mongoose_1.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: exports.EMAIL_OTP_PURPOSES, required: true },
    otpHash: { type: String, required: true, select: false },
    codeExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0, min: 0 },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, default: 0, min: 0 },
    sendWindowStartedAt: { type: Date, required: true },
}, { timestamps: true });
emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
exports.EmailOtp = (0, mongoose_1.model)("EmailOtp", emailOtpSchema);
//# sourceMappingURL=EmailOtp.js.map