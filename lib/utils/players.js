"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyAddedPlayers = exports.notify = exports.resolveLiveIdentity = exports.serializePublicPlayer = exports.avatarPath = exports.generateUniqueUsername = exports.USERNAME_PATTERN = void 0;
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const Notification_1 = require("../models/Notification");
exports.USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]{1,22}[a-z0-9])$/;
const toUsernameBase = (name) => {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 20);
    return base.length >= 3 ? base : `player.${Date.now().toString(36)}`;
};
const generateUniqueUsername = async (name) => {
    const base = toUsernameBase(name);
    let username = base;
    let suffix = 1;
    while (await PlayerIdentity_1.PlayerIdentity.exists({ username })) {
        suffix += 1;
        username = `${base}.${suffix}`;
    }
    return username;
};
exports.generateUniqueUsername = generateUniqueUsername;
/** Path the app uses to load a player's photo (cache-busted by version). */
const avatarPath = (player) => player.avatarVersion ? `/api/v1/players/${String(player._id)}/avatar?v=${player.avatarVersion}` : "";
exports.avatarPath = avatarPath;
/**
 * Fields that are safe to show anyone. Never includes the phone number or the
 * owning account.
 */
const serializePublicPlayer = (player) => {
    var _a, _b, _c, _d;
    return ({
        id: String(player._id),
        name: player.name,
        username: player.username,
        role: (_a = player.role) !== null && _a !== void 0 ? _a : "",
        city: (_b = player.city) !== null && _b !== void 0 ? _b : "",
        battingStyle: (_c = player.battingStyle) !== null && _c !== void 0 ? _c : "",
        bowlingStyle: (_d = player.bowlingStyle) !== null && _d !== void 0 ? _d : "",
        registered: Boolean(player.user),
        avatarUrl: (0, exports.avatarPath)(player),
    });
};
exports.serializePublicPlayer = serializePublicPlayer;
/** Follows claim merges so an old record id always resolves to the live profile. */
const resolveLiveIdentity = async (id) => {
    let current = await PlayerIdentity_1.PlayerIdentity.findById(id);
    for (let hops = 0; (current === null || current === void 0 ? void 0 : current.mergedInto) && hops < 5; hops += 1) {
        current = await PlayerIdentity_1.PlayerIdentity.findById(current.mergedInto);
    }
    return current;
};
exports.resolveLiveIdentity = resolveLiveIdentity;
const notify = async (userId, type, title, body, link, data) => {
    if (!userId)
        return;
    try {
        await Notification_1.Notification.create({ user: userId, type, title, body, link, data });
    }
    catch (error) {
        // Notifications are best-effort; never fail the main action over one.
        console.error("notify failed", error);
    }
};
exports.notify = notify;
/**
 * Tells registered players they were added to a squad. `previousIds` are the
 * player ids on the roster before the change, so only new additions are
 * notified, and the organizer is never notified about themselves.
 */
const notifyAddedPlayers = async (previousIds, playerIds, actorUserId, message) => {
    const added = Array.from(new Set(playerIds.filter(Boolean).map(String).filter((id) => !previousIds.has(id))));
    if (!added.length)
        return;
    const owners = await PlayerIdentity_1.PlayerIdentity.find({ _id: { $in: added }, user: { $exists: true } })
        .select("user")
        .lean();
    await Promise.all(owners
        .filter((o) => o.user && String(o.user) !== actorUserId)
        .map((o) => (0, exports.notify)(o.user, message.type, message.title, message.body, message.link, message.data)));
};
exports.notifyAddedPlayers = notifyAddedPlayers;
//# sourceMappingURL=players.js.map