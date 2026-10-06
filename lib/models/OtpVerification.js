"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpVerification = void 0;
const mongoose_1 = require("mongoose");
const otpVerificationSchema = new mongoose_1.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
    },
    otpHash: {
        type: String,
        required: true,
        select: false,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
    attempts: {
        type: Number,
        default: 0,
        min: 0,
    },
    codeExpiresAt: { type: Date },
    lastSentAt: { type: Date },
    sendCount: { type: Number, default: 0, min: 0 },
    sendWindowStartedAt: { type: Date },
}, {
    timestamps: true,
});
exports.OtpVerification = (0, mongoose_1.model)("OtpVerification", otpVerificationSchema);
//# sourceMappingURL=OtpVerification.js.map