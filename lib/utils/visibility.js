"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isListedProfile = exports.canViewProfile = exports.canViewTournament = exports.viewableTournamentIds = exports.findViewerIdentityId = exports.tournamentVisibilityOf = void 0;
const mongoose_1 = require("mongoose");
const PlayerIdentity_1 = require("../models/PlayerIdentity");
const TournamentTeam_1 = require("../models/TournamentTeam");
/** Tournaments created before visibility existed have no value: treat as public. */
const tournamentVisibilityOf = (t) => t.visibility === "private" || t.visibility === "unlisted" ? t.visibility : "public";
exports.tournamentVisibilityOf = tournamentVisibilityOf;
/** The live player profile owned by a user account, if any. */
const findViewerIdentityId = async (userId) => {
    if (!userId || !mongoose_1.Types.ObjectId.isValid(userId))
        return null;
    const me = await PlayerIdentity_1.PlayerIdentity.findOne({ user: new mongoose_1.Types.ObjectId(userId), mergedInto: { $exists: false } })
        .select("_id")
        .lean();
    return me ? me._id : null;
};
exports.findViewerIdentityId = findViewerIdentityId;
/**
 * Which of these tournaments the viewer may see: public and unlisted ones
 * for anyone; private ones only for their organizer and registered players
 * in their squads.
 */
const viewableTournamentIds = async (tournaments, viewerUserId) => {
    const allowed = new Set();
    const privateIds = [];
    tournaments.forEach((t) => {
        const id = String(t._id);
        if ((0, exports.tournamentVisibilityOf)(t) !== "private")
            allowed.add(id);
        else if (viewerUserId && String(t.organizer) === viewerUserId)
            allowed.add(id);
        else
            privateIds.push(id);
    });
    if (privateIds.length && viewerUserId) {
        const viewerIdentity = await (0, exports.findViewerIdentityId)(viewerUserId);
        if (viewerIdentity) {
            const teams = await TournamentTeam_1.TournamentTeam.find({
                tournament: { $in: privateIds.map((id) => new mongoose_1.Types.ObjectId(id)) },
                "players.playerId": viewerIdentity,
            })
                .select("tournament")
                .lean();
            teams.forEach((t) => allowed.add(String(t.tournament)));
        }
    }
    return allowed;
};
exports.viewableTournamentIds = viewableTournamentIds;
const canViewTournament = async (tournament, viewerUserId) => (await (0, exports.viewableTournamentIds)([tournament], viewerUserId)).has(String(tournament._id));
exports.canViewTournament = canViewTournament;
/**
 * Hidden profiles are only visible to their owner (or, for a record nobody
 * has claimed yet, the organizer who created it). Unlisted ones open by link.
 */
const canViewProfile = (identity, viewerUserId) => {
    if (identity.visibility !== "hidden")
        return true;
    if (!viewerUserId)
        return false;
    return identity.user ? String(identity.user) === viewerUserId : String(identity.createdBy) === viewerUserId;
};
exports.canViewProfile = canViewProfile;
/** Listed in search and the explore page. */
const isListedProfile = (identity) => { var _a; return ((_a = identity.visibility) !== null && _a !== void 0 ? _a : "public") === "public"; };
exports.isListedProfile = isListedProfile;
//# sourceMappingURL=visibility.js.map