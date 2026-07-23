"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SavedMatch = void 0;
const mongoose_1 = require("mongoose");
const savedMatchSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    clientMatchId: {
        type: String,
        required: true,
        trim: true,
    },
    teams: {
        type: [String],
        default: [],
    },
    status: {
        type: String,
        enum: ["in_progress", "completed"],
        default: "in_progress",
        index: true,
    },
    resultText: {
        type: String,
        default: "",
        trim: true,
    },
    snapshot: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
    },
    savedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, {
    timestamps: true,
});
savedMatchSchema.index({ user: 1, clientMatchId: 1 }, { unique: true });
exports.SavedMatch = (0, mongoose_1.model)("SavedMatch", savedMatchSchema);
//# sourceMappingURL=SavedMatch.js.map