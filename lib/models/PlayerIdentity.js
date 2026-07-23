"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerIdentity = void 0;
const mongoose_1 = require("mongoose");
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
}, { timestamps: true });
playerIdentitySchema.index({ name: "text", username: "text" });
exports.PlayerIdentity = (0, mongoose_1.model)("PlayerIdentity", playerIdentitySchema);
//# sourceMappingURL=PlayerIdentity.js.map