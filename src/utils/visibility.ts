import { Types } from "mongoose";
import { PlayerIdentity, type IPlayerIdentity } from "../models/PlayerIdentity";
import type { ITournament, TournamentVisibility } from "../models/Tournament";
import { TournamentTeam } from "../models/TournamentTeam";

/** Tournaments created before visibility existed have no value: treat as public. */
export const tournamentVisibilityOf = (t: Pick<ITournament, "visibility"> | { visibility?: unknown }): TournamentVisibility =>
  t.visibility === "private" || t.visibility === "unlisted" ? t.visibility : "public";

/** The live player profile owned by a user account, if any. */
export const findViewerIdentityId = async (userId?: string | null): Promise<Types.ObjectId | null> => {
  if (!userId || !Types.ObjectId.isValid(userId)) return null;
  const me = await PlayerIdentity.findOne({ user: new Types.ObjectId(userId), mergedInto: { $exists: false } })
    .select("_id")
    .lean();
  return me ? (me._id as Types.ObjectId) : null;
};

/**
 * Which of these tournaments the viewer may see: public and unlisted ones
 * for anyone; private ones only for their organizer and registered players
 * in their squads.
 */
export const viewableTournamentIds = async (
  tournaments: Array<{ _id: unknown; organizer?: unknown; visibility?: unknown }>,
  viewerUserId?: string | null,
): Promise<Set<string>> => {
  const allowed = new Set<string>();
  const privateIds: string[] = [];
  tournaments.forEach((t) => {
    const id = String(t._id);
    if (tournamentVisibilityOf(t) !== "private") allowed.add(id);
    else if (viewerUserId && String(t.organizer) === viewerUserId) allowed.add(id);
    else privateIds.push(id);
  });
  if (privateIds.length && viewerUserId) {
    const viewerIdentity = await findViewerIdentityId(viewerUserId);
    if (viewerIdentity) {
      const teams = await TournamentTeam.find({
        tournament: { $in: privateIds.map((id) => new Types.ObjectId(id)) },
        "players.playerId": viewerIdentity,
      })
        .select("tournament")
        .lean();
      teams.forEach((t) => allowed.add(String(t.tournament)));
    }
  }
  return allowed;
};

export const canViewTournament = async (
  tournament: { _id: unknown; organizer?: unknown; visibility?: unknown },
  viewerUserId?: string | null,
) => (await viewableTournamentIds([tournament], viewerUserId)).has(String(tournament._id));

/**
 * Hidden profiles are only visible to their owner (or, for a record nobody
 * has claimed yet, the organizer who created it). Unlisted ones open by link.
 */
export const canViewProfile = (
  identity: Pick<IPlayerIdentity, "visibility" | "user" | "createdBy">,
  viewerUserId?: string | null,
) => {
  if (identity.visibility !== "hidden") return true;
  if (!viewerUserId) return false;
  return identity.user ? String(identity.user) === viewerUserId : String(identity.createdBy) === viewerUserId;
};

/** Listed in search and the explore page. */
export const isListedProfile = (identity: Pick<IPlayerIdentity, "visibility">) =>
  (identity.visibility ?? "public") === "public";
