"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePlayers = exports.getPlayers = void 0;
const mongoose_1 = require("mongoose");
const Player_1 = require("../models/Player");
const normalizeName = (value) => typeof value === "string" ? value.trim() : "";
const normalizePlayers = (players) => {
    if (!Array.isArray(players))
        return [];
    const seen = new Set();
    const result = [];
    players.forEach((player) => {
        const name = normalizeName(player);
        const key = name.toLowerCase();
        if (name && !seen.has(key)) {
            seen.add(key);
            result.push(name);
        }
    });
    return result;
};
const getPlayers = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const teams = typeof req.query.teams === "string"
            ? req.query.teams
                .split(",")
                .map((team) => team.trim())
                .filter(Boolean)
            : [];
        const query = {
            user: new mongoose_1.Types.ObjectId(req.user.id),
        };
        if (teams.length) {
            query.teamName = { $in: teams };
        }
        const rows = await Player_1.Player.find(query).sort({ teamName: 1, createdAt: 1 });
        const playersByTeam = rows.reduce((acc, row) => {
            var _a;
            acc[row.teamName] = [...((_a = acc[row.teamName]) !== null && _a !== void 0 ? _a : []), row.name];
            return acc;
        }, {});
        res.status(200).json({ playersByTeam });
    }
    catch (error) {
        console.error("Get players error", error);
        res.status(500).json({ message: "Unable to load players" });
    }
};
exports.getPlayers = getPlayers;
const savePlayers = async (req, res) => {
    var _a;
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const teams = Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.teams) ? req.body.teams : [];
        const user = new mongoose_1.Types.ObjectId(req.user.id);
        const saved = {};
        for (const team of teams) {
            const teamName = normalizeName(team === null || team === void 0 ? void 0 : team.teamName);
            const players = normalizePlayers(team === null || team === void 0 ? void 0 : team.players);
            if (!teamName)
                continue;
            await Player_1.Player.deleteMany({ user, teamName });
            if (players.length) {
                await Player_1.Player.insertMany(players.map((name) => ({
                    user,
                    teamName,
                    name,
                })), { ordered: false });
            }
            saved[teamName] = players;
        }
        res.status(200).json({ playersByTeam: saved });
    }
    catch (error) {
        console.error("Save players error", error);
        res.status(500).json({ message: "Unable to save players" });
    }
};
exports.savePlayers = savePlayers;
//# sourceMappingURL=playerController.js.map