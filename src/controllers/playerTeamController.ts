import type { Request, Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { PlayerIdentity, type IPlayerIdentity } from "../models/PlayerIdentity";
import {
  SavedPlayerTeam,
  type ISavedPlayerTeam,
  type ISavedTeamPlayer,
} from "../models/SavedPlayerTeam";
import { TournamentTeam } from "../models/TournamentTeam";
import { Tournament } from "../models/Tournament";

const MIN_TEAM_PLAYERS = 8;

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionalText = (value: unknown) => {
  const text = normalizeText(value);
  return text || undefined;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toUsernameBase = (name: string) => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
  return base || `player.${Date.now().toString(36)}`;
};

const ensureUniqueUsername = async (name: string) => {
  const base = toUsernameBase(name);
  let username = base;
  let suffix = 1;

  while (await PlayerIdentity.exists({ username })) {
    suffix += 1;
    username = `${base}.${suffix}`;
  }

  return username;
};

const serializePlayerIdentity = (player: IPlayerIdentity) => ({
  id: String(player._id),
  name: player.name,
  username: player.username,
  role: player.role ?? "",
  contactNumber: player.contactNumber ?? "",
  createdAt: player.createdAt,
  updatedAt: player.updatedAt,
});

const serializeSavedTeamPlayer = (player: ISavedTeamPlayer) => ({
  id: String(player._id ?? player.playerId),
  playerId: String(player.playerId),
  name: player.name,
  username: player.username,
  role: player.role ?? "",
  contactNumber: player.contactNumber ?? "",
});

const serializeSavedTeam = (team: ISavedPlayerTeam) => ({
  id: String(team._id),
  name: team.name,
  logoUrl: team.logoUrl ?? "",
  captainName: team.captainName,
  contactNumber: team.contactNumber,
  players: team.players.map(serializeSavedTeamPlayer),
  playerCount: team.players.length,
  createdAt: team.createdAt,
  updatedAt: team.updatedAt,
});

const resolveSavedTeamPlayers = async (
  playersInput: unknown,
  userId: string,
): Promise<ISavedTeamPlayer[]> => {
  if (!Array.isArray(playersInput)) {
    return [];
  }

  const owner = new Types.ObjectId(userId);
  const seen = new Set<string>();
  let hasViceCaptain = false;
  const players: ISavedTeamPlayer[] = [];

  for (const playerInput of playersInput) {
    const record: Record<string, unknown> =
      playerInput && typeof playerInput === "object"
        ? (playerInput as Record<string, unknown>)
        : { name: playerInput };
    const name = normalizeText(record.name);
    const key = name.toLowerCase();

    if (!name || seen.has(key)) {
      continue;
    }

    seen.add(key);
    const savedPlayerIndex = players.length;
    const requestedRole = normalizeOptionalText(record.role);
    let role =
      savedPlayerIndex === 0
        ? "Captain"
        : requestedRole === "Captain"
          ? undefined
          : requestedRole;
    if (role === "Vice Captain") {
      if (hasViceCaptain) {
        role = undefined;
      } else {
        hasViceCaptain = true;
      }
    }
    const requestedPlayerId = normalizeText(record.playerId ?? record.id);
    let identity: IPlayerIdentity | null = null;

    if (Types.ObjectId.isValid(requestedPlayerId)) {
      identity = await PlayerIdentity.findById(requestedPlayerId);
    }

    if (!identity) {
      const username = await ensureUniqueUsername(name);
      identity = await PlayerIdentity.create({
        createdBy: owner,
        name,
        username,
        role,
        contactNumber: normalizeOptionalText(record.contactNumber),
      });
    } else {
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
      if (changed) await identity.save();
    }

    players.push({
      playerId: identity._id as Types.ObjectId,
      name: identity.name,
      username: identity.username,
      role:
        role ??
        (savedPlayerIndex !== 0 && !requestedRole ? identity.role : undefined),
      contactNumber:
        normalizeOptionalText(record.contactNumber) ?? identity.contactNumber,
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
const syncLinkedTournamentTeams = async (
  team: ISavedPlayerTeam,
): Promise<void> => {
  const linkedTeams = await TournamentTeam.find({ sourceTeamId: team._id });
  if (!linkedTeams.length) return;

  await Promise.all(
    linkedTeams.map(async (tournamentTeam) => {
      tournamentTeam.name = team.name;
      if (team.logoUrl) tournamentTeam.logoUrl = team.logoUrl;
      if (team.captainName) tournamentTeam.captainName = team.captainName;
      if (team.contactNumber) tournamentTeam.contactNumber = team.contactNumber;

      const existingByPlayerId = new Map(
        tournamentTeam.players
          .filter((player) => player.playerId)
          .map((player) => [String(player.playerId), player]),
      );

      const syncedPlayers = team.players.map((savedPlayer) => {
        const existing = existingByPlayerId.get(String(savedPlayer.playerId));
        existingByPlayerId.delete(String(savedPlayer.playerId));
        return {
          ...(existing
            ? { _id: existing._id, statistics: existing.statistics }
            : {}),
          playerId: savedPlayer.playerId,
          username: savedPlayer.username,
          name: savedPlayer.name,
          role: savedPlayer.role,
          contactNumber: savedPlayer.contactNumber,
        };
      });

      // Any tournament-only players left over (removed from My Teams but
      // already part of this tournament, possibly with match stats) are kept
      // as-is rather than deleted.
      const leftoverPlayers = Array.from(existingByPlayerId.values()).map(
        (player) => ({
          _id: player._id,
          playerId: player.playerId,
          username: player.username,
          name: player.name,
          role: player.role,
          contactNumber: player.contactNumber,
          statistics: player.statistics,
        }),
      );

      tournamentTeam.players = [
        ...syncedPlayers,
        ...leftoverPlayers,
      ] as typeof tournamentTeam.players;

      await tournamentTeam.save();
    }),
  );
};

// Preserve each player's stable subdocument _id across edits so that IDs the
// client already has (e.g. from a previous fetch) don't silently change
// underneath it every time the roster is saved.
const mergeSavedTeamPlayers = (
  existingPlayers: ISavedTeamPlayer[],
  incomingPlayers: ISavedTeamPlayer[],
): ISavedTeamPlayer[] => {
  const existingByPlayerId = new Map<string, ISavedTeamPlayer>();
  const existingByName = new Map<string, ISavedTeamPlayer>();

  existingPlayers.forEach((player) => {
    if (player.playerId) {
      existingByPlayerId.set(String(player.playerId), player);
    }
    existingByName.set(player.name.toLowerCase(), player);
  });

  return incomingPlayers.map((incoming) => {
    const existing =
      existingByPlayerId.get(String(incoming.playerId)) ||
      existingByName.get(incoming.name.toLowerCase());

    return existing ? { ...incoming, _id: existing._id } : incoming;
  });
};

export const getSavedPlayerTeams = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const teams = await SavedPlayerTeam.find({
      owner: new Types.ObjectId(req.user.id),
    }).sort({ updatedAt: -1, name: 1 });

    res.status(200).json({ teams: teams.map(serializeSavedTeam) });
  } catch (error) {
    console.error("Get saved player teams error", error);
    res.status(500).json({ message: "Unable to load player teams" });
  }
};

export const createSavedPlayerTeam = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const name = normalizeText(req.body?.name);
    const players = await resolveSavedTeamPlayers(req.body?.players, req.user.id);
    const captainName = normalizeText(req.body?.captainName) || players[0]?.name || "";
    const contactNumber = normalizeText(req.body?.contactNumber);

    if (!name) {
      res.status(400).json({ message: "Team name is required" });
      return;
    }
    if (!players[0]?.name) {
      res.status(400).json({ message: "Player 1 captain is required" });
      return;
    }
    if (players.length < MIN_TEAM_PLAYERS) {
      res.status(400).json({
        message: `Add at least ${MIN_TEAM_PLAYERS} players`,
      });
      return;
    }

    const team = await SavedPlayerTeam.create({
      owner: new Types.ObjectId(req.user.id),
      name,
      logoUrl: normalizeOptionalText(req.body?.logoUrl),
      captainName,
      contactNumber,
      players,
    });

    res.status(201).json({ team: serializeSavedTeam(team) });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "You already have a team with this name" });
      return;
    }
    console.error("Create saved player team error", error);
    res.status(500).json({ message: "Unable to save player team" });
  }
};

export const updateSavedPlayerTeam = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const team = await SavedPlayerTeam.findOne({
      _id: req.params.teamId,
      owner: new Types.ObjectId(req.user.id),
    });
    if (!team) {
      res.status(404).json({ message: "Player team not found" });
      return;
    }

    if (req.body?.name !== undefined) team.name = normalizeText(req.body.name);
    if (req.body?.logoUrl !== undefined) {
      team.logoUrl = normalizeOptionalText(req.body.logoUrl);
    }
    if (req.body?.captainName !== undefined) {
      team.captainName = normalizeText(req.body.captainName);
    }
    if (req.body?.contactNumber !== undefined) {
      team.contactNumber = normalizeText(req.body.contactNumber);
    }
    if (req.body?.players !== undefined) {
      const players = await resolveSavedTeamPlayers(req.body.players, req.user.id);
      if (!players[0]?.name) {
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
      team.captainName = normalizeText(req.body?.captainName) || players[0].name;
    }

    if (!team.name) {
      res.status(400).json({ message: "Team name is required" });
      return;
    }
    if (!team.players[0]?.name) {
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
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "You already have a team with this name" });
      return;
    }
    console.error("Update saved player team error", error);
    res.status(500).json({ message: "Unable to update player team" });
  }
};

export const deleteSavedPlayerTeam = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const team = await SavedPlayerTeam.findOne({
      _id: req.params.teamId,
      owner: new Types.ObjectId(req.user.id),
    });
    if (!team) {
      res.status(404).json({ message: "Player team not found" });
      return;
    }

    const owner = new Types.ObjectId(req.user.id);
    const linkedTournamentTeams = await TournamentTeam.find({
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
      const tournaments = await Tournament.find({
        _id: { $in: tournamentIds },
      }).select("name");
      const tournamentNames = tournaments.map((t) => t.name).filter(Boolean);

      res.status(409).json({
        message: tournamentNames.length
          ? `Cannot delete "${team.name}" because it is registered in the tournament${
              tournamentNames.length > 1 ? "s" : ""
            }: ${tournamentNames.join(", ")}. Remove it from the tournament first.`
          : `Cannot delete "${team.name}" because it is registered in an existing tournament. Remove it from the tournament first.`,
      });
      return;
    }

    await team.deleteOne();

    res.status(200).json({ message: "Player team deleted" });
  } catch (error) {
    console.error("Delete saved player team error", error);
    res.status(500).json({ message: "Unable to delete player team" });
  }
};

export const getPublicPlayers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const q = normalizeText(req.query.q);
    const query: Record<string, unknown> = {};
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
      ];
    }

    const players = await PlayerIdentity.find(query)
      .sort({ name: 1 })
      .limit(50);

    res.status(200).json({ players: players.map(serializePlayerIdentity) });
  } catch (error) {
    console.error("Get public players error", error);
    res.status(500).json({ message: "Unable to load players" });
  }
};
