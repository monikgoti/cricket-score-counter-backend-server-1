"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTournamentPlayerStats = exports.computeTournamentPlayerStats = exports.getPlayerCareerStats = exports.computePlayerCareer = exports.resolveTournamentSnapshot = void 0;
const mongoose_1 = require("mongoose");
const players_1 = require("../utils/players");
const visibility_1 = require("../utils/visibility");
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const SavedMatch_1 = require("../models/SavedMatch");
const SavedPlayerTeam_1 = require("../models/SavedPlayerTeam");
const Tournament_1 = require("../models/Tournament");
const TournamentMatch_1 = require("../models/TournamentMatch");
const TournamentTeam_1 = require("../models/TournamentTeam");
const matchStats_1 = require("../utils/matchStats");
const careerInsights_1 = require("../utils/careerInsights");
// Upper bound on friendly (saved) matches scanned for one career profile, so
// a very active scorer can't make this endpoint unboundedly expensive.
const MAX_SAVED_MATCHES = 400;
const RECENT_MATCHES_LIMIT = 30;
const LEADERBOARD_LIMIT = 10;
// Anonymous career responses are identical for everyone, so keep them briefly
// to spare the database (and Render bandwidth) when a profile link is shared.
const ANON_CACHE_MS = 60000;
const ANON_CACHE_MAX = 200;
const toObjectId = (value) => typeof value === "string" && mongoose_1.Types.ObjectId.isValid(value)
    ? new mongoose_1.Types.ObjectId(value)
    : null;
const hasTwoTeamNames = (teams) => Array.isArray(teams) &&
    teams.length >= 2 &&
    teams.slice(0, 2).every((t) => typeof t === "string" && t.trim() !== "");
/**
 * Tournament snapshots sometimes carry placeholder team names (["", ""]);
 * fill them from the match's team documents so the engine can line players
 * up with their innings. Also takes the winner from the match record, which
 * is authoritative for tournament results.
 */
const resolveTournamentSnapshot = (snapshot, team1Name, team2Name, winnerName) => {
    var _a;
    if (!snapshot || typeof snapshot !== "object")
        return null;
    const raw = snapshot;
    const events = ((_a = raw.recentEventsByTeams) !== null && _a !== void 0 ? _a : {});
    let teams = hasTwoTeamNames(raw.teams) ? raw.teams : [team1Name, team2Name];
    // Batting order: whichever team's events exist under the given names.
    if (!teams.every((t) => t in events) && [team1Name, team2Name].every((t) => t in events)) {
        teams = [team1Name, team2Name];
    }
    return Object.assign(Object.assign({}, raw), { teams, winningTeam: winnerName || (typeof raw.winningTeam === "string" ? raw.winningTeam : "") });
};
exports.resolveTournamentSnapshot = resolveTournamentSnapshot;
const toIso = (value) => value instanceof Date ? value.toISOString() : typeof value === "string" ? value : "";
/** The player's stands in their own team's innings, from their point of view. */
const partnershipsFor = (innings, teamName, playerName) => {
    const teamKey = (0, matchStats_1.normalizeName)(teamName);
    const me = (0, matchStats_1.normalizeName)(playerName);
    const inn = innings.find((i) => (0, matchStats_1.normalizeName)(i.battingTeam) === teamKey);
    if (!inn)
        return [];
    return inn.partnerships
        .filter((p) => p.runs > 0 && p.batter1 && p.batter2 && [p.batter1, p.batter2].some((b) => (0, matchStats_1.normalizeName)(b) === me))
        .map((p) => {
        const first = (0, matchStats_1.normalizeName)(p.batter1) === me;
        return {
            partner: first ? p.batter2 : p.batter1,
            wicket: p.number,
            runs: p.runs,
            balls: p.balls,
            ownRuns: first ? p.batter1Runs : p.batter2Runs,
            unbroken: p.unbroken,
        };
    });
};
/**
 * Career statistics for one player identity, across every tournament they
 * were registered in (any organizer) and every completed friendly match
 * scored with a saved team that includes them.
 *
 * Matches from private tournaments are only included when the viewer owns
 * the profile, organized that tournament, or played in it.
 */
const computePlayerCareer = async (playerObjectId, viewer = {}) => {
    const rows = [];
    // ---- Tournament matches -------------------------------------------
    const playerTeams = await TournamentTeam_1.TournamentTeam.find({ "players.playerId": playerObjectId })
        .select("tournament name players")
        .lean();
    const nameInTeam = new Map();
    playerTeams.forEach((team) => {
        var _a;
        const entry = ((_a = team.players) !== null && _a !== void 0 ? _a : []).find((p) => p.playerId && String(p.playerId) === String(playerObjectId));
        if (entry)
            nameInTeam.set(String(team._id), entry.name);
    });
    const allTournamentIds = Array.from(new Set(playerTeams.map((t) => String(t.tournament))));
    const allTournaments = await Tournament_1.Tournament.find({ _id: { $in: allTournamentIds } })
        .select("name logoUrl startDate endDate status organizer visibility")
        .lean();
    const allowed = viewer.isOwner
        ? new Set(allTournaments.map((t) => String(t._id)))
        : await (0, visibility_1.viewableTournamentIds)(allTournaments, viewer.userId);
    const tournaments = allTournaments.filter((t) => allowed.has(String(t._id)));
    const tournamentIds = tournaments.map((t) => t._id);
    const playerTeamIds = playerTeams.filter((t) => allowed.has(String(t.tournament))).map((t) => t._id);
    const tournamentMatches = tournamentIds.length
        ? await TournamentMatch_1.TournamentMatch.find({
            tournament: { $in: tournamentIds },
            status: "completed",
            $or: [{ team1: { $in: playerTeamIds } }, { team2: { $in: playerTeamIds } }],
        })
            .select("tournament team1 team2 winnerTeam snapshot completedAt updatedAt")
            .lean()
        : [];
    const tournamentById = new Map(tournaments.map((t) => [String(t._id), t]));
    const opponentIds = tournamentMatches.flatMap((m) => [m.team1, m.team2]);
    const allTeams = opponentIds.length
        ? await TournamentTeam_1.TournamentTeam.find({ _id: { $in: opponentIds } }).select("name").lean()
        : [];
    const teamNameById = new Map(allTeams.map((t) => [String(t._id), t.name]));
    const perTournament = new Map();
    tournamentMatches.forEach((match) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const team1Id = String(match.team1);
        const team2Id = String(match.team2);
        const ownTeamId = nameInTeam.has(team1Id) ? team1Id : nameInTeam.has(team2Id) ? team2Id : "";
        if (!ownTeamId)
            return;
        const snapshot = (0, exports.resolveTournamentSnapshot)(match.snapshot, (_a = teamNameById.get(team1Id)) !== null && _a !== void 0 ? _a : "", (_b = teamNameById.get(team2Id)) !== null && _b !== void 0 ? _b : "", match.winnerTeam ? (_c = teamNameById.get(String(match.winnerTeam))) !== null && _c !== void 0 ? _c : "" : "");
        const ownTeamName = (_d = teamNameById.get(ownTeamId)) !== null && _d !== void 0 ? _d : "";
        const playerName = (_e = nameInTeam.get(ownTeamId)) !== null && _e !== void 0 ? _e : "";
        const innings = (0, matchStats_1.extractInnings)(snapshot);
        const perf = (0, matchStats_1.getPlayerPerformance)(snapshot, ownTeamName, playerName, innings);
        if (!perf)
            return;
        const tournamentId = String(match.tournament);
        const bucket = (_f = perTournament.get(tournamentId)) !== null && _f !== void 0 ? _f : { teamName: ownTeamName, perfs: [] };
        bucket.perfs.push(perf);
        perTournament.set(tournamentId, bucket);
        const date = (_g = match.completedAt) !== null && _g !== void 0 ? _g : match.updatedAt;
        rows.push({
            matchId: String(match._id),
            source: "tournament",
            date: toIso(date),
            sortTime: date ? new Date(date).getTime() : 0,
            team: perf.team,
            opponent: perf.opponent,
            tournamentId,
            tournamentName: (_j = (_h = tournamentById.get(tournamentId)) === null || _h === void 0 ? void 0 : _h.name) !== null && _j !== void 0 ? _j : "",
            perf,
            partnerships: partnershipsFor(innings, ownTeamName, playerName),
        });
    });
    // ---- Friendly (saved) matches ---------------------------------------
    // Saved matches only store player names, so link them through the saved
    // teams that include this player: same owner + team name + player name.
    const savedTeams = await SavedPlayerTeam_1.SavedPlayerTeam.find({ "players.playerId": playerObjectId })
        .select("owner name players")
        .lean();
    const links = savedTeams.flatMap((team) => {
        var _a;
        const entry = ((_a = team.players) !== null && _a !== void 0 ? _a : []).find((p) => String(p.playerId) === String(playerObjectId));
        return entry ? [{ owner: String(team.owner), teamName: team.name, playerName: entry.name }] : [];
    });
    if (links.length > 0) {
        const savedMatches = await SavedMatch_1.SavedMatch.find({
            status: "completed",
            $or: links.map((l) => ({ user: new mongoose_1.Types.ObjectId(l.owner), teams: l.teamName })),
        })
            .sort({ savedAt: -1 })
            .limit(MAX_SAVED_MATCHES)
            .select("user teams snapshot savedAt")
            .lean();
        savedMatches.forEach((match) => {
            const owner = String(match.user);
            const link = links.find((l) => {
                var _a;
                return l.owner === owner &&
                    ((_a = match.teams) !== null && _a !== void 0 ? _a : []).some((t) => (0, matchStats_1.normalizeName)(t) === (0, matchStats_1.normalizeName)(l.teamName));
            });
            if (!link)
                return;
            const snapshot = match.snapshot;
            const innings = (0, matchStats_1.extractInnings)(snapshot);
            const perf = (0, matchStats_1.getPlayerPerformance)(snapshot, link.teamName, link.playerName, innings);
            if (!perf)
                return;
            rows.push({
                matchId: String(match._id),
                source: "friendly",
                date: toIso(match.savedAt),
                sortTime: match.savedAt ? new Date(match.savedAt).getTime() : 0,
                team: perf.team,
                opponent: perf.opponent,
                perf,
                partnerships: partnershipsFor(innings, link.teamName, link.playerName),
            });
        });
    }
    rows.sort((a, b) => b.sortTime - a.sortTime);
    const tournamentRows = rows.filter((r) => r.source === "tournament");
    const friendlyRows = rows.filter((r) => r.source === "friendly");
    const privateTournamentIds = new Set(tournaments.filter((t) => (0, visibility_1.tournamentVisibilityOf)(t) === "private").map((t) => String(t._id)));
    return Object.assign(Object.assign({ overall: (0, matchStats_1.aggregatePerformances)(rows.map((r) => r.perf)), tournament: (0, matchStats_1.aggregatePerformances)(tournamentRows.map((r) => r.perf)), friendly: (0, matchStats_1.aggregatePerformances)(friendlyRows.map((r) => r.perf)), tournaments: Array.from(perTournament.entries())
            .map(([tournamentId, bucket]) => {
            var _a, _b, _c;
            const t = tournamentById.get(tournamentId);
            return {
                tournamentId,
                name: (_a = t === null || t === void 0 ? void 0 : t.name) !== null && _a !== void 0 ? _a : "",
                logoUrl: (_b = t === null || t === void 0 ? void 0 : t.logoUrl) !== null && _b !== void 0 ? _b : "",
                status: (_c = t === null || t === void 0 ? void 0 : t.status) !== null && _c !== void 0 ? _c : "",
                visibility: t ? (0, visibility_1.tournamentVisibilityOf)(t) : "private",
                startDate: toIso(t === null || t === void 0 ? void 0 : t.startDate),
                teamName: bucket.teamName,
                stats: (0, matchStats_1.aggregatePerformances)(bucket.perfs),
            };
        })
            .sort((a, b) => b.startDate.localeCompare(a.startDate)), recentMatches: rows.slice(0, RECENT_MATCHES_LIMIT).map((_a) => {
            var { perf, sortTime, partnerships } = _a, row = __rest(_a, ["perf", "sortTime", "partnerships"]);
            return (Object.assign(Object.assign({}, row), { result: perf.result, batting: perf.batting, bowling: perf.bowling, fielding: perf.fielding }));
        }) }, (0, careerInsights_1.computeAchievements)(rows)), { insights: {
            overall: (0, careerInsights_1.computeCareerInsights)(rows),
            tournament: (0, careerInsights_1.computeCareerInsights)(tournamentRows),
            friendly: (0, careerInsights_1.computeCareerInsights)(friendlyRows),
        }, privacy: {
            /** Matches from private tournaments: only the owner (and people in them) see these. */
            privateMatches: tournamentRows.filter((r) => r.tournamentId && privateTournamentIds.has(r.tournamentId)).length,
        } });
};
exports.computePlayerCareer = computePlayerCareer;
const anonCache = new Map();
const readAnonCache = (key) => {
    const hit = anonCache.get(key);
    if (!hit)
        return null;
    if (Date.now() - hit.at > ANON_CACHE_MS) {
        anonCache.delete(key);
        return null;
    }
    return hit.body;
};
const writeAnonCache = (key, body) => {
    if (anonCache.size >= ANON_CACHE_MAX) {
        const oldest = anonCache.keys().next().value;
        if (oldest !== undefined)
            anonCache.delete(oldest);
    }
    anonCache.set(key, { at: Date.now(), body });
};
/**
 * GET /api/v1/players/:playerId/stats  (login optional)
 * Public and unlisted profiles are open to anyone; hidden ones only to their
 * owner. An old record that was claimed into a profile answers with that
 * profile's stats and `redirectTo`.
 */
const getPlayerCareerStats = async (req, res) => {
    var _a, _b, _c, _d;
    try {
        const playerObjectId = toObjectId(req.params.playerId);
        if (!playerObjectId) {
            res.status(400).json({ message: "Valid player id is required" });
            return;
        }
        const identity = await (0, players_1.resolveLiveIdentity)(playerObjectId);
        if (!identity) {
            res.status(404).json({ message: "Player not found" });
            return;
        }
        const viewerId = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
        const isOwner = Boolean(identity.user && viewerId && String(identity.user) === viewerId);
        if (!(0, visibility_1.canViewProfile)(identity, viewerId)) {
            res.status(403).json({ message: "This player's profile is private" });
            return;
        }
        const cacheKey = `${String(identity._id)}:${String(playerObjectId)}`;
        if (!viewerId) {
            const cached = readAnonCache(cacheKey);
            if (cached) {
                res.setHeader("Cache-Control", "public, max-age=60");
                res.status(200).json(cached);
                return;
            }
        }
        const career = await (0, exports.computePlayerCareer)(identity._id, { userId: viewerId, isOwner });
        const body = Object.assign(Object.assign({ player: Object.assign(Object.assign({}, (0, players_1.serializePublicPlayer)(identity)), { isOwner, visibility: (_c = identity.visibility) !== null && _c !== void 0 ? _c : "public", memberSince: (_d = identity.claimedAt) !== null && _d !== void 0 ? _d : (identity.user ? identity.createdAt : null) }), redirectTo: String(identity._id) !== String(playerObjectId) ? String(identity._id) : undefined }, career), { 
            // Others never learn how many private matches were left out.
            privacy: isOwner ? career.privacy : undefined });
        if (!viewerId)
            writeAnonCache(cacheKey, body);
        res.setHeader("Cache-Control", viewerId ? "private, max-age=30" : "public, max-age=60");
        res.status(200).json(body);
    }
    catch (error) {
        console.error("getPlayerCareerStats failed", error);
        res.status(500).json({ message: "Unable to load player stats" });
    }
};
exports.getPlayerCareerStats = getPlayerCareerStats;
/**
 * Per-player figures and records for one tournament. With `forPublic`, roster
 * links to hidden profiles are dropped so the public page can't open them.
 */
const computeTournamentPlayerStats = async (tournamentId, { forPublic = false } = {}) => {
    const [teams, matches] = await Promise.all([
        TournamentTeam_1.TournamentTeam.find({ tournament: tournamentId }).lean(),
        TournamentMatch_1.TournamentMatch.find({ tournament: tournamentId, status: "completed" })
            .select("team1 team2 winnerTeam snapshot completedAt")
            .sort({ completedAt: 1 })
            .lean(),
    ]);
    const teamById = new Map(teams.map((t) => [String(t._id), t]));
    let visibleProfileIds = null;
    if (forPublic) {
        const ids = teams.flatMap((t) => { var _a; return ((_a = t.players) !== null && _a !== void 0 ? _a : []).flatMap((p) => (p.playerId ? [p.playerId] : [])); });
        const visible = await PlayerIdentity_1.PlayerIdentity.find({ _id: { $in: ids }, visibility: { $ne: "hidden" }, mergedInto: { $exists: false } })
            .select("_id")
            .lean();
        visibleProfileIds = new Set(visible.map((p) => String(p._id)));
    }
    const linkFor = (playerId) => {
        if (!playerId)
            return "";
        const id = String(playerId);
        return !visibleProfileIds || visibleProfileIds.has(id) ? id : "";
    };
    const perfsByPlayer = new Map();
    const topInnings = [];
    const bestBowling = [];
    const partnerships = [];
    matches.forEach((match) => {
        var _a, _b;
        const team1 = teamById.get(String(match.team1));
        const team2 = teamById.get(String(match.team2));
        if (!team1 || !team2)
            return;
        const snapshot = (0, exports.resolveTournamentSnapshot)(match.snapshot, team1.name, team2.name, match.winnerTeam ? (_b = (_a = teamById.get(String(match.winnerTeam))) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "" : "");
        if (!snapshot)
            return;
        const innings = (0, matchStats_1.extractInnings)(snapshot);
        const matchId = String(match._id);
        [team1, team2].forEach((team) => {
            var _a;
            ((_a = team.players) !== null && _a !== void 0 ? _a : []).forEach((player) => {
                var _a;
                const perf = (0, matchStats_1.getPlayerPerformance)(snapshot, team.name, player.name, innings);
                if (!perf)
                    return;
                const key = String(player._id);
                const list = (_a = perfsByPlayer.get(key)) !== null && _a !== void 0 ? _a : [];
                list.push(perf);
                perfsByPlayer.set(key, list);
                const base = {
                    matchId,
                    playerKey: key,
                    playerId: linkFor(player.playerId),
                    name: player.name,
                    teamName: team.name,
                    opponent: perf.opponent,
                };
                if (perf.batting && (perf.batting.balls > 0 || perf.batting.runs > 0 || perf.batting.out)) {
                    topInnings.push(Object.assign(Object.assign({}, base), { runs: perf.batting.runs, balls: perf.batting.balls, notOut: !perf.batting.out, fours: perf.batting.fours, sixes: perf.batting.sixes }));
                }
                if (perf.bowling && perf.bowling.balls > 0) {
                    bestBowling.push(Object.assign(Object.assign({}, base), { wickets: perf.bowling.wickets, runs: perf.bowling.runs, balls: perf.bowling.balls }));
                }
            });
        });
        innings.forEach((inn) => {
            inn.partnerships
                .filter((p) => p.batter1 && p.batter2 && p.runs > 0)
                .forEach((p) => {
                partnerships.push({
                    matchId,
                    teamName: inn.battingTeam,
                    opponent: inn.bowlingTeam,
                    wicket: p.number,
                    batter1: p.batter1,
                    batter2: p.batter2,
                    batter1Runs: p.batter1Runs,
                    batter2Runs: p.batter2Runs,
                    extras: p.extras,
                    runs: p.runs,
                    balls: p.balls,
                    unbroken: p.unbroken,
                });
            });
        });
    });
    const players = teams.flatMap((team) => {
        var _a;
        return ((_a = team.players) !== null && _a !== void 0 ? _a : []).map((player) => {
            var _a, _b, _c;
            return ({
                playerKey: String(player._id),
                playerId: linkFor(player.playerId),
                name: player.name,
                role: (_a = player.role) !== null && _a !== void 0 ? _a : "",
                teamId: String(team._id),
                teamName: team.name,
                teamLogoUrl: (_b = team.logoUrl) !== null && _b !== void 0 ? _b : "",
                stats: (0, matchStats_1.aggregatePerformances)((_c = perfsByPlayer.get(String(player._id))) !== null && _c !== void 0 ? _c : []),
            });
        });
    });
    return {
        tournamentId: String(tournamentId),
        matchesCounted: matches.length,
        players,
        records: {
            topInnings: topInnings
                .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
                .slice(0, LEADERBOARD_LIMIT),
            bestBowling: bestBowling
                .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
                .slice(0, LEADERBOARD_LIMIT),
            partnerships: partnerships
                .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
                .slice(0, LEADERBOARD_LIMIT),
        },
    };
};
exports.computeTournamentPlayerStats = computeTournamentPlayerStats;
/**
 * GET /api/v1/tournaments/:tournamentId/player-stats
 * Full per-player figures for one tournament (organizer only), plus records:
 * top individual innings, best bowling, and highest partnerships.
 */
const getTournamentPlayerStats = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const tournamentObjectId = toObjectId(req.params.tournamentId);
        if (!tournamentObjectId) {
            res.status(400).json({ message: "Valid tournament id is required" });
            return;
        }
        const organizer = new mongoose_1.Types.ObjectId(req.user.id);
        const tournament = await Tournament_1.Tournament.findOne({ _id: tournamentObjectId, organizer }).select("_id").lean();
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        res.status(200).json(await (0, exports.computeTournamentPlayerStats)(tournamentObjectId));
    }
    catch (error) {
        console.error("getTournamentPlayerStats failed", error);
        res.status(500).json({ message: "Unable to load tournament player stats" });
    }
};
exports.getTournamentPlayerStats = getTournamentPlayerStats;
//# sourceMappingURL=playerStatsController.js.map