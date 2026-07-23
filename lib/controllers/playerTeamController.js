"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicPlayers = exports.deleteSavedPlayerTeam = exports.updateSavedPlayerTeam = exports.createSavedPlayerTeam = exports.getSavedPlayerTeams = void 0;
const mongoose_1 = require("mongoose");
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const SavedPlayerTeam_1 = require("../models/SavedPlayerTeam");
const TournamentTeam_1 = require("../models/TournamentTeam");
const Tournament_1 = require("../models/Tournament");
const MIN_TEAM_PLAYERS = 8;
const normalizeText = (value) => typeof value === "string" ? value.trim() : "";
const normalizeOptionalText = (value) => {
    const text = normalizeText(value);
    return text || undefined;
};
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toUsernameBase = (name) => {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 24);
    return base || `player.${Date.now().toString(36)}`;
};
const ensureUniqueUsername = async (name) => {
    const base = toUsernameBase(name);
    let username = base;
    let suffix = 1;
    while (await PlayerIdentity_1.PlayerIdentity.exists({ username })) {
        suffix += 1;
        username = `${base}.${suffix}`;
    }
    return username;
};
const serializePlayerIdentity = (player) => {
    var _a, _b;
    return ({
        id: String(player._id),
        name: player.name,
        username: player.username,
        role: (_a = player.role) !== null && _a !== void 0 ? _a : "",
        contactNumber: (_b = player.contactNumber) !== null && _b !== void 0 ? _b : "",
        createdAt: player.createdAt,
        updatedAt: player.updatedAt,
    });
};
const serializeSavedTeamPlayer = (player) => {
    var _a, _b, _c;
    return ({
        id: String((_a = player._id) !== null && _a !== void 0 ? _a : player.playerId),
        playerId: String(player.playerId),
        name: player.name,
        username: player.username,
        role: (_b = player.role) !== null && _b !== void 0 ? _b : "",
        contactNumber: (_c = player.contactNumber) !== null && _c !== void 0 ? _c : "",
    });
};
const serializeSavedTeam = (team) => {
    var _a;
    return ({
        id: String(team._id),
        name: team.name,
        logoUrl: (_a = team.logoUrl) !== null && _a !== void 0 ? _a : "",
        captainName: team.captainName,
        contactNumber: team.contactNumber,
        players: team.players.map(serializeSavedTeamPlayer),
        playerCount: team.players.length,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
    });
};
const resolveSavedTeamPlayers = async (playersInput, userId) => {
    var _a, _b;
    if (!Array.isArray(playersInput)) {
        return [];
    }
    const owner = new mongoose_1.Types.ObjectId(userId);
    const seen = new Set();
    let hasViceCaptain = false;
    const players = [];
    for (const playerInput of playersInput) {
        const record = playerInput && typeof playerInput === "object"
            ? playerInput
            : { name: playerInput };
        const name = normalizeText(record.name);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) {
            continue;
        }
        seen.add(key);
        const savedPlayerIndex = players.length;
        const requestedRole = normalizeOptionalText(record.role);
        let role = savedPlayerIndex === 0
            ? "Captain"
            : requestedRole === "Captain"
                ? undefined
                : requestedRole;
        if (role === "Vice Captain") {
            if (hasViceCaptain) {
                role = undefined;
            }
            else {
                hasViceCaptain = true;
            }
        }
        const requestedPlayerId = normalizeText((_a = record.playerId) !== null && _a !== void 0 ? _a : record.id);
        let identity = null;
        if (mongoose_1.Types.ObjectId.isValid(requestedPlayerId)) {
            identity = await PlayerIdentity_1.PlayerIdentity.findById(requestedPlayerId);
        }
        if (!identity) {
            const username = await ensureUniqueUsername(name);
            identity = await PlayerIdentity_1.PlayerIdentity.create({
                createdBy: owner,
                name,
                username,
                role,
                contactNumber: normalizeOptionalText(record.contactNumber),
            });
        }
        else {
            const contactNumber = normalizeOptionalText(record.contactNumber);
            let changed = false;
            if (identity.name !== name) {
                identity.name = name;
                changed = true;
            }
            if (role !== undefined && identity.role !== role) {
                identity.role = role;
                changed = true;
            }
            if (contactNumber !== undefined && identity.contactNumber !== contactNumber) {
                identity.contactNumber = contactNumber;
                changed = true;
            }
            if (changed)
                await identity.save();
        }
        players.push({
            playerId: identity._id,
            name: identity.name,
            username: identity.username,
            role: role !== null && role !== void 0 ? role : (savedPlayerIndex !== 0 && !requestedRole ? identity.role : undefined),
            contactNumber: (_b = normalizeOptionalText(record.contactNumber)) !== null && _b !== void 0 ? _b : identity.contactNumber,
        });
    }
    return players;
};
// When a saved team is edited, push the identity fields (name/logo/captain/
// contact/roster info) into any tournament team registrations that were
// created from it, so the tournament view reflects the latest My Teams data
// without requiring the organizer to re-register the team. Match statistics
// are never touched here, and players already on a tournament roster are
// never removed (only updated or appended) so completed-match history stays
// intact even if a player was later removed from the saved team.
const syncLinkedTournamentTeams = async (team) => {
    const linkedTeams = await TournamentTeam_1.TournamentTeam.find({ sourceTeamId: team._id });
    if (!linkedTeams.length)
        return;
    await Promise.all(linkedTeams.map(async (tournamentTeam) => {
        tournamentTeam.name = team.name;
        if (team.logoUrl)
            tournamentTeam.logoUrl = team.logoUrl;
        if (team.captainName)
            tournamentTeam.captainName = team.captainName;
        if (team.contactNumber)
            tournamentTeam.contactNumber = team.contactNumber;
        const existingByPlayerId = new Map(tournamentTeam.players
            .filter((player) => player.playerId)
            .map((player) => [String(player.playerId), player]));
        const syncedPlayers = team.players.map((savedPlayer) => {
            const existing = existingByPlayerId.get(String(savedPlayer.playerId));
            existingByPlayerId.delete(String(savedPlayer.playerId));
            return Object.assign(Object.assign({}, (existing
                ? { _id: existing._id, statistics: existing.statistics }
                : {})), { playerId: savedPlayer.playerId, username: savedPlayer.username, name: savedPlayer.name, role: savedPlayer.role, contactNumber: savedPlayer.contactNumber });
        });
        // Any tournament-only players left over (removed from My Teams but
        // already part of this tournament, possibly with match stats) are kept
        // as-is rather than deleted.
        const leftoverPlayers = Array.from(existingByPlayerId.values()).map((player) => ({
            _id: player._id,
            playerId: player.playerId,
            username: player.username,
            name: player.name,
            role: player.role,
            contactNumber: player.contactNumber,
            statistics: player.statistics,
        }));
        tournamentTeam.players = [
            ...syncedPlayers,
            ...leftoverPlayers,
        ];
        await tournamentTeam.save();
    }));
};
// Preserve each player's stable subdocument _id across edits so that IDs the
// client already has (e.g. from a previous fetch) don't silently change
// underneath it every time the roster is saved.
const mergeSavedTeamPlayers = (existingPlayers, incomingPlayers) => {
    const existingByPlayerId = new Map();
    const existingByName = new Map();
    existingPlayers.forEach((player) => {
        if (player.playerId) {
            existingByPlayerId.set(String(player.playerId), player);
        }
        existingByName.set(player.name.toLowerCase(), player);
    });
    return incomingPlayers.map((incoming) => {
        const existing = existingByPlayerId.get(String(incoming.playerId)) ||
            existingByName.get(incoming.name.toLowerCase());
        return existing ? Object.assign(Object.assign({}, incoming), { _id: existing._id }) : incoming;
    });
};
const getSavedPlayerTeams = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const teams = await SavedPlayerTeam_1.SavedPlayerTeam.find({
            owner: new mongoose_1.Types.ObjectId(req.user.id),
        }).sort({ updatedAt: -1, name: 1 });
        res.status(200).json({ teams: teams.map(serializeSavedTeam) });
    }
    catch (error) {
        console.error("Get saved player teams error", error);
        res.status(500).json({ message: "Unable to load player teams" });
    }
};
exports.getSavedPlayerTeams = getSavedPlayerTeams;
const createSavedPlayerTeam = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const name = normalizeText((_a = req.body) === null || _a === void 0 ? void 0 : _a.name);
        const players = await resolveSavedTeamPlayers((_b = req.body) === null || _b === void 0 ? void 0 : _b.players, req.user.id);
        const captainName = normalizeText((_c = req.body) === null || _c === void 0 ? void 0 : _c.captainName) || ((_d = players[0]) === null || _d === void 0 ? void 0 : _d.name) || "";
        const contactNumber = normalizeText((_e = req.body) === null || _e === void 0 ? void 0 : _e.contactNumber);
        if (!name) {
            res.status(400).json({ message: "Team name is required" });
            return;
        }
        if (!((_f = players[0]) === null || _f === void 0 ? void 0 : _f.name)) {
            res.status(400).json({ message: "Player 1 captain is required" });
            return;
        }
        if (players.length < MIN_TEAM_PLAYERS) {
            res.status(400).json({
                message: `Add at least ${MIN_TEAM_PLAYERS} players`,
            });
            return;
        }
        const team = await SavedPlayerTeam_1.SavedPlayerTeam.create({
            owner: new mongoose_1.Types.ObjectId(req.user.id),
            name,
            logoUrl: normalizeOptionalText((_g = req.body) === null || _g === void 0 ? void 0 : _g.logoUrl),
            captainName,
            contactNumber,
            players,
        });
        res.status(201).json({ team: serializeSavedTeam(team) });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
            res.status(409).json({ message: "You already have a team with this name" });
            return;
        }
        console.error("Create saved player team error", error);
        res.status(500).json({ message: "Unable to save player team" });
    }
};
exports.createSavedPlayerTeam = createSavedPlayerTeam;
const updateSavedPlayerTeam = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const team = await SavedPlayerTeam_1.SavedPlayerTeam.findOne({
            _id: req.params.teamId,
            owner: new mongoose_1.Types.ObjectId(req.user.id),
        });
        if (!team) {
            res.status(404).json({ message: "Player team not found" });
            return;
        }
        if (((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) !== undefined)
            team.name = normalizeText(req.body.name);
        if (((_b = req.body) === null || _b === void 0 ? void 0 : _b.logoUrl) !== undefined) {
            team.logoUrl = normalizeOptionalText(req.body.logoUrl);
        }
        if (((_c = req.body) === null || _c === void 0 ? void 0 : _c.captainName) !== undefined) {
            team.captainName = normalizeText(req.body.captainName);
        }
        if (((_d = req.body) === null || _d === void 0 ? void 0 : _d.contactNumber) !== undefined) {
            team.contactNumber = normalizeText(req.body.contactNumber);
        }
        if (((_e = req.body) === null || _e === void 0 ? void 0 : _e.players) !== undefined) {
            const players = await resolveSavedTeamPlayers(req.body.players, req.user.id);
            if (!((_f = players[0]) === null || _f === void 0 ? void 0 : _f.name)) {
                res.status(400).json({ message: "Player 1 captain is required" });
                return;
            }
            if (players.length < MIN_TEAM_PLAYERS) {
                res.status(400).json({
                    message: `Add at least ${MIN_TEAM_PLAYERS} players`,
                });
                return;
            }
            team.players = mergeSavedTeamPlayers(team.players, players);
            team.captainName = normalizeText((_g = req.body) === null || _g === void 0 ? void 0 : _g.captainName) || players[0].name;
        }
        if (!team.name) {
            res.status(400).json({ message: "Team name is required" });
            return;
        }
        if (!((_h = team.players[0]) === null || _h === void 0 ? void 0 : _h.name)) {
            res.status(400).json({ message: "Player 1 captain is required" });
            return;
        }
        if (team.players.length < MIN_TEAM_PLAYERS) {
            res.status(400).json({
                message: `Add at least ${MIN_TEAM_PLAYERS} players`,
            });
            return;
        }
        await team.save();
        await syncLinkedTournamentTeams(team);
        res.status(200).json({ team: serializeSavedTeam(team) });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
            res.status(409).json({ message: "You already have a team with this name" });
            return;
        }
        console.error("Update saved player team error", error);
        res.status(500).json({ message: "Unable to update player team" });
    }
};
exports.updateSavedPlayerTeam = updateSavedPlayerTeam;
const deleteSavedPlayerTeam = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const team = await SavedPlayerTeam_1.SavedPlayerTeam.findOne({
            _id: req.params.teamId,
            owner: new mongoose_1.Types.ObjectId(req.user.id),
        });
        if (!team) {
            res.status(404).json({ message: "Player team not found" });
            return;
        }
        const owner = new mongoose_1.Types.ObjectId(req.user.id);
        const linkedTournamentTeams = await TournamentTeam_1.TournamentTeam.find({
            organizer: owner,
            $or: [
                { sourceTeamId: team._id },
                { name: { $regex: `^${escapeRegExp(team.name)}$`, $options: "i" } },
            ],
        }).select("tournament");
        if (linkedTournamentTeams.length) {
            const tournamentIds = [
                ...new Set(linkedTournamentTeams.map((t) => String(t.tournament))),
            ];
            const tournaments = await Tournament_1.Tournament.find({
                _id: { $in: tournamentIds },
            }).select("name");
            const tournamentNames = tournaments.map((t) => t.name).filter(Boolean);
            res.status(409).json({
                message: tournamentNames.length
                    ? `Cannot delete "${team.name}" because it is registered in the tournament${tournamentNames.length > 1 ? "s" : ""}: ${tournamentNames.join(", ")}. Remove it from the tournament first.`
                    : `Cannot delete "${team.name}" because it is registered in an existing tournament. Remove it from the tournament first.`,
            });
            return;
        }
        await team.deleteOne();
        res.status(200).json({ message: "Player team deleted" });
    }
    catch (error) {
        console.error("Delete saved player team error", error);
        res.status(500).json({ message: "Unable to delete player team" });
    }
};
exports.deleteSavedPlayerTeam = deleteSavedPlayerTeam;
const getPublicPlayers = async (req, res) => {
    try {
        const q = normalizeText(req.query.q);
        const query = {};
        if (q) {
            query.$or = [
                { name: { $regex: q, $options: "i" } },
                { username: { $regex: q, $options: "i" } },
            ];
        }
        const players = await PlayerIdentity_1.PlayerIdentity.find(query)
            .sort({ name: 1 })
            .limit(50);
        res.status(200).json({ players: players.map(serializePlayerIdentity) });
    }
    catch (error) {
        console.error("Get public players error", error);
        res.status(500).json({ message: "Unable to load players" });
    }
};
exports.getPublicPlayers = getPublicPlayers;
//# sourceMappingURL=playerTeamController.js.map