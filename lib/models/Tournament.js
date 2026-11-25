"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tournament = exports.TOURNAMENT_VISIBILITIES = exports.TOURNAMENT_SQUAD_MODES = exports.TOURNAMENT_STATUSES = exports.BALL_TYPES = exports.TOURNAMENT_FORMATS = void 0;
const mongoose_1 = require("mongoose");
exports.TOURNAMENT_FORMATS = ["league", "knockout"];
exports.BALL_TYPES = ["tennis", "leather", "custom"];
exports.TOURNAMENT_STATUSES = ["draft", "active", "completed"];
exports.TOURNAMENT_SQUAD_MODES = ["teams_only", "with_players"];
/**
 * public   – listed on the explore page; anyone can view teams, points
 *            table, matches and stats.
 * unlisted – anyone with the link can view, but it isn't listed.
 * private  – only the organizer and the registered players in its squads.
 *            Its matches are also left out of player stats shown to others.
 */
exports.TOURNAMENT_VISIBILITIES = ["public", "unlisted", "private"];
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
    logoData: { type: String, select: false },
    logoVersion: { type: Number, default: 0 },
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
    visibility: {
        type: String,
        enum: exports.TOURNAMENT_VISIBILITIES,
        default: "public",
    },
}, {
    timestamps: true,
});
tournamentSchema.index({ organizer: 1, createdAt: -1 });
tournamentSchema.index({ visibility: 1, startDate: -1 });
exports.Tournament = (0, mongoose_1.model)("Tournament", tournamentSchema);
//# sourceMappingURL=Tournament.js.map