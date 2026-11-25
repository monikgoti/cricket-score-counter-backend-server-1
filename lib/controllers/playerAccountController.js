"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leaveTournamentTeam = exports.getMyTournaments = exports.markNotificationsRead = exports.getNotifications = exports.decideClaim = exports.getIncomingClaims = exports.getMyClaims = exports.requestClaim = exports.getPublicPlayerProfile = exports.getRecentPlayers = exports.searchPlayers = exports.getPlayerAvatar = exports.updateMyPlayer = exports.registerMyPlayer = exports.getMyPlayer = void 0;
const mongoose_1 = require("mongoose");
const Notification_1 = require("../models/Notification");
const PlayerClaimRequest_1 = require("../models/PlayerClaimRequest");
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const SavedPlayerTeam_1 = require("../models/SavedPlayerTeam");
const Tournament_1 = require("../models/Tournament");
const TournamentMatch_1 = require("../models/TournamentMatch");
const TournamentTeam_1 = require("../models/TournamentTeam");
const User_1 = require("../models/User");
const playerStatsController_1 = require("./playerStatsController");
const players_1 = require("../utils/players");
const MAX_AVATAR_CHARS = 300000; // ~220 KB image; the app uploads ~256px JPEGs
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const TEXT_LIMITS = { name: 60, city: 60, role: 40, style: 40 };
const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oid = (value) => typeof value === "string" && mongoose_1.Types.ObjectId.isValid(value) ? new mongoose_1.Types.ObjectId(value) : null;
const serializeOwnPlayer = (player) => {
    var _a, _b;
    return (Object.assign(Object.assign({}, (0, players_1.serializePublicPlayer)(player)), { visibility: (_a = player.visibility) !== null && _a !== void 0 ? _a : "public", claimedAt: (_b = player.claimedAt) !== null && _b !== void 0 ? _b : null, suspended: Boolean(player.suspendedAt) }));
};
const findMyPlayer = (userId) => PlayerIdentity_1.PlayerIdentity.findOne({ user: new mongoose_1.Types.ObjectId(userId), mergedInto: { $exists: false } });
/** Applies profile fields from a request body; returns an error message or "". */
const applyProfileFields = async (player, body, isNew) => {
    if ((body === null || body === void 0 ? void 0 : body.name) !== undefined || isNew) {
        const name = text(body === null || body === void 0 ? void 0 : body.name, TEXT_LIMITS.name);
        if (name.length < 2)
            return "Please enter your name (at least 2 characters).";
        player.name = name;
    }
    if ((body === null || body === void 0 ? void 0 : body.username) !== undefined && body.username !== "") {
        const username = text(body.username, 24).toLowerCase();
        if (!players_1.USERNAME_PATTERN.test(username)) {
            return "Username must be 3–24 characters: letters, numbers, dots or underscores.";
        }
        if (username !== player.username) {
            const taken = await PlayerIdentity_1.PlayerIdentity.exists({ username, _id: { $ne: player._id } });
            if (taken)
                return "That username is taken.";
            player.username = username;
        }
    }
    else if (isNew) {
        player.username = await (0, players_1.generateUniqueUsername)(player.name);
    }
    if ((body === null || body === void 0 ? void 0 : body.role) !== undefined)
        player.role = text(body.role, TEXT_LIMITS.role) || undefined;
    if ((body === null || body === void 0 ? void 0 : body.city) !== undefined)
        player.city = text(body.city, TEXT_LIMITS.city) || undefined;
    if ((body === null || body === void 0 ? void 0 : body.battingStyle) !== undefined)
        player.battingStyle = text(body.battingStyle, TEXT_LIMITS.style) || undefined;
    if ((body === null || body === void 0 ? void 0 : body.bowlingStyle) !== undefined)
        player.bowlingStyle = text(body.bowlingStyle, TEXT_LIMITS.style) || undefined;
    if ((body === null || body === void 0 ? void 0 : body.visibility) !== undefined) {
        if (!PlayerIdentity_1.PLAYER_VISIBILITIES.includes(body.visibility))
            return "Invalid visibility.";
        if (player.suspendedAt && body.visibility !== "hidden") {
            return "Your profile has been suspended by an admin, so it can't be made public.";
        }
        player.visibility = body.visibility;
    }
    if ((body === null || body === void 0 ? void 0 : body.avatarData) !== undefined) {
        if (body.avatarData === null || body.avatarData === "") {
            player.avatarData = undefined;
            player.avatarVersion = 0;
        }
        else {
            const data = String(body.avatarData);
            if (data.length > MAX_AVATAR_CHARS || !AVATAR_PATTERN.test(data)) {
                return "Photo must be a JPEG, PNG or WebP image under 200 KB.";
            }
            player.avatarData = data;
            player.avatarVersion = Date.now();
        }
    }
    return "";
};
// ---------------------------------------------------------------- my profile
const getMyPlayer = async (req, res) => {
    try {
        const player = await findMyPlayer(req.user.id);
        res.status(200).json({ player: player ? serializeOwnPlayer(player) : null });
    }
    catch (error) {
        console.error("getMyPlayer failed", error);
        res.status(500).json({ message: "Unable to load your player profile" });
    }
};
exports.getMyPlayer = getMyPlayer;
const registerMyPlayer = async (req, res) => {
    try {
        const userId = req.user.id;
        if (await findMyPlayer(userId)) {
            res.status(409).json({ message: "You already have a player profile." });
            return;
        }
        const player = new PlayerIdentity_1.PlayerIdentity({
            createdBy: new mongoose_1.Types.ObjectId(userId),
            user: new mongoose_1.Types.ObjectId(userId),
            claimedAt: new Date(),
            visibility: "public",
        });
        const error = await applyProfileFields(player, req.body, true);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }
        await player.save();
        res.status(201).json({ player: serializeOwnPlayer(player) });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
            res.status(409).json({ message: "That username is taken, or you already have a profile." });
            return;
        }
        console.error("registerMyPlayer failed", error);
        res.status(500).json({ message: "Unable to create your player profile" });
    }
};
exports.registerMyPlayer = registerMyPlayer;
const updateMyPlayer = async (req, res) => {
    try {
        const player = await findMyPlayer(req.user.id);
        if (!player) {
            res.status(404).json({ message: "Create your player profile first." });
            return;
        }
        const error = await applyProfileFields(player, req.body, false);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }
        await player.save();
        // Keep roster display data (username) in step; roster names are left as
        // scored so match history still lines up.
        await Promise.all([
            TournamentTeam_1.TournamentTeam.updateMany({ "players.playerId": player._id }, { $set: { "players.$[p].username": player.username } }, { arrayFilters: [{ "p.playerId": player._id }] }),
            SavedPlayerTeam_1.SavedPlayerTeam.updateMany({ "players.playerId": player._id }, { $set: { "players.$[p].username": player.username } }, { arrayFilters: [{ "p.playerId": player._id }] }),
        ]);
        res.status(200).json({ player: serializeOwnPlayer(player) });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
            res.status(409).json({ message: "That username is taken." });
            return;
        }
        console.error("updateMyPlayer failed", error);
        res.status(500).json({ message: "Unable to update your player profile" });
    }
};
exports.updateMyPlayer = updateMyPlayer;
/** GET /players/:playerId/avatar — public, cacheable. */
const getPlayerAvatar = async (req, res) => {
    var _a;
    try {
        const id = oid(req.params.playerId);
        const player = id ? await PlayerIdentity_1.PlayerIdentity.findById(id).select("+avatarData avatarVersion").lean() : null;
        const match = (_a = player === null || player === void 0 ? void 0 : player.avatarData) === null || _a === void 0 ? void 0 : _a.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (!match) {
            res.status(404).end();
            return;
        }
        res.setHeader("Content-Type", match[1]);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.status(200).send(Buffer.from(match[2], "base64"));
    }
    catch (error) {
        console.error("getPlayerAvatar failed", error);
        res.status(500).end();
    }
};
exports.getPlayerAvatar = getPlayerAvatar;
// ---------------------------------------------------------------- search
/**
 * GET /players/search?q=&unclaimed=1
 * Organizer search (default): public, live profiles; registered players first.
 * Claim search (unclaimed=1): organizer-made records nobody owns yet, with
 * where they appear so the player can recognise their own record.
 */
const searchPlayers = async (req, res) => {
    try {
        const q = text(req.query.q, 60);
        if (q.length < 2) {
            res.status(200).json({ players: [] });
            return;
        }
        const unclaimed = req.query.unclaimed === "1" || req.query.unclaimed === "true";
        const pattern = new RegExp(escapeRegExp(q), "i");
        const filter = {
            mergedInto: { $exists: false },
            $or: [{ name: pattern }, { username: pattern }],
        };
        if (unclaimed) {
            filter.user = { $exists: false };
            filter.suspendedAt = { $exists: false };
        }
        else {
            // Unlisted profiles only match their exact username.
            const exact = q.toLowerCase().replace(/^@/, "");
            delete filter.$or;
            filter.$or = [
                { visibility: { $nin: ["hidden", "unlisted"] }, $or: [{ name: pattern }, { username: pattern }] },
                { visibility: "unlisted", username: exact },
            ];
        }
        const players = await PlayerIdentity_1.PlayerIdentity.find(filter).limit(40).lean();
        players.sort((a, b) => Number(Boolean(b.user)) - Number(Boolean(a.user)) || a.name.localeCompare(b.name));
        const top = players.slice(0, 20);
        if (!unclaimed) {
            res.status(200).json({ players: top.map((p) => (0, players_1.serializePublicPlayer)(p)) });
            return;
        }
        const ids = top.map((p) => p._id);
        const [creators, tTeams, sTeams] = await Promise.all([
            User_1.User.find({ _id: { $in: top.map((p) => p.createdBy) } }).select("name").lean(),
            TournamentTeam_1.TournamentTeam.find({ "players.playerId": { $in: ids } }).select("name tournament players.playerId").lean(),
            SavedPlayerTeam_1.SavedPlayerTeam.find({ "players.playerId": { $in: ids } }).select("name players.playerId").lean(),
        ]);
        const creatorName = new Map(creators.map((u) => [String(u._id), u.name]));
        const teamsFor = (id) => Array.from(new Set([...tTeams, ...sTeams]
            .filter((t) => { var _a; return ((_a = t.players) !== null && _a !== void 0 ? _a : []).some((p) => String(p.playerId) === id); })
            .map((t) => t.name))).slice(0, 4);
        res.status(200).json({
            players: top.map((p) => {
                var _a;
                return (Object.assign(Object.assign({}, (0, players_1.serializePublicPlayer)(p)), { addedBy: (_a = creatorName.get(String(p.createdBy))) !== null && _a !== void 0 ? _a : "", teams: teamsFor(String(p._id)) }));
            }),
        });
    }
    catch (error) {
        console.error("searchPlayers failed", error);
        res.status(500).json({ message: "Unable to search players" });
    }
};
exports.searchPlayers = searchPlayers;
/** GET /players/recent — players this organizer has used, newest team first. */
const getRecentPlayers = async (req, res) => {
    try {
        const me = new mongoose_1.Types.ObjectId(req.user.id);
        const [saved, tour] = await Promise.all([
            SavedPlayerTeam_1.SavedPlayerTeam.find({ owner: me }).sort({ updatedAt: -1 }).limit(30).select("players.playerId updatedAt").lean(),
            TournamentTeam_1.TournamentTeam.find({ organizer: me }).sort({ updatedAt: -1 }).limit(60).select("players.playerId updatedAt").lean(),
        ]);
        const ordered = [...saved, ...tour]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .flatMap((t) => { var _a; return ((_a = t.players) !== null && _a !== void 0 ? _a : []).map((p) => (p.playerId ? String(p.playerId) : "")); })
            .filter(Boolean);
        const ids = Array.from(new Set(ordered)).slice(0, 60);
        const players = await PlayerIdentity_1.PlayerIdentity.find({ _id: { $in: ids }, mergedInto: { $exists: false } }).lean();
        const byId = new Map(players.map((p) => [String(p._id), p]));
        res.status(200).json({
            players: ids
                .map((id) => byId.get(id))
                .filter(Boolean)
                .slice(0, 24)
                .map((p) => (0, players_1.serializePublicPlayer)(p)),
        });
    }
    catch (error) {
        console.error("getRecentPlayers failed", error);
        res.status(500).json({ message: "Unable to load recent players" });
    }
};
exports.getRecentPlayers = getRecentPlayers;
// ---------------------------------------------------------------- public share page
/** GET /players/public/:username — no login; public and unlisted profiles. */
const getPublicPlayerProfile = async (req, res) => {
    try {
        const username = text(req.params.username, 30).toLowerCase();
        const found = username ? await PlayerIdentity_1.PlayerIdentity.findOne({ username }) : null;
        const player = (found === null || found === void 0 ? void 0 : found.mergedInto) ? await (0, players_1.resolveLiveIdentity)(found._id) : found;
        if (!player || player.visibility === "hidden") {
            res.status(404).json({ message: "Player not found" });
            return;
        }
        // Anonymous view: private tournaments are left out.
        const career = await (0, playerStatsController_1.computePlayerCareer)(player._id, {});
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).json({
            player: (0, players_1.serializePublicPlayer)(player),
            overall: career.overall,
            tournaments: career.tournaments.map((t) => ({ tournamentId: t.tournamentId, name: t.name, teamName: t.teamName, matches: t.stats.matches, runs: t.stats.batting.runs, wickets: t.stats.bowling.wickets })),
            recentMatches: career.recentMatches.slice(0, 5).map((m) => {
                var _a;
                return ({
                    date: m.date, team: m.team, opponent: m.opponent, result: m.result,
                    tournamentName: (_a = m.tournamentName) !== null && _a !== void 0 ? _a : "", batting: m.batting, bowling: m.bowling,
                });
            }),
        });
    }
    catch (error) {
        console.error("getPublicPlayerProfile failed", error);
        res.status(500).json({ message: "Unable to load player" });
    }
};
exports.getPublicPlayerProfile = getPublicPlayerProfile;
// ---------------------------------------------------------------- claims
const serializeClaim = async (claims) => {
    const identityIds = claims.flatMap((c) => [c.identity, c.requesterPlayer]);
    const userIds = claims.flatMap((c) => [c.requester, c.approver]);
    const [identities, users] = await Promise.all([
        PlayerIdentity_1.PlayerIdentity.find({ _id: { $in: identityIds } }).lean(),
        User_1.User.find({ _id: { $in: userIds } }).select("name").lean(),
    ]);
    const idMap = new Map(identities.map((i) => [String(i._id), i]));
    const userMap = new Map(users.map((u) => [String(u._id), u.name]));
    return claims.map((c) => {
        var _a, _b, _c, _d;
        return ({
            id: String(c._id),
            status: c.status,
            message: (_a = c.message) !== null && _a !== void 0 ? _a : "",
            createdAt: c.createdAt,
            decidedAt: (_b = c.decidedAt) !== null && _b !== void 0 ? _b : null,
            record: idMap.get(String(c.identity)) ? (0, players_1.serializePublicPlayer)(idMap.get(String(c.identity))) : null,
            requester: idMap.get(String(c.requesterPlayer)) ? (0, players_1.serializePublicPlayer)(idMap.get(String(c.requesterPlayer))) : null,
            requesterName: (_c = userMap.get(String(c.requester))) !== null && _c !== void 0 ? _c : "",
            approverName: (_d = userMap.get(String(c.approver))) !== null && _d !== void 0 ? _d : "",
        });
    });
};
/** Moves every roster reference from an organizer-made record onto the owner's profile. */
const mergeIdentityInto = async (from, to) => {
    const filter = { "players.playerId": from._id };
    const update = { $set: { "players.$[p].playerId": to._id, "players.$[p].username": to.username } };
    const options = { arrayFilters: [{ "p.playerId": from._id }] };
    await Promise.all([
        TournamentTeam_1.TournamentTeam.updateMany(filter, update, options),
        SavedPlayerTeam_1.SavedPlayerTeam.updateMany(filter, update, options),
    ]);
    from.mergedInto = to._id;
    await from.save();
    await PlayerClaimRequest_1.PlayerClaimRequest.updateMany({ identity: from._id, status: "pending" }, { $set: { status: "cancelled", decidedAt: new Date() } });
};
/** POST /players/:playerId/claim  { message? } */
const requestClaim = async (req, res) => {
    var _a;
    try {
        const userId = req.user.id;
        const me = await findMyPlayer(userId);
        if (!me) {
            res.status(400).json({ message: "Create your player profile first." });
            return;
        }
        const id = oid(req.params.playerId);
        const record = id ? await PlayerIdentity_1.PlayerIdentity.findById(id) : null;
        if (!record || record.mergedInto) {
            res.status(404).json({ message: "Player record not found" });
            return;
        }
        if (record.user) {
            res.status(409).json({ message: "This record already belongs to a registered player." });
            return;
        }
        const existing = await PlayerClaimRequest_1.PlayerClaimRequest.findOne({ identity: record._id, requester: userId, status: "pending" });
        if (existing) {
            res.status(200).json({ claim: (await serializeClaim([existing.toObject()]))[0] });
            return;
        }
        const claim = await PlayerClaimRequest_1.PlayerClaimRequest.create({
            identity: record._id,
            requesterPlayer: me._id,
            requester: new mongoose_1.Types.ObjectId(userId),
            approver: record.createdBy,
            message: text((_a = req.body) === null || _a === void 0 ? void 0 : _a.message, 300) || undefined,
        });
        // You created this record yourself: no one else to ask.
        if (String(record.createdBy) === userId) {
            await mergeIdentityInto(record, me);
            claim.status = "approved";
            claim.decidedAt = new Date();
            await claim.save();
        }
        else {
            await (0, players_1.notify)(record.createdBy, "claim_requested", `${me.name} says "${record.name}" is them`, `@${me.username} asked to link the player record "${record.name}" to their profile. Approve only if it's the same person — their match stats will move to their profile.`, "/me?tab=requests", { claimId: String(claim._id) });
        }
        res.status(201).json({ claim: (await serializeClaim([claim.toObject()]))[0] });
    }
    catch (error) {
        console.error("requestClaim failed", error);
        res.status(500).json({ message: "Unable to send claim request" });
    }
};
exports.requestClaim = requestClaim;
/** GET /me/claims — requests I sent;  GET /me/claim-requests — requests waiting for me. */
const getMyClaims = async (req, res) => {
    try {
        const claims = await PlayerClaimRequest_1.PlayerClaimRequest.find({ requester: req.user.id }).sort({ createdAt: -1 }).limit(50).lean();
        res.status(200).json({ claims: await serializeClaim(claims) });
    }
    catch (error) {
        console.error("getMyClaims failed", error);
        res.status(500).json({ message: "Unable to load claims" });
    }
};
exports.getMyClaims = getMyClaims;
const getIncomingClaims = async (req, res) => {
    try {
        const claims = await PlayerClaimRequest_1.PlayerClaimRequest.find({ approver: req.user.id })
            .sort({ status: 1, createdAt: -1 })
            .limit(50)
            .lean();
        // pending first
        claims.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
        res.status(200).json({ claims: await serializeClaim(claims) });
    }
    catch (error) {
        console.error("getIncomingClaims failed", error);
        res.status(500).json({ message: "Unable to load claim requests" });
    }
};
exports.getIncomingClaims = getIncomingClaims;
/** POST /players/claims/:claimId/:decision  (approve | reject | cancel) */
const decideClaim = async (req, res) => {
    var _a, _b;
    try {
        const userId = req.user.id;
        const decision = req.params.decision;
        const claimId = oid(req.params.claimId);
        const claim = claimId ? await PlayerClaimRequest_1.PlayerClaimRequest.findById(claimId) : null;
        if (!claim || claim.status !== "pending") {
            res.status(404).json({ message: "Request not found or already decided" });
            return;
        }
        if (decision === "cancel") {
            if (String(claim.requester) !== userId) {
                res.status(403).json({ message: "Not allowed" });
                return;
            }
            claim.status = "cancelled";
        }
        else if (decision === "approve" || decision === "reject") {
            if (String(claim.approver) !== userId) {
                res.status(403).json({ message: "Only the organizer who added this player can decide" });
                return;
            }
            const [record, target] = await Promise.all([
                PlayerIdentity_1.PlayerIdentity.findById(claim.identity),
                PlayerIdentity_1.PlayerIdentity.findById(claim.requesterPlayer),
            ]);
            if (decision === "approve") {
                if (!record || record.user || record.mergedInto || !target || target.mergedInto) {
                    claim.status = "cancelled";
                    claim.decidedAt = new Date();
                    await claim.save();
                    res.status(409).json({ message: "This record can no longer be claimed" });
                    return;
                }
                await mergeIdentityInto(record, target);
                claim.status = "approved";
            }
            else {
                claim.status = "rejected";
            }
            await (0, players_1.notify)(claim.requester, decision === "approve" ? "claim_approved" : "claim_rejected", decision === "approve" ? `"${(_a = record === null || record === void 0 ? void 0 : record.name) !== null && _a !== void 0 ? _a : "Player record"}" is now linked to you` : `Claim for "${(_b = record === null || record === void 0 ? void 0 : record.name) !== null && _b !== void 0 ? _b : "player record"}" was declined`, decision === "approve"
                ? "Its match history now counts in your stats."
                : "The organizer didn't confirm this record is you. Contact them if you think this is a mistake.", "/me");
        }
        else {
            res.status(400).json({ message: "Unknown decision" });
            return;
        }
        claim.decidedAt = new Date();
        await claim.save();
        res.status(200).json({ claim: (await serializeClaim([claim.toObject()]))[0] });
    }
    catch (error) {
        console.error("decideClaim failed", error);
        res.status(500).json({ message: "Unable to update request" });
    }
};
exports.decideClaim = decideClaim;
// ---------------------------------------------------------------- notifications
const getNotifications = async (req, res) => {
    try {
        const user = new mongoose_1.Types.ObjectId(req.user.id);
        const [items, unreadCount] = await Promise.all([
            Notification_1.Notification.find({ user }).sort({ createdAt: -1 }).limit(30).lean(),
            Notification_1.Notification.countDocuments({ user, readAt: { $exists: false } }),
        ]);
        res.status(200).json({
            unreadCount,
            notifications: items.map((n) => {
                var _a, _b;
                return ({
                    id: String(n._id),
                    type: n.type,
                    title: n.title,
                    body: n.body,
                    link: (_a = n.link) !== null && _a !== void 0 ? _a : "",
                    data: (_b = n.data) !== null && _b !== void 0 ? _b : {},
                    read: Boolean(n.readAt),
                    createdAt: n.createdAt,
                });
            }),
        });
    }
    catch (error) {
        console.error("getNotifications failed", error);
        res.status(500).json({ message: "Unable to load notifications" });
    }
};
exports.getNotifications = getNotifications;
/** POST /me/notifications/read  { ids?: string[] }  (no ids = mark all) */
const markNotificationsRead = async (req, res) => {
    var _a;
    try {
        const filter = { user: new mongoose_1.Types.ObjectId(req.user.id), readAt: { $exists: false } };
        if (Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.ids))
            filter._id = { $in: req.body.ids.map(oid).filter(Boolean) };
        await Notification_1.Notification.updateMany(filter, { $set: { readAt: new Date() } });
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error("markNotificationsRead failed", error);
        res.status(500).json({ message: "Unable to update notifications" });
    }
};
exports.markNotificationsRead = markNotificationsRead;
// ---------------------------------------------------------------- my tournaments
const getMyTournaments = async (req, res) => {
    try {
        const me = await findMyPlayer(req.user.id);
        if (!me) {
            res.status(200).json({ tournaments: [] });
            return;
        }
        const myTeams = await TournamentTeam_1.TournamentTeam.find({ "players.playerId": me._id }).select("name tournament organizer logoUrl").lean();
        const tournamentIds = myTeams.map((t) => t.tournament);
        const [tournaments, allTeams, matches] = await Promise.all([
            Tournament_1.Tournament.find({ _id: { $in: tournamentIds } }).select("name logoUrl status startDate endDate organizerName format visibility").lean(),
            TournamentTeam_1.TournamentTeam.find({ tournament: { $in: tournamentIds } }).select("name tournament").lean(),
            TournamentMatch_1.TournamentMatch.find({
                tournament: { $in: tournamentIds },
                $or: [{ team1: { $in: myTeams.map((t) => t._id) } }, { team2: { $in: myTeams.map((t) => t._id) } }],
            })
                .select("tournament team1 team2 status winnerTeam resultText startedAt completedAt createdAt")
                .sort({ createdAt: -1 })
                .limit(200)
                .lean(),
        ]);
        const teamName = new Map(allTeams.map((t) => [String(t._id), t.name]));
        const result = myTeams
            .map((team) => {
            var _a, _b, _c;
            const t = tournaments.find((x) => String(x._id) === String(team.tournament));
            if (!t)
                return null;
            const teamId = String(team._id);
            const teamMatches = matches.filter((m) => String(m.team1) === teamId || String(m.team2) === teamId);
            const played = new Set(teamMatches.map((m) => (String(m.team1) === teamId ? String(m.team2) : String(m.team1))));
            return {
                tournamentId: String(t._id),
                name: t.name,
                logoUrl: (_a = t.logoUrl) !== null && _a !== void 0 ? _a : "",
                status: t.status,
                format: t.format,
                visibility: (_b = t.visibility) !== null && _b !== void 0 ? _b : "public",
                organizerName: (_c = t.organizerName) !== null && _c !== void 0 ? _c : "",
                startDate: t.startDate,
                endDate: t.endDate,
                teamId,
                teamName: team.name,
                matches: teamMatches.map((m) => {
                    var _a, _b, _c, _d;
                    const opponentId = String(m.team1) === teamId ? String(m.team2) : String(m.team1);
                    return {
                        id: String(m._id),
                        opponent: (_a = teamName.get(opponentId)) !== null && _a !== void 0 ? _a : "",
                        status: m.status,
                        resultText: (_b = m.resultText) !== null && _b !== void 0 ? _b : "",
                        outcome: m.status !== "completed" ? null : !m.winnerTeam ? "tied" : String(m.winnerTeam) === teamId ? "won" : "lost",
                        date: (_d = (_c = m.completedAt) !== null && _c !== void 0 ? _c : m.startedAt) !== null && _d !== void 0 ? _d : m.createdAt,
                    };
                }),
                yetToPlay: t.format === "league"
                    ? allTeams
                        .filter((x) => String(x.tournament) === String(t._id) && String(x._id) !== teamId && !played.has(String(x._id)))
                        .map((x) => x.name)
                    : [],
            };
        })
            .filter(Boolean);
        res.status(200).json({ tournaments: result });
    }
    catch (error) {
        console.error("getMyTournaments failed", error);
        res.status(500).json({ message: "Unable to load your tournaments" });
    }
};
exports.getMyTournaments = getMyTournaments;
/**
 * POST /me/tournaments/teams/:teamId/leave
 * Unlinks the player from a squad they were added to by mistake. Their name
 * stays on the roster (scorecards were recorded with it) but it no longer
 * counts toward their profile, and the organizer is told.
 */
const leaveTournamentTeam = async (req, res) => {
    try {
        const me = await findMyPlayer(req.user.id);
        const teamId = oid(req.params.teamId);
        const team = me && teamId ? await TournamentTeam_1.TournamentTeam.findOne({ _id: teamId, "players.playerId": me._id }) : null;
        if (!me || !team) {
            res.status(404).json({ message: "You're not in this squad" });
            return;
        }
        team.players.forEach((p) => {
            if (p.playerId && String(p.playerId) === String(me._id)) {
                p.playerId = undefined;
                p.username = undefined;
            }
        });
        team.markModified("players");
        await team.save();
        const tournament = await Tournament_1.Tournament.findById(team.tournament).select("name").lean();
        await (0, players_1.notify)(team.organizer, "player_left_squad", `${me.name} left ${team.name}`, `@${me.username} says they're not part of ${team.name}${tournament ? ` in ${tournament.name}` : ""}. Their name stays on the roster but is no longer linked to their profile.`, `/tournaments/${String(team.tournament)}`);
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error("leaveTournamentTeam failed", error);
        res.status(500).json({ message: "Unable to leave squad" });
    }
};
exports.leaveTournamentTeam = leaveTournamentTeam;
//# sourceMappingURL=playerAccountController.js.map