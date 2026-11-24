"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerIdentity = exports.PLAYER_VISIBILITIES = void 0;
const mongoose_1 = require("mongoose");
exports.PLAYER_VISIBILITIES = ["public", "hidden"];
const playerIdentitySchema = new mongoose_1.Schema({
    createdBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    username: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        index: true,
    },
    role: {
        type: String,
        trim: true,
    },
    contactNumber: {
        type: String,
        trim: true,
    },
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
    },
    claimedAt: { type: Date },
    city: { type: String, trim: true },
    battingStyle: { type: String, trim: true },
    bowlingStyle: { type: String, trim: true },
    visibility: {
        type: String,
        enum: exports.PLAYER_VISIBILITIES,
        default: "public",
    },
    avatarData: { type: String, select: false },
    avatarVersion: { type: Number, default: 0 },
    mergedInto: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "PlayerIdentity",
    },
    suspendedAt: { type: Date },
    visibilityBeforeSuspension: { type: String, enum: exports.PLAYER_VISIBILITIES },
}, { timestamps: true });
playerIdentitySchema.index({ name: "text", username: "text" });
// One player profile per user account.
playerIdentitySchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: "objectId" } } });
exports.PlayerIdentity = (0, mongoose_1.model)("PlayerIdentity", playerIdentitySchema);
//# sourceMappingURL=PlayerIdentity.js.map