"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMatch = exports.listMatches = exports.setPlayerSuspension = exports.listPlayers = exports.deleteTournament = exports.listTournaments = exports.getOverview = void 0;
const mongoose_1 = require("mongoose");
const User_1 = require("../models/User");
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const Tournament_1 = require("../models/Tournament");
const TournamentTeam_1 = require("../models/TournamentTeam");
const TournamentMatch_1 = require("../models/TournamentMatch");
const SavedMatch_1 = require("../models/SavedMatch");
const pagination_1 = require("../utils/pagination");
const socketState_1 = require("../utils/socketState");
const blobStorage_1 = require("../utils/blobStorage");
const tournamentController_1 = require("./tournamentController");
/*
 * Platform admin: every tournament, player and match across all accounts.
 * Mounted behind requireAuth + requireAdmin (ADMIN_EMAILS). Contact details
 * (email, phone) are included on purpose -- admins asked to see them.
 * Every change is written to the server log with the admin's email.
 */
const text = (value, max = 60) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oid = (value) => typeof value === "string" && mongoose_1.Types.ObjectId.isValid(value) ? new mongoose_1.Types.ObjectId(value) : null;
const DAY = 24 * 60 * 60 * 1000;
const audit = (req, action, details) => { var _a; return console.info("[admin]", JSON.stringify(Object.assign(Object.assign({ admin: (_a = req.user) === null || _a === void 0 ? void 0 : _a.email, action }, details), { at: new Date().toISOString() }))); };
const contactsFor = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean).map(String))].filter((id) => mongoose_1.Types.ObjectId.isValid(id));
    if (!unique.length)
        return new Map();
    const users = await User_1.User.find({ _id: { $in: unique } }).select("name email phoneNumber").lean();
    return new Map(users.map((u) => {
        var _a, _b, _c;
        return [
            String(u._id),
            { id: String(u._id), name: (_a = u.name) !== null && _a !== void 0 ? _a : "", email: (_b = u.email) !== null && _b !== void 0 ? _b : "", phone: (_c = u.phoneNumber) !== null && _c !== void 0 ? _c : "" },
        ];
    }));
};
const countBy = (rows) => Object.fromEntries(rows.map((row) => { var _a; return [String((_a = row._id) !== null && _a !== void 0 ? _a : "unknown"), row.count]; }));
/** GET /admin/overview */
const getOverview = async (_req, res) => {
    try {
        const weekAgo = new Date(Date.now() - 7 * DAY);
        const [users, newUsers, registeredPlayers, playerRecords, suspendedPlayers, tournamentsByStatus, newTournaments, tournamentMatchesByStatus, friendlyByStatus, matchesThisWeek,] = await Promise.all([
            User_1.User.countDocuments(),
            User_1.User.countDocuments({ createdAt: { $gte: weekAgo } }),
            PlayerIdentity_1.PlayerIdentity.countDocuments({ user: { $exists: true }, mergedInto: { $exists: false } }),
            PlayerIdentity_1.PlayerIdentity.countDocuments({ user: { $exists: false }, mergedInto: { $exists: false } }),
            PlayerIdentity_1.PlayerIdentity.countDocuments({ suspendedAt: { $exists: true } }),
            Tournament_1.Tournament.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
            Tournament_1.Tournament.countDocuments({ createdAt: { $gte: weekAgo } }),
            TournamentMatch_1.TournamentMatch.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
            SavedMatch_1.SavedMatch.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
            Promise.all([
                TournamentMatch_1.TournamentMatch.countDocuments({ createdAt: { $gte: weekAgo } }),
                SavedMatch_1.SavedMatch.countDocuments({ createdAt: { $gte: weekAgo } }),
            ]).then(([a, b]) => a + b),
        ]);
        const tournaments = countBy(tournamentsByStatus);
        const tournamentMatches = countBy(tournamentMatchesByStatus);
        const friendly = countBy(friendlyByStatus);
        const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
        res.status(200).json({
            users: { total: users, newThisWeek: newUsers },
            players: { registered: registeredPlayers, records: playerRecords, suspended: suspendedPlayers },
            tournaments: { total: sum(tournaments), byStatus: tournaments, newThisWeek: newTournaments },
            matches: {
                tournament: { total: sum(tournamentMatches), byStatus: tournamentMatches },
                friendly: { total: sum(friendly), byStatus: friendly },
                newThisWeek: matchesThisWeek,
            },
            connectedNow: (0, socketState_1.getActiveUserCount)(),
        });
    }
    catch (error) {
        console.error("admin overview failed", error);
        res.status(500).json({ message: "Unable to load overview" });
    }
};
exports.getOverview = getOverview;
/** GET /admin/tournaments?q=&status=&page=&limit= */
const listTournaments = async (req, res) => {
    var _a;
    try {
        const query = {};
        const status = text(req.query.status, 20);
        if (["draft", "active", "completed"].includes(status))
            query.status = status;
        const q = text(req.query.q);
        if (q) {
            const pattern = new RegExp(escapeRegExp(q), "i");
            const organizers = await User_1.User.find({ $or: [{ name: pattern }, { email: pattern }, { phoneNumber: pattern }] })
                .select("_id")
                .limit(200)
                .lean();
            query.$or = [
                { name: pattern },
                { location: pattern },
                { organizerName: pattern },
                { organizer: { $in: organizers.map((u) => u._id) } },
            ];
        }
        const pagination = (0, pagination_1.parsePagination)(req.query, { limit: 20 });
        const [total, tournaments] = await Promise.all([
            Tournament_1.Tournament.countDocuments(query),
            Tournament_1.Tournament.find(query).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
        ]);
        const ids = tournaments.map((t) => t._id);
        const [contacts, teamCounts, matchCounts] = await Promise.all([
            contactsFor(tournaments.map((t) => t.organizer)),
            TournamentTeam_1.TournamentTeam.aggregate([{ $match: { tournament: { $in: ids } } }, { $group: { _id: "$tournament", count: { $sum: 1 } } }]),
            TournamentMatch_1.TournamentMatch.aggregate([
                { $match: { tournament: { $in: ids } } },
                { $group: { _id: { t: "$tournament", s: "$status" }, count: { $sum: 1 } } },
            ]),
        ]);
        const teamsBy = new Map(teamCounts.map((r) => [String(r._id), r.count]));
        const matchesBy = new Map();
        for (const row of matchCounts) {
            const key = String(row._id.t);
            matchesBy.set(key, Object.assign(Object.assign({}, ((_a = matchesBy.get(key)) !== null && _a !== void 0 ? _a : {})), { [row._id.s]: row.count }));
        }
        res.status(200).json({
            tournaments: tournaments.map((t) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                return ({
                    id: String(t._id),
                    name: t.name,
                    location: (_a = t.location) !== null && _a !== void 0 ? _a : "",
                    status: t.status,
                    format: t.format,
                    squadMode: (_b = t.squadMode) !== null && _b !== void 0 ? _b : "teams_only",
                    oversPerMatch: t.oversPerMatch,
                    logoUrl: (_c = t.logoUrl) !== null && _c !== void 0 ? _c : "",
                    organizerName: (_d = t.organizerName) !== null && _d !== void 0 ? _d : "",
                    organizer: (_e = contacts.get(String(t.organizer))) !== null && _e !== void 0 ? _e : null,
                    teamsCount: (_f = teamsBy.get(String(t._id))) !== null && _f !== void 0 ? _f : 0,
                    matches: (_g = matchesBy.get(String(t._id))) !== null && _g !== void 0 ? _g : {},
                    startDate: (_h = t.startDate) !== null && _h !== void 0 ? _h : null,
                    createdAt: t.createdAt,
                });
            }),
            pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
        });
    }
    catch (error) {
        console.error("admin listTournaments failed", error);
        res.status(500).json({ message: "Unable to load tournaments" });
    }
};
exports.listTournaments = listTournaments;
/** DELETE /admin/tournaments/:id -- the tournament with its teams and matches. */
const deleteTournament = async (req, res) => {
    try {
        const id = oid(req.params.id);
        const tournament = id ? await Tournament_1.Tournament.findById(id) : null;
        if (!tournament) {
            res.status(404).json({ message: "Tournament not found" });
            return;
        }
        const [matches, teams] = await Promise.all([
            TournamentMatch_1.TournamentMatch.deleteMany({ tournament: tournament._id }),
            TournamentTeam_1.TournamentTeam.deleteMany({ tournament: tournament._id }),
        ]);
        await tournament.deleteOne();
        void (0, blobStorage_1.deleteBlobQuietly)(tournament.logoUrl);
        audit(req, "delete_tournament", {
            tournamentId: String(tournament._id),
            name: tournament.name,
            organizer: String(tournament.organizer),
            teams: teams.deletedCount,
            matches: matches.deletedCount,
        });
        res.status(200).json({ message: "Tournament deleted", teams: teams.deletedCount, matches: matches.deletedCount });
    }
    catch (error) {
        console.error("admin deleteTournament failed", error);
        res.status(500).json({ message: "Unable to delete tournament" });
    }
};
exports.deleteTournament = deleteTournament;
/** GET /admin/players?q=&type=all|registered|records|suspended&page=&limit= */
const listPlayers = async (req, res) => {
    try {
        const query = { mergedInto: { $exists: false } };
        const type = text(req.query.type, 20);
        if (type === "registered")
            query.user = { $exists: true };
        else if (type === "records")
            query.user = { $exists: false };
        else if (type === "suspended")
            query.suspendedAt = { $exists: true };
        const q = text(req.query.q);
        if (q) {
            const pattern = new RegExp(escapeRegExp(q), "i");
            const users = await User_1.User.find({ $or: [{ email: pattern }, { phoneNumber: pattern }] }).select("_id").limit(200).lean();
            query.$or = [
                { name: pattern },
                { username: pattern },
                { city: pattern },
                { contactNumber: pattern },
                { user: { $in: users.map((u) => u._id) } },
            ];
        }
        const pagination = (0, pagination_1.parsePagination)(req.query, { limit: 25 });
        const [total, players] = await Promise.all([
            PlayerIdentity_1.PlayerIdentity.countDocuments(query),
            PlayerIdentity_1.PlayerIdentity.find(query).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
        ]);
        const contacts = await contactsFor(players.flatMap((p) => [p.user, p.createdBy]));
        res.status(200).json({
            players: players.map((p) => {
                var _a, _b, _c, _d, _e, _f, _g;
                return ({
                    id: String(p._id),
                    name: p.name,
                    username: p.username,
                    role: (_a = p.role) !== null && _a !== void 0 ? _a : "",
                    city: (_b = p.city) !== null && _b !== void 0 ? _b : "",
                    contactNumber: (_c = p.contactNumber) !== null && _c !== void 0 ? _c : "",
                    hasAvatar: Boolean(p.avatarVersion),
                    avatarUrl: p.avatarVersion ? `/api/v1/players/${String(p._id)}/avatar?v=${p.avatarVersion}` : "",
                    registered: Boolean(p.user),
                    account: p.user ? (_d = contacts.get(String(p.user))) !== null && _d !== void 0 ? _d : null : null,
                    createdBy: p.user ? null : (_e = contacts.get(String(p.createdBy))) !== null && _e !== void 0 ? _e : null,
                    visibility: (_f = p.visibility) !== null && _f !== void 0 ? _f : "public",
                    suspended: Boolean(p.suspendedAt),
                    suspendedAt: (_g = p.suspendedAt) !== null && _g !== void 0 ? _g : null,
                    createdAt: p.createdAt,
                });
            }),
            pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
        });
    }
    catch (error) {
        console.error("admin listPlayers failed", error);
        res.status(500).json({ message: "Unable to load players" });
    }
};
exports.listPlayers = listPlayers;
/** POST /admin/players/:id/suspension  { suspended: boolean } */
const setPlayerSuspension = async (req, res) => {
    var _a, _b, _c;
    try {
        const id = oid(req.params.id);
        const player = id ? await PlayerIdentity_1.PlayerIdentity.findById(id) : null;
        if (!player) {
            res.status(404).json({ message: "Player not found" });
            return;
        }
        const suspend = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.suspended) !== false;
        if (suspend && !player.suspendedAt) {
            player.visibilityBeforeSuspension = (_b = player.visibility) !== null && _b !== void 0 ? _b : "public";
            player.visibility = "hidden";
            player.suspendedAt = new Date();
        }
        else if (!suspend && player.suspendedAt) {
            player.visibility = (_c = player.visibilityBeforeSuspension) !== null && _c !== void 0 ? _c : "public";
            player.suspendedAt = undefined;
            player.visibilityBeforeSuspension = undefined;
        }
        await player.save();
        audit(req, suspend ? "suspend_player" : "unsuspend_player", { playerId: String(player._id), username: player.username });
        res.status(200).json({ suspended: Boolean(player.suspendedAt), visibility: player.visibility });
    }
    catch (error) {
        console.error("admin setPlayerSuspension failed", error);
        res.status(500).json({ message: "Unable to update player" });
    }
};
exports.setPlayerSuspension = setPlayerSuspension;
/** GET /admin/matches?kind=tournament|friendly&status=&q=&page=&limit= */
const listMatches = async (req, res) => {
    try {
        const kind = text(req.query.kind, 20) === "friendly" ? "friendly" : "tournament";
        const status = text(req.query.status, 20);
        const q = text(req.query.q);
        const pattern = q ? new RegExp(escapeRegExp(q), "i") : null;
        const pagination = (0, pagination_1.parsePagination)(req.query, { limit: 25 });
        if (kind === "friendly") {
            const query = {};
            if (["in_progress", "completed"].includes(status))
                query.status = status;
            if (pattern) {
                const users = await User_1.User.find({ $or: [{ name: pattern }, { email: pattern }, { phoneNumber: pattern }] }).select("_id").limit(200).lean();
                query.$or = [{ teams: pattern }, { resultText: pattern }, { user: { $in: users.map((u) => u._id) } }];
            }
            const [total, matches] = await Promise.all([
                SavedMatch_1.SavedMatch.countDocuments(query),
                SavedMatch_1.SavedMatch.find(query).select("-snapshot").sort({ updatedAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
            ]);
            const contacts = await contactsFor(matches.map((m) => m.user));
            res.status(200).json({
                kind,
                matches: matches.map((m) => {
                    var _a, _b, _c, _d;
                    return ({
                        id: String(m._id),
                        kind,
                        title: ((_a = m.teams) !== null && _a !== void 0 ? _a : []).filter(Boolean).join(" vs ") || "Match",
                        status: m.status,
                        resultText: (_b = m.resultText) !== null && _b !== void 0 ? _b : "",
                        tournamentName: "",
                        liveCode: "",
                        scorer: (_c = contacts.get(String(m.user))) !== null && _c !== void 0 ? _c : null,
                        startedAt: m.createdAt,
                        updatedAt: (_d = m.savedAt) !== null && _d !== void 0 ? _d : m.updatedAt,
                    });
                }),
                pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
            });
            return;
        }
        const query = {};
        if (["scheduled", "in_progress", "completed"].includes(status))
            query.status = status;
        if (pattern) {
            const [teams, tournaments] = await Promise.all([
                TournamentTeam_1.TournamentTeam.find({ name: pattern }).select("_id").limit(300).lean(),
                Tournament_1.Tournament.find({ name: pattern }).select("_id").limit(300).lean(),
            ]);
            const teamIds = teams.map((t) => t._id);
            query.$or = [
                { team1: { $in: teamIds } },
                { team2: { $in: teamIds } },
                { tournament: { $in: tournaments.map((t) => t._id) } },
                { liveCode: q.toUpperCase() },
            ];
        }
        const [total, matches] = await Promise.all([
            TournamentMatch_1.TournamentMatch.countDocuments(query),
            TournamentMatch_1.TournamentMatch.find(query).select("-snapshot").sort({ updatedAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
        ]);
        const teamIds = matches.flatMap((m) => [m.team1, m.team2]);
        const [teams, tournaments, contacts] = await Promise.all([
            TournamentTeam_1.TournamentTeam.find({ _id: { $in: teamIds } }).select("name").lean(),
            Tournament_1.Tournament.find({ _id: { $in: matches.map((m) => m.tournament) } }).select("name").lean(),
            contactsFor(matches.map((m) => m.organizer)),
        ]);
        const teamName = new Map(teams.map((t) => [String(t._id), t.name]));
        const tournamentName = new Map(tournaments.map((t) => [String(t._id), t.name]));
        res.status(200).json({
            kind,
            matches: matches.map((m) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                return ({
                    id: String(m._id),
                    kind,
                    title: `${(_a = teamName.get(String(m.team1))) !== null && _a !== void 0 ? _a : "?"} vs ${(_b = teamName.get(String(m.team2))) !== null && _b !== void 0 ? _b : "?"}`,
                    status: m.status,
                    resultText: (_c = m.resultText) !== null && _c !== void 0 ? _c : "",
                    tournamentId: String(m.tournament),
                    tournamentName: (_d = tournamentName.get(String(m.tournament))) !== null && _d !== void 0 ? _d : "",
                    liveCode: (_e = m.liveCode) !== null && _e !== void 0 ? _e : "",
                    scorer: (_f = contacts.get(String(m.organizer))) !== null && _f !== void 0 ? _f : null,
                    startedAt: (_g = m.startedAt) !== null && _g !== void 0 ? _g : m.createdAt,
                    updatedAt: (_h = m.completedAt) !== null && _h !== void 0 ? _h : m.updatedAt,
                });
            }),
            pagination: (0, pagination_1.buildPaginationMeta)(total, pagination),
        });
    }
    catch (error) {
        console.error("admin listMatches failed", error);
        res.status(500).json({ message: "Unable to load matches" });
    }
};
exports.listMatches = listMatches;
/** DELETE /admin/matches/:kind/:id -- tournament matches also refresh that tournament's table. */
const deleteMatch = async (req, res) => {
    try {
        const id = oid(req.params.id);
        if (!id) {
            res.status(404).json({ message: "Match not found" });
            return;
        }
        if (req.params.kind === "friendly") {
            const match = await SavedMatch_1.SavedMatch.findByIdAndDelete(id).select("teams user").lean();
            if (!match) {
                res.status(404).json({ message: "Match not found" });
                return;
            }
            audit(req, "delete_friendly_match", { matchId: String(id), teams: match.teams, user: String(match.user) });
            res.status(200).json({ message: "Match deleted" });
            return;
        }
        const match = await TournamentMatch_1.TournamentMatch.findByIdAndDelete(id).lean();
        if (!match) {
            res.status(404).json({ message: "Match not found" });
            return;
        }
        // Points table and team stats no longer count it.
        if (match.status === "completed") {
            await (0, tournamentController_1.recalculateTournamentStatistics)(match.tournament, String(match.organizer));
        }
        audit(req, "delete_tournament_match", { matchId: String(id), tournamentId: String(match.tournament), status: match.status });
        res.status(200).json({ message: "Match deleted" });
    }
    catch (error) {
        console.error("admin deleteMatch failed", error);
        res.status(500).json({ message: "Unable to delete match" });
    }
};
exports.deleteMatch = deleteMatch;
//# sourceMappingURL=adminController.js.map