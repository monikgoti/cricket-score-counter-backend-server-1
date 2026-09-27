"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatch = exports.getMatches = exports.saveMatch = void 0;
const mongoose_1 = require("mongoose");
const SavedMatch_1 = require("../models/SavedMatch");
const Tournament_1 = require("../models/Tournament");
const TournamentMatch_1 = require("../models/TournamentMatch");
const TournamentTeam_1 = require("../models/TournamentTeam");
const tournamentController_1 = require("./tournamentController");
const analytics_1 = require("../utils/analytics");
const pagination_1 = require("../utils/pagination");
const normalizeText = (value) => typeof value === "string" ? value.trim() : "";
const getMatchSortTime = (match) => {
    var _a;
    const timestamp = match.savedAt instanceof Date
        ? match.savedAt
        : match.updatedAt instanceof Date
            ? match.updatedAt
            : null;
    return (_a = timestamp === null || timestamp === void 0 ? void 0 : timestamp.getTime()) !== null && _a !== void 0 ? _a : 0;
};
const serializeMatch = (match) => {
    var _a, _b;
    return ({
        id: String(match._id),
        source: "saved",
        isTournamentMatch: false,
        clientMatchId: match.clientMatchId,
        teams: (_a = match.teams) !== null && _a !== void 0 ? _a : [],
        status: match.status,
        resultText: (_b = match.resultText) !== null && _b !== void 0 ? _b : "",
        snapshot: match.snapshot,
        savedAt: match.savedAt,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
    });
};
const serializeTournamentMatch = (match, teamById, tournamentById) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    const team1Id = String(match.team1);
    const team2Id = String(match.team2);
    const team1Name = (_b = (_a = teamById.get(team1Id)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "";
    const team2Name = (_d = (_c = teamById.get(team2Id)) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : "";
    const winnerTeamId = match.winnerTeam ? String(match.winnerTeam) : "";
    const tournamentId = String(match.tournament);
    const tournament = tournamentById.get(tournamentId);
    return {
        id: String(match._id),
        source: "tournament",
        isTournamentMatch: true,
        clientMatchId: (_e = match.scorerMatchId) !== null && _e !== void 0 ? _e : "",
        scorerMatchId: (_f = match.scorerMatchId) !== null && _f !== void 0 ? _f : "",
        tournamentId,
        tournamentName: (_g = tournament === null || tournament === void 0 ? void 0 : tournament.name) !== null && _g !== void 0 ? _g : "",
        tournamentLogoUrl: (_h = tournament === null || tournament === void 0 ? void 0 : tournament.logoUrl) !== null && _h !== void 0 ? _h : "",
        team1Id,
        team2Id,
        team1Name,
        team2Name,
        teams: [team1Name || team1Id, team2Name || team2Id],
        status: match.status,
        winnerTeamId,
        winnerTeamName: winnerTeamId ? (_k = (_j = teamById.get(winnerTeamId)) === null || _j === void 0 ? void 0 : _j.name) !== null && _k !== void 0 ? _k : "" : "",
        resultText: (_l = match.resultText) !== null && _l !== void 0 ? _l : "",
        snapshot: (_m = match.snapshot) !== null && _m !== void 0 ? _m : null,
        savedAt: (_p = (_o = match.completedAt) !== null && _o !== void 0 ? _o : match.updatedAt) !== null && _p !== void 0 ? _p : match.createdAt,
        startedAt: (_q = match.startedAt) !== null && _q !== void 0 ? _q : "",
        completedAt: (_r = match.completedAt) !== null && _r !== void 0 ? _r : "",
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
    };
};
const saveMatch = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const snapshot = (_a = req.body) === null || _a === void 0 ? void 0 : _a.snapshot;
        if (!snapshot || typeof snapshot !== "object") {
            res.status(400).json({ message: "Match snapshot is required" });
            return;
        }
        const clientMatchId = normalizeText((_b = req.body) === null || _b === void 0 ? void 0 : _b.clientMatchId) ||
            normalizeText(snapshot.gameId) ||
            `match-${Date.now()}`;
        const teams = Array.isArray((_c = req.body) === null || _c === void 0 ? void 0 : _c.teams)
            ? req.body.teams.map(normalizeText).filter(Boolean)
            : Array.isArray(snapshot.teams)
                ? ((_d = snapshot.teams) !== null && _d !== void 0 ? _d : [])
                    .map(normalizeText)
                    .filter(Boolean)
                : [];
        const status = ((_e = req.body) === null || _e === void 0 ? void 0 : _e.status) === "completed" ? "completed" : "in_progress";
        const resultText = normalizeText((_f = req.body) === null || _f === void 0 ? void 0 : _f.resultText);
        const tournamentId = normalizeText((_g = req.body) === null || _g === void 0 ? void 0 : _g.tournamentId);
        const user = new mongoose_1.Types.ObjectId(req.user.id);
        if (tournamentId) {
            if (!mongoose_1.Types.ObjectId.isValid(tournamentId)) {
                res.status(400).json({ message: "Valid tournament id is required" });
                return;
            }
            const tournamentResult = await (0, tournamentController_1.completeTournamentMatchFromSavedMatch)(req.user.id, Object.assign(Object.assign({}, req.body), { snapshot,
                clientMatchId, scorerMatchId: normalizeText((_h = req.body) === null || _h === void 0 ? void 0 : _h.scorerMatchId) || clientMatchId, teams,
                status,
                resultText }), req);
            if (!tournamentResult) {
                res.status(400).json({ message: "Unable to save tournament match" });
                return;
            }
            res.status(200).json({
                match: tournamentResult.match,
                tournamentMatch: tournamentResult.match,
                tournamentTeams: tournamentResult.teams,
                tournament: tournamentResult.tournament,
                redirectTo: tournamentResult.redirectTo,
            });
            return;
        }
        const existedBeforeSave = await SavedMatch_1.SavedMatch.exists({ user, clientMatchId });
        const match = await SavedMatch_1.SavedMatch.findOneAndUpdate({ user, clientMatchId }, {
            user,
            clientMatchId,
            teams,
            status,
            resultText,
            snapshot,
            savedAt: new Date(),
        }, { returnDocument: "after", upsert: true, setDefaultsOnInsert: true });
        if (!existedBeforeSave) {
            (0, analytics_1.trackEvent)(req, {
                type: "MATCH_STARTED",
                userId: req.user.id,
                metadata: { matchId: String(match._id), mode: "saved" },
            });
        }
        if (status === "completed") {
            (0, analytics_1.trackEvent)(req, {
                type: "MATCH_COMPLETED",
                userId: req.user.id,
                metadata: { matchId: String(match._id), mode: "saved" },
            });
        }
        res.status(200).json({
            match: serializeMatch(match),
        });
    }
    catch (error) {
        console.error("Save match error", error);
        res.status(500).json({ message: "Unable to save match" });
    }
};
exports.saveMatch = saveMatch;
const getMatches = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const user = new mongoose_1.Types.ObjectId(req.user.id);
        const [savedMatches, tournamentMatches] = await Promise.all([
            SavedMatch_1.SavedMatch.find({ user }).sort({ savedAt: -1 }),
            TournamentMatch_1.TournamentMatch.find({ organizer: user }).sort({
                completedAt: -1,
                updatedAt: -1,
                createdAt: -1,
            }),
        ]);
        const tournamentTeamIds = [
            ...new Set(tournamentMatches.flatMap((match) => [
                String(match.team1),
                String(match.team2),
                match.winnerTeam ? String(match.winnerTeam) : "",
            ])),
        ].filter(Boolean);
        const tournamentTeams = tournamentTeamIds.length
            ? await TournamentTeam_1.TournamentTeam.find({
                _id: { $in: tournamentTeamIds },
                organizer: user,
            })
            : [];
        const teamById = new Map(tournamentTeams.map((team) => [String(team._id), team]));
        const tournamentIds = [
            ...new Set(tournamentMatches.map((match) => String(match.tournament))),
        ];
        const tournaments = tournamentIds.length
            ? await Tournament_1.Tournament.find({
                _id: { $in: tournamentIds },
                organizer: user,
            })
            : [];
        const tournamentById = new Map(tournaments.map((tournament) => [String(tournament._id), tournament]));
        const matches = [
            ...savedMatches.map(serializeMatch),
            ...tournamentMatches.map((match) => serializeTournamentMatch(match, teamById, tournamentById)),
        ].sort((a, b) => getMatchSortTime(b) - getMatchSortTime(a));
        // GET /api/v1/matches?page=1&limit=20 -- page/limit are optional; a
        // caller that doesn't pass them still gets page 1 at the default limit
        // rather than everything. History is merged from two collections
        // (SavedMatch + TournamentMatch) and sorted in memory above, so unlike
        // getTournaments this can't push skip/limit down to Mongo -- both
        // collections still have to be fetched in full to sort correctly across
        // them. Pagination here only trims what's sent back to the client.
        const pagination = (0, pagination_1.parsePagination)(req.query);
        const total = matches.length;
        const pageMatches = matches.slice(pagination.skip, pagination.skip + pagination.limit);
        res.status(200).json({
            matches: pageMatches,
            pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
        });
    }
    catch (error) {
        console.error("Get matches error", error);
        res.status(500).json({ message: "Unable to load matches" });
    }
};
exports.getMatches = getMatches;
const getMatch = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const idQuery = mongoose_1.Types.ObjectId.isValid(req.params.id)
            ? [{ _id: new mongoose_1.Types.ObjectId(req.params.id) }]
            : [];
        const user = new mongoose_1.Types.ObjectId(req.user.id);
        const match = await SavedMatch_1.SavedMatch.findOne({
            user,
            $or: [...idQuery, { clientMatchId: req.params.id }],
        });
        if (match) {
            res.status(200).json({ match: serializeMatch(match) });
            return;
        }
        const tournamentMatch = await TournamentMatch_1.TournamentMatch.findOne({
            organizer: user,
            $or: [...idQuery, { scorerMatchId: req.params.id }],
        }).sort({ updatedAt: -1 });
        if (!tournamentMatch) {
            res.status(404).json({ message: "Match not found" });
            return;
        }
        const teamIds = [
            String(tournamentMatch.team1),
            String(tournamentMatch.team2),
            tournamentMatch.winnerTeam ? String(tournamentMatch.winnerTeam) : "",
        ].filter(Boolean);
        const teams = await TournamentTeam_1.TournamentTeam.find({
            _id: { $in: teamIds },
            organizer: user,
        });
        const teamById = new Map(teams.map((team) => [String(team._id), team]));
        const tournament = await Tournament_1.Tournament.findOne({
            _id: tournamentMatch.tournament,
            organizer: user,
        });
        const tournamentById = new Map(tournament ? [[String(tournament._id), tournament]] : []);
        res.status(200).json({
            match: serializeTournamentMatch(tournamentMatch, teamById, tournamentById),
        });
    }
    catch (error) {
        console.error("Get match error", error);
        res.status(500).json({ message: "Unable to load match" });
    }
};
exports.getMatch = getMatch;
//# sourceMappingURL=savedMatchController.js.map