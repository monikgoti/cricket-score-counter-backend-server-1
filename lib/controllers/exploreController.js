"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicTournamentPlayerStats = exports.getPublicTournamentScorecard = exports.getPublicTournament = exports.exploreTournaments = exports.explorePlayers = void 0;
const mongoose_1 = require("mongoose");
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const Tournament_1 = require("../models/Tournament");
const TournamentMatch_1 = require("../models/TournamentMatch");
const TournamentTeam_1 = require("../models/TournamentTeam");
const matchStats_1 = require("../utils/matchStats");
const pagination_1 = require("../utils/pagination");
const players_1 = require("../utils/players");
const visibility_1 = require("../utils/visibility");
const playerStatsController_1 = require("./playerStatsController");
// Everything here works without logging in. When a token is sent, private
// tournaments open for their organizer and the players in their squads.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const oid = (value) => typeof value === "string" && mongoose_1.Types.ObjectId.isValid(value) ? new mongoose_1.Types.ObjectId(value) : null;
const publicCache = (res, viewerId, seconds) => res.setHeader("Cache-Control", viewerId ? `private, max-age=${Math.min(seconds, 30)}` : `public, max-age=${seconds}`);
// ---------------------------------------------------------------- players
/**
 * GET /api/v1/explore/players?q=&page=&limit=
 * Registered public profiles. An unlisted profile only shows up when `q` is
 * its exact username (someone who already knows it).
 */
const explorePlayers = async (req, res) => {
    var _a, _b;
    try {
        const q = text(req.query.q, 60);
        const pagination = (0, pagination_1.parsePagination)(req.query, { limit: 24 });
        const base = {
            user: { $exists: true },
            mergedInto: { $exists: false },
            suspendedAt: { $exists: false },
        };
        let filter = Object.assign(Object.assign({}, base), { visibility: { $in: ["public", null] } });
        if (q.length >= 2) {
            const pattern = new RegExp(escapeRegExp(q), "i");
            filter = {
                $or: [
                    Object.assign(Object.assign({}, filter), { $or: [{ name: pattern }, { username: pattern }, { city: pattern }] }),
                    Object.assign(Object.assign({}, base), { visibility: "unlisted", username: q.toLowerCase().replace(/^@/, "") }),
                ],
            };
        }
        const [total, players] = await Promise.all([
            PlayerIdentity_1.PlayerIdentity.countDocuments(filter),
            PlayerIdentity_1.PlayerIdentity.find(filter)
                // No search: newest profiles first (the "latest" list on Explore).
                .sort(q ? { name: 1 } : { createdAt: -1 })
                .skip(pagination.skip)
                .limit(pagination.limit)
                .lean(),
        ]);
        publicCache(res, (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null, 60);
        res.status(200).json({
            players: players.map((p) => (0, players_1.serializePublicPlayer)(p)),
            pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
        });
    }
    catch (error) {
        console.error("explorePlayers failed", error);
        res.status(500).json({ message: "Unable to load players" });
    }
};
exports.explorePlayers = explorePlayers;
// ---------------------------------------------------------------- tournaments
const tournamentSummary = (t) => {
    var _a;
    return ({
        id: String(t._id),
        name: t.name,
        organizerName: t.organizerName,
        location: t.location,
        startDate: t.startDate,
        endDate: t.endDate,
        logoUrl: (_a = t.logoUrl) !== null && _a !== void 0 ? _a : "",
        status: t.status,
        format: t.format,
        ballType: t.ballType === "custom" ? t.customBallType || "custom" : t.ballType,
        oversPerMatch: t.oversPerMatch,
        visibility: (0, visibility_1.tournamentVisibilityOf)(t),
    });
};
/** GET /api/v1/explore/tournaments?q=&status=&page=&limit= — public tournaments only. */
const exploreTournaments = async (req, res) => {
    var _a, _b;
    try {
        const q = text(req.query.q, 60);
        const pagination = (0, pagination_1.parsePagination)(req.query, { limit: 20 });
        // Tournaments saved before visibility existed have no value and count as public.
        const filter = { visibility: { $in: ["public", null] } };
        if (Tournament_1.TOURNAMENT_STATUSES.includes(String(req.query.status))) {
            filter.status = req.query.status;
        }
        else {
            // Drafts usually have no teams or matches yet: keep them off the list.
            filter.status = { $ne: "draft" };
        }
        if (q.length >= 2) {
            const pattern = new RegExp(escapeRegExp(q), "i");
            filter.$or = [{ name: pattern }, { location: pattern }, { organizerName: pattern }];
        }
        const [total, tournaments] = await Promise.all([
            Tournament_1.Tournament.countDocuments(filter),
            Tournament_1.Tournament.find(filter)
                .select("name organizerName location startDate endDate logoUrl status format ballType customBallType oversPerMatch visibility")
                // No search: newest tournaments first; a search groups by status.
                .sort(q.length >= 2 ? { status: 1, startDate: -1 } : { createdAt: -1 })
                .skip(pagination.skip)
                .limit(pagination.limit)
                .lean(),
        ]);
        const ids = tournaments.map((t) => t._id);
        const [teamCounts, matchCounts] = await Promise.all([
            TournamentTeam_1.TournamentTeam.aggregate([{ $match: { tournament: { $in: ids } } }, { $group: { _id: "$tournament", n: { $sum: 1 } } }]),
            TournamentMatch_1.TournamentMatch.aggregate([
                { $match: { tournament: { $in: ids }, status: "completed" } },
                { $group: { _id: "$tournament", n: { $sum: 1 } } },
            ]),
        ]);
        const teamsBy = new Map(teamCounts.map((c) => [String(c._id), c.n]));
        const matchesBy = new Map(matchCounts.map((c) => [String(c._id), c.n]));
        publicCache(res, (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null, 60);
        res.status(200).json({
            tournaments: tournaments.map((t) => {
                var _a, _b;
                return (Object.assign(Object.assign({}, tournamentSummary(t)), { teamsCount: (_a = teamsBy.get(String(t._id))) !== null && _a !== void 0 ? _a : 0, matchesCompleted: (_b = matchesBy.get(String(t._id))) !== null && _b !== void 0 ? _b : 0 }));
            }),
            pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
        });
    }
    catch (error) {
        console.error("exploreTournaments failed", error);
        res.status(500).json({ message: "Unable to load tournaments" });
    }
};
exports.exploreTournaments = exploreTournaments;
/** Loads a tournament the viewer may see, or answers 404 (never reveals private ones). */
const loadViewableTournament = async (req, res) => {
    var _a;
    const id = oid(req.params.tournamentId);
    const tournament = id ? await Tournament_1.Tournament.findById(id).lean() : null;
    if (!tournament || !(await (0, visibility_1.canViewTournament)(tournament, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id))) {
        res.status(404).json({ message: "This tournament doesn't exist or is private." });
        return null;
    }
    return tournament;
};
const inningsSummary = (innings) => innings.map((i) => ({
    team: i.battingTeam,
    runs: i.runs,
    wickets: i.wickets,
    overs: (0, matchStats_1.formatOvers)(i.legalBalls, i.ballsPerOver),
}));
/**
 * GET /api/v1/explore/tournaments/:tournamentId
 * Overview, points table, squads and match results. No phone numbers, and
 * squad links only to players whose profiles aren't hidden.
 */
const getPublicTournament = async (req, res) => {
    var _a, _b;
    try {
        const tournament = await loadViewableTournament(req, res);
        if (!tournament)
            return;
        const viewerId = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
        const [teams, matches] = await Promise.all([
            TournamentTeam_1.TournamentTeam.find({ tournament: tournament._id })
                .sort({ "statistics.points": -1, "statistics.netRunRate": -1, name: 1 })
                .lean(),
            TournamentMatch_1.TournamentMatch.find({ tournament: tournament._id })
                .select("team1 team2 status winnerTeam resultText liveCode snapshot startedAt completedAt createdAt")
                .sort({ completedAt: -1, createdAt: -1 })
                .lean(),
        ]);
        const teamById = new Map(teams.map((t) => [String(t._id), t]));
        const linkedIds = teams.flatMap((t) => { var _a; return ((_a = t.players) !== null && _a !== void 0 ? _a : []).flatMap((p) => (p.playerId ? [p.playerId] : [])); });
        const profiles = await PlayerIdentity_1.PlayerIdentity.find({ _id: { $in: linkedIds }, visibility: { $ne: "hidden" }, mergedInto: { $exists: false } }).lean();
        const profileById = new Map(profiles.map((p) => [String(p._id), p]));
        publicCache(res, viewerId, 60);
        res.status(200).json({
            tournament: Object.assign(Object.assign({}, tournamentSummary(tournament)), { isOrganizer: Boolean(viewerId && String(tournament.organizer) === viewerId) }),
            pointsTable: teams.map((t, index) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                const s = ((_a = t.statistics) !== null && _a !== void 0 ? _a : {});
                return {
                    rank: index + 1,
                    teamId: String(t._id),
                    name: t.name,
                    logoUrl: (_b = t.logoUrl) !== null && _b !== void 0 ? _b : "",
                    played: (_c = s.matchesPlayed) !== null && _c !== void 0 ? _c : 0,
                    won: (_d = s.wins) !== null && _d !== void 0 ? _d : 0,
                    lost: (_e = s.losses) !== null && _e !== void 0 ? _e : 0,
                    tied: (_f = s.ties) !== null && _f !== void 0 ? _f : 0,
                    noResult: (_g = s.noResults) !== null && _g !== void 0 ? _g : 0,
                    points: (_h = s.points) !== null && _h !== void 0 ? _h : 0,
                    netRunRate: (_j = s.netRunRate) !== null && _j !== void 0 ? _j : 0,
                };
            }),
            teams: teams.map((t) => {
                var _a, _b, _c;
                return ({
                    id: String(t._id),
                    name: t.name,
                    logoUrl: (_a = t.logoUrl) !== null && _a !== void 0 ? _a : "",
                    captainName: (_b = t.captainName) !== null && _b !== void 0 ? _b : "",
                    players: ((_c = t.players) !== null && _c !== void 0 ? _c : []).map((p) => {
                        var _a;
                        const profile = p.playerId ? profileById.get(String(p.playerId)) : undefined;
                        return {
                            name: p.name,
                            role: (_a = p.role) !== null && _a !== void 0 ? _a : "",
                            player: profile ? (0, players_1.serializePublicPlayer)(profile) : null,
                        };
                    }),
                });
            }),
            matches: matches.map((m) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                const t1 = teamById.get(String(m.team1));
                const t2 = teamById.get(String(m.team2));
                const winnerName = m.winnerTeam ? (_b = (_a = teamById.get(String(m.winnerTeam))) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "" : "";
                const snapshot = m.snapshot ? (0, playerStatsController_1.resolveTournamentSnapshot)(m.snapshot, (_c = t1 === null || t1 === void 0 ? void 0 : t1.name) !== null && _c !== void 0 ? _c : "", (_d = t2 === null || t2 === void 0 ? void 0 : t2.name) !== null && _d !== void 0 ? _d : "", winnerName) : null;
                return {
                    id: String(m._id),
                    team1Id: String(m.team1),
                    team2Id: String(m.team2),
                    team1Name: (_e = t1 === null || t1 === void 0 ? void 0 : t1.name) !== null && _e !== void 0 ? _e : "",
                    team2Name: (_f = t2 === null || t2 === void 0 ? void 0 : t2.name) !== null && _f !== void 0 ? _f : "",
                    status: m.status,
                    winnerTeamId: m.winnerTeam ? String(m.winnerTeam) : "",
                    resultText: (_g = m.resultText) !== null && _g !== void 0 ? _g : "",
                    liveCode: m.status === "in_progress" ? (_h = m.liveCode) !== null && _h !== void 0 ? _h : "" : "",
                    date: (_k = (_j = m.completedAt) !== null && _j !== void 0 ? _j : m.startedAt) !== null && _k !== void 0 ? _k : m.createdAt,
                    innings: snapshot ? inningsSummary((0, matchStats_1.extractInnings)(snapshot)) : [],
                    hasScorecard: m.status === "completed" && Boolean(snapshot),
                };
            }),
        });
    }
    catch (error) {
        console.error("getPublicTournament failed", error);
        res.status(500).json({ message: "Unable to load tournament" });
    }
};
exports.getPublicTournament = getPublicTournament;
/** GET /api/v1/explore/tournaments/:tournamentId/matches/:matchId — full scorecard of a completed match. */
const getPublicTournamentScorecard = async (req, res) => {
    var _a, _b, _c, _d;
    try {
        const tournament = await loadViewableTournament(req, res);
        if (!tournament)
            return;
        const matchId = oid(req.params.matchId);
        const match = matchId
            ? await TournamentMatch_1.TournamentMatch.findOne({ _id: matchId, tournament: tournament._id, status: "completed" })
                .select("team1 team2 winnerTeam resultText snapshot completedAt")
                .lean()
            : null;
        if (!match) {
            res.status(404).json({ message: "Match not found" });
            return;
        }
        const teams = await TournamentTeam_1.TournamentTeam.find({ _id: { $in: [match.team1, match.team2] } }).select("name").lean();
        const nameOf = (id) => { var _a, _b; return (_b = (_a = teams.find((t) => String(t._id) === String(id))) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : ""; };
        const snapshot = (0, playerStatsController_1.resolveTournamentSnapshot)(match.snapshot, nameOf(match.team1), nameOf(match.team2), match.winnerTeam ? nameOf(match.winnerTeam) : "");
        // Completed matches never change, so this can be cached for a while.
        publicCache(res, (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null, 600);
        res.status(200).json({
            matchId: String(match._id),
            team1Name: nameOf(match.team1),
            team2Name: nameOf(match.team2),
            resultText: (_c = match.resultText) !== null && _c !== void 0 ? _c : "",
            date: (_d = match.completedAt) !== null && _d !== void 0 ? _d : null,
            innings: (0, matchStats_1.extractInnings)(snapshot).map((i) => (Object.assign(Object.assign({}, i), { overs: undefined, oversText: (0, matchStats_1.formatOvers)(i.legalBalls, i.ballsPerOver) }))),
        });
    }
    catch (error) {
        console.error("getPublicTournamentScorecard failed", error);
        res.status(500).json({ message: "Unable to load scorecard" });
    }
};
exports.getPublicTournamentScorecard = getPublicTournamentScorecard;
/** GET /api/v1/explore/tournaments/:tournamentId/player-stats — leaders, records and per-player figures. */
const getPublicTournamentPlayerStats = async (req, res) => {
    var _a, _b;
    try {
        const tournament = await loadViewableTournament(req, res);
        if (!tournament)
            return;
        const isOrganizer = Boolean(req.user && String(tournament.organizer) === req.user.id);
        publicCache(res, (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null, 120);
        res.status(200).json(await (0, playerStatsController_1.computeTournamentPlayerStats)(tournament._id, { forPublic: !isOrganizer }));
    }
    catch (error) {
        console.error("getPublicTournamentPlayerStats failed", error);
        res.status(500).json({ message: "Unable to load tournament stats" });
    }
};
exports.getPublicTournamentPlayerStats = getPublicTournamentPlayerStats;
//# sourceMappingURL=exploreController.js.map