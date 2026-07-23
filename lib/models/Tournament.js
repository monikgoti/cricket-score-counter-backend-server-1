"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tournament = exports.TOURNAMENT_SQUAD_MODES = exports.TOURNAMENT_STATUSES = exports.BALL_TYPES = exports.TOURNAMENT_FORMATS = void 0;
const mongoose_1 = require("mongoose");
exports.TOURNAMENT_FORMATS = ["league", "knockout"];
exports.BALL_TYPES = ["tennis", "leather", "custom"];
exports.TOURNAMENT_STATUSES = ["draft", "active", "completed"];
exports.TOURNAMENT_SQUAD_MODES = ["teams_only", "with_players"];
const tournamentSchema = new mongoose_1.Schema({
    organizer: {
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
    organizerName: {
        type: String,
        required: true,
        trim: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    location: {
        type: String,
        required: true,
        trim: true,
    },
    logoUrl: {
        type: String,
        trim: true,
    },
    ballType: {
        type: String,
        enum: exports.BALL_TYPES,
        required: true,
    },
    customBallType: {
        type: String,
        trim: true,
    },
    oversPerMatch: {
        type: Number,
        required: true,
        min: 1,
        max: 100,
    },
    format: {
        type: String,
        enum: exports.TOURNAMENT_FORMATS,
        required: true,
    },
    squadMode: {
        type: String,
        enum: exports.TOURNAMENT_SQUAD_MODES,
        default: "teams_only",
    },
    status: {
        type: String,
        enum: exports.TOURNAMENT_STATUSES,
        default: "draft",
    },
}, {
    timestamps: true,
});
tournamentSchema.index({ organizer: 1, createdAt: -1 });
exports.Tournament = (0, mongoose_1.model)("Tournament", tournamentSchema);
//# sourceMappingURL=Tournament.js.map