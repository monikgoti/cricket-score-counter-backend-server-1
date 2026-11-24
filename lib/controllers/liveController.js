"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiveMatch = void 0;
const TournamentMatch_1 = require("../models/TournamentMatch");
const Tournament_1 = require("../models/Tournament");
const TournamentTeam_1 = require("../models/TournamentTeam");
const liveCode_1 = require("../utils/liveCode");
/**
 * GET /api/v1/live/:code — public, no login.
 *
 * What a spectator needs to follow a tournament match the organizer shared:
 * names, logos, status, result and the latest saved score (updated every
 * over while it's being scored, and the final scorecard once it's done).
 * Ball-by-ball updates still come over the live socket; this is what the
 * watch page shows when the scorer isn't connected. Nothing private
 * (phone numbers, organizer account) is included.
 */
const getLiveMatch = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const code = String((_a = req.params.code) !== null && _a !== void 0 ? _a : "").trim().toUpperCase();
        if (!(0, liveCode_1.isTournamentLiveCode)(code)) {
            res.status(404).json({ message: "Match not found" });
            return;
        }
        const match = await TournamentMatch_1.TournamentMatch.findOne({ liveCode: code }).lean();
        if (!match) {
            res.status(404).json({ message: "Match not found" });
            return;
        }
        const [tournament, teams] = await Promise.all([
            Tournament_1.Tournament.findById(match.tournament).select("name logoUrl location").lean(),
            TournamentTeam_1.TournamentTeam.find({ _id: { $in: [match.team1, match.team2] } }).select("name logoUrl").lean(),
        ]);
        if (!tournament) {
            res.status(404).json({ message: "Match not found" });
            return;
        }
        const teamById = new Map(teams.map((team) => [String(team._id), team]));
        const team = (id) => {
            var _a, _b;
            const doc = id ? teamById.get(String(id)) : undefined;
            return { name: (_a = doc === null || doc === void 0 ? void 0 : doc.name) !== null && _a !== void 0 ? _a : "", logoUrl: (_b = doc === null || doc === void 0 ? void 0 : doc.logoUrl) !== null && _b !== void 0 ? _b : "" };
        };
        res.setHeader("Cache-Control", match.status === "completed" ? "public, max-age=300" : "public, max-age=15");
        res.status(200).json({
            match: {
                code,
                status: match.status,
                tournamentName: tournament.name,
                tournamentLogoUrl: (_b = tournament.logoUrl) !== null && _b !== void 0 ? _b : "",
                location: (_c = tournament.location) !== null && _c !== void 0 ? _c : "",
                team1: team(match.team1),
                team2: team(match.team2),
                winnerTeamName: match.winnerTeam ? team(match.winnerTeam).name : "",
                resultText: (_d = match.resultText) !== null && _d !== void 0 ? _d : "",
                snapshot: (_e = match.snapshot) !== null && _e !== void 0 ? _e : null,
                startedAt: (_f = match.startedAt) !== null && _f !== void 0 ? _f : null,
                completedAt: (_g = match.completedAt) !== null && _g !== void 0 ? _g : null,
                updatedAt: match.updatedAt,
            },
        });
    }
    catch (error) {
        console.error("getLiveMatch failed", error);
        res.status(500).json({ message: "Unable to load match" });
    }
};
exports.getLiveMatch = getLiveMatch;
//# sourceMappingURL=liveController.js.map