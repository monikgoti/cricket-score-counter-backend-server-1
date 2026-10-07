"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = exports.AUTH_PROVIDERS = void 0;
const mongoose_1 = require("mongoose");
exports.AUTH_PROVIDERS = ["password", "google", "mobile", "apple"];
const userSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    password: {
        type: String,
        minlength: 6,
        select: false,
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        index: true,
    },
    appleId: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        index: true,
    },
    appleRefreshToken: {
        type: String,
        select: false,
    },
    phoneNumber: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        index: true,
    },
    phoneVerifiedAt: {
        type: Date,
    },
    emailVerified: {
        type: Boolean,
    },
    emailVerifiedAt: {
        type: Date,
    },
    authProvider: {
        type: String,
        enum: exports.AUTH_PROVIDERS,
        default: "password",
        required: true,
    },
    avatarUrl: {
        type: String,
        trim: true,
    },
}, {
    timestamps: true,
});
exports.User = (0, mongoose_1.model)("User", userSchema);
//# sourceMappingURL=User.js.map