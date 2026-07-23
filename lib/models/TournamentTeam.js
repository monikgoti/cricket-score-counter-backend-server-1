"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentTeam = void 0;
const mongoose_1 = require("mongoose");
const playerSchema = new mongoose_1.Schema({
    playerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "PlayerIdentity",
        index: true,
    },
    username: {
        type: String,
        trim: true,
        lowercase: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    role: {
        type: String,
        trim: true,
    },
    contactNumber: {
        type: String,
        trim: true,
    },
    statistics: {
        matchesPlayed: { type: Number, default: 0, min: 0 },
        runs: { type: Number, default: 0, min: 0 },
        ballsFaced: { type: Number, default: 0, min: 0 },
        fours: { type: Number, default: 0, min: 0 },
        sixes: { type: Number, default: 0, min: 0 },
        wickets: { type: Number, default: 0, min: 0 },
        ballsBowled: { type: Number, default: 0, min: 0 },
        runsConceded: { type: Number, default: 0, min: 0 },
    },
}, {
    _id: true,
});
const statisticsSchema = new mongoose_1.Schema({
    matchesPlayed: { type: Number, default: 0, min: 0 },
    wins: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    ties: { type: Number, default: 0, min: 0 },
    noResults: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0 },
    runsFor: { type: Number, default: 0, min: 0 },
    runsAgainst: { type: Number, default: 0, min: 0 },
    wicketsTaken: { type: Number, default: 0, min: 0 },
    wicketsLost: { type: Number, default: 0, min: 0 },
    ballsFaced: { type: Number, default: 0, min: 0 },
    ballsBowled: { type: Number, default: 0, min: 0 },
    netRunRate: { type: Number, default: 0 },
}, {
    _id: false,
});
const tournamentTeamSchema = new mongoose_1.Schema({
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
    sourceTeamId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "SavedPlayerTeam",
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    logoUrl: {
        type: String,
        trim: true,
    },
    captainName: {
        type: String,
        required: true,
        trim: true,
    },
    contactNumber: {
        type: String,
        required: true,
        trim: true,
    },
    players: {
        type: [playerSchema],
        default: [],
    },
    statistics: {
        type: statisticsSchema,
        default: () => ({}),
    },
}, {
    timestamps: true,
});
tournamentTeamSchema.index({ tournament: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
exports.TournamentTeam = (0, mongoose_1.model)("TournamentTeam", tournamentTeamSchema);
//# sourceMappingURL=TournamentTeam.js.map