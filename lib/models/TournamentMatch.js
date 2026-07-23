"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentMatch = exports.TOURNAMENT_MATCH_STATUSES = void 0;
const mongoose_1 = require("mongoose");
exports.TOURNAMENT_MATCH_STATUSES = [
    "scheduled",
    "in_progress",
    "completed",
];
const tournamentMatchSchema = new mongoose_1.Schema({
    tournament: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Tournament",
        required: true,
        index: true,
    },
    organizer: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    team1: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "TournamentTeam",
        required: true,
    },
    team2: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "TournamentTeam",
        required: true,
    },
    pairKey: {
        type: String,
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: exports.TOURNAMENT_MATCH_STATUSES,
        default: "scheduled",
    },
    tossWinnerTeam: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "TournamentTeam",
    },
    tossDecision: {
        type: String,
        enum: ["bat", "bowl"],
    },
    battingFirstTeam: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "TournamentTeam",
    },
    winnerTeam: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "TournamentTeam",
    },
    resultText: {
        type: String,
        trim: true,
    },
    scorerMatchId: {
        type: String,
        trim: true,
    },
    snapshot: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    startedAt: {
        type: Date,
    },
    completedAt: {
        type: Date,
    },
}, {
    timestamps: true,
});
tournamentMatchSchema.index({ tournament: 1, pairKey: 1, status: 1 });
tournamentMatchSchema.index({ tournament: 1, createdAt: -1 });
exports.TournamentMatch = (0, mongoose_1.model)("TournamentMatch", tournamentMatchSchema);
//# sourceMappingURL=TournamentMatch.js.map