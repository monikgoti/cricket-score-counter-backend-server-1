import type { Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { User } from "../models/User";
import { PlayerIdentity } from "../models/PlayerIdentity";
import { Tournament } from "../models/Tournament";
import { TournamentTeam } from "../models/TournamentTeam";
import { TournamentMatch } from "../models/TournamentMatch";
import { SavedMatch } from "../models/SavedMatch";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { getActiveUserCount } from "../utils/socketState";
import { deleteBlobQuietly } from "../utils/blobStorage";
import { recalculateTournamentStatistics } from "./tournamentController";

/*
 * Platform admin: every tournament, player and match across all accounts.
 * Mounted behind requireAuth + requireAdmin (ADMIN_EMAILS). Contact details
 * (email, phone) are included on purpose -- admins asked to see them.
 * Every change is written to the server log with the admin's email.
 */

const text = (value: unknown, max = 60) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oid = (value: unknown) =>
  typeof value === "string" && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
const DAY = 24 * 60 * 60 * 1000;

const audit = (req: AuthenticatedRequest, action: string, details: Record<string, unknown>) =>
  console.info("[admin]", JSON.stringify({ admin: req.user?.email, action, ...details, at: new Date().toISOString() }));

type Contact = { id: string; name: string; email: string; phone: string };

const contactsFor = async (ids: unknown[]): Promise<Map<string, Contact>> => {
  const unique = [...new Set(ids.filter(Boolean).map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select("name email phoneNumber").lean();
  return new Map(
    users.map((u: any) => [
      String(u._id),
      { id: String(u._id), name: u.name ?? "", email: u.email ?? "", phone: u.phoneNumber ?? "" },
    ]),
  );
};

const countBy = (rows: { _id: unknown; count: number }[]) =>
  Object.fromEntries(rows.map((row) => [String(row._id ?? "unknown"), row.count]));

/** GET /admin/overview */
export const getOverview = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const [
      users,
      newUsers,
      registeredPlayers,
      playerRecords,
      suspendedPlayers,
      tournamentsByStatus,
      newTournaments,
      tournamentMatchesByStatus,
      friendlyByStatus,
      matchesThisWeek,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      PlayerIdentity.countDocuments({ user: { $exists: true }, mergedInto: { $exists: false } }),
      PlayerIdentity.countDocuments({ user: { $exists: false }, mergedInto: { $exists: false } }),
      PlayerIdentity.countDocuments({ suspendedAt: { $exists: true } }),
      Tournament.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Tournament.countDocuments({ createdAt: { $gte: weekAgo } }),
      TournamentMatch.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      SavedMatch.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Promise.all([
        TournamentMatch.countDocuments({ createdAt: { $gte: weekAgo } }),
        SavedMatch.countDocuments({ createdAt: { $gte: weekAgo } }),
      ]).then(([a, b]) => a + b),
    ]);
    const tournaments = countBy(tournamentsByStatus);
    const tournamentMatches = countBy(tournamentMatchesByStatus);
    const friendly = countBy(friendlyByStatus);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    res.status(200).json({
      users: { total: users, newThisWeek: newUsers },
      players: { registered: registeredPlayers, records: playerRecords, suspended: suspendedPlayers },
      tournaments: { total: sum(tournaments), byStatus: tournaments, newThisWeek: newTournaments },
      matches: {
        tournament: { total: sum(tournamentMatches), byStatus: tournamentMatches },
        friendly: { total: sum(friendly), byStatus: friendly },
        newThisWeek: matchesThisWeek,
      },
      connectedNow: getActiveUserCount(),
    });
  } catch (error) {
    console.error("admin overview failed", error);
    res.status(500).json({ message: "Unable to load overview" });
  }
};

/** GET /admin/tournaments?q=&status=&page=&limit= */
export const listTournaments = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    const status = text(req.query.status, 20);
    if (["draft", "active", "completed"].includes(status)) query.status = status;
    const q = text(req.query.q);
    if (q) {
      const pattern = new RegExp(escapeRegExp(q), "i");
      const organizers = await User.find({ $or: [{ name: pattern }, { email: pattern }, { phoneNumber: pattern }] })
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
    const pagination = parsePagination(req.query as Record<string, unknown>, { limit: 20 });
    const [total, tournaments] = await Promise.all([
      Tournament.countDocuments(query),
      Tournament.find(query).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    ]);
    const ids = tournaments.map((t) => t._id);
    const [contacts, teamCounts, matchCounts] = await Promise.all([
      contactsFor(tournaments.map((t: any) => t.organizer)),
      TournamentTeam.aggregate([{ $match: { tournament: { $in: ids } } }, { $group: { _id: "$tournament", count: { $sum: 1 } } }]),
      TournamentMatch.aggregate([
        { $match: { tournament: { $in: ids } } },
        { $group: { _id: { t: "$tournament", s: "$status" }, count: { $sum: 1 } } },
      ]),
    ]);
    const teamsBy = new Map(teamCounts.map((r) => [String(r._id), r.count]));
    const matchesBy = new Map<string, Record<string, number>>();
    for (const row of matchCounts) {
      const key = String(row._id.t);
      matchesBy.set(key, { ...(matchesBy.get(key) ?? {}), [row._id.s]: row.count });
    }
    res.status(200).json({
      tournaments: tournaments.map((t: any) => ({
        id: String(t._id),
        name: t.name,
        location: t.location ?? "",
        status: t.status,
        format: t.format,
        squadMode: t.squadMode ?? "teams_only",
        oversPerMatch: t.oversPerMatch,
        logoUrl: t.logoUrl ?? "",
        organizerName: t.organizerName ?? "",
        organizer: contacts.get(String(t.organizer)) ?? null,
        teamsCount: teamsBy.get(String(t._id)) ?? 0,
        matches: matchesBy.get(String(t._id)) ?? {},
        startDate: t.startDate ?? null,
        createdAt: t.createdAt,
      })),
      pagination: buildPaginationMeta(total, pagination),
    });
  } catch (error) {
    console.error("admin listTournaments failed", error);
    res.status(500).json({ message: "Unable to load tournaments" });
  }
};

/** DELETE /admin/tournaments/:id -- the tournament with its teams and matches. */
export const deleteTournament = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = oid(req.params.id);
    const tournament = id ? await Tournament.findById(id) : null;
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }
    const [matches, teams] = await Promise.all([
      TournamentMatch.deleteMany({ tournament: tournament._id }),
      TournamentTeam.deleteMany({ tournament: tournament._id }),
    ]);
    await tournament.deleteOne();
    void deleteBlobQuietly(tournament.logoUrl);
    audit(req, "delete_tournament", {
      tournamentId: String(tournament._id),
      name: tournament.name,
      organizer: String(tournament.organizer),
      teams: teams.deletedCount,
      matches: matches.deletedCount,
    });
    res.status(200).json({ message: "Tournament deleted", teams: teams.deletedCount, matches: matches.deletedCount });
  } catch (error) {
    console.error("admin deleteTournament failed", error);
    res.status(500).json({ message: "Unable to delete tournament" });
  }
};

/** GET /admin/players?q=&type=all|registered|records|suspended&page=&limit= */
export const listPlayers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: Record<string, unknown> = { mergedInto: { $exists: false } };
    const type = text(req.query.type, 20);
    if (type === "registered") query.user = { $exists: true };
    else if (type === "records") query.user = { $exists: false };
    else if (type === "suspended") query.suspendedAt = { $exists: true };
    const q = text(req.query.q);
    if (q) {
      const pattern = new RegExp(escapeRegExp(q), "i");
      const users = await User.find({ $or: [{ email: pattern }, { phoneNumber: pattern }] }).select("_id").limit(200).lean();
      query.$or = [
        { name: pattern },
        { username: pattern },
        { city: pattern },
        { contactNumber: pattern },
        { user: { $in: users.map((u) => u._id) } },
      ];
    }
    const pagination = parsePagination(req.query as Record<string, unknown>, { limit: 25 });
    const [total, players] = await Promise.all([
      PlayerIdentity.countDocuments(query),
      PlayerIdentity.find(query).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    ]);
    const contacts = await contactsFor(players.flatMap((p: any) => [p.user, p.createdBy]));
    res.status(200).json({
      players: players.map((p: any) => ({
        id: String(p._id),
        name: p.name,
        username: p.username,
        role: p.role ?? "",
        city: p.city ?? "",
        contactNumber: p.contactNumber ?? "",
        hasAvatar: Boolean(p.avatarVersion),
        avatarUrl: p.avatarVersion ? `/api/v1/players/${String(p._id)}/avatar?v=${p.avatarVersion}` : "",
        registered: Boolean(p.user),
        account: p.user ? contacts.get(String(p.user)) ?? null : null,
        createdBy: p.user ? null : contacts.get(String(p.createdBy)) ?? null,
        visibility: p.visibility ?? "public",
        suspended: Boolean(p.suspendedAt),
        suspendedAt: p.suspendedAt ?? null,
        createdAt: p.createdAt,
      })),
      pagination: buildPaginationMeta(total, pagination),
    });
  } catch (error) {
    console.error("admin listPlayers failed", error);
    res.status(500).json({ message: "Unable to load players" });
  }
};

/** POST /admin/players/:id/suspension  { suspended: boolean } */
export const setPlayerSuspension = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = oid(req.params.id);
    const player = id ? await PlayerIdentity.findById(id) : null;
    if (!player) {
      res.status(404).json({ message: "Player not found" });
      return;
    }
    const suspend = req.body?.suspended !== false;
    if (suspend && !player.suspendedAt) {
      player.visibilityBeforeSuspension = player.visibility ?? "public";
      player.visibility = "hidden";
      player.suspendedAt = new Date();
    } else if (!suspend && player.suspendedAt) {
      player.visibility = player.visibilityBeforeSuspension ?? "public";
      player.suspendedAt = undefined;
      player.visibilityBeforeSuspension = undefined;
    }
    await player.save();
    audit(req, suspend ? "suspend_player" : "unsuspend_player", { playerId: String(player._id), username: player.username });
    res.status(200).json({ suspended: Boolean(player.suspendedAt), visibility: player.visibility });
  } catch (error) {
    console.error("admin setPlayerSuspension failed", error);
    res.status(500).json({ message: "Unable to update player" });
  }
};

/** GET /admin/matches?kind=tournament|friendly&status=&q=&page=&limit= */
export const listMatches = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kind = text(req.query.kind, 20) === "friendly" ? "friendly" : "tournament";
    const status = text(req.query.status, 20);
    const q = text(req.query.q);
    const pattern = q ? new RegExp(escapeRegExp(q), "i") : null;
    const pagination = parsePagination(req.query as Record<string, unknown>, { limit: 25 });

    if (kind === "friendly") {
      const query: Record<string, unknown> = {};
      if (["in_progress", "completed"].includes(status)) query.status = status;
      if (pattern) {
        const users = await User.find({ $or: [{ name: pattern }, { email: pattern }, { phoneNumber: pattern }] }).select("_id").limit(200).lean();
        query.$or = [{ teams: pattern }, { resultText: pattern }, { user: { $in: users.map((u) => u._id) } }];
      }
      const [total, matches] = await Promise.all([
        SavedMatch.countDocuments(query),
        SavedMatch.find(query).select("-snapshot").sort({ updatedAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      ]);
      const contacts = await contactsFor(matches.map((m: any) => m.user));
      res.status(200).json({
        kind,
        matches: matches.map((m: any) => ({
          id: String(m._id),
          kind,
          title: (m.teams ?? []).filter(Boolean).join(" vs ") || "Match",
          status: m.status,
          resultText: m.resultText ?? "",
          tournamentName: "",
          liveCode: "",
          scorer: contacts.get(String(m.user)) ?? null,
          startedAt: m.createdAt,
          updatedAt: m.savedAt ?? m.updatedAt,
        })),
        pagination: buildPaginationMeta(total, pagination),
      });
      return;
    }

    const query: Record<string, unknown> = {};
    if (["scheduled", "in_progress", "completed"].includes(status)) query.status = status;
    if (pattern) {
      const [teams, tournaments] = await Promise.all([
        TournamentTeam.find({ name: pattern }).select("_id").limit(300).lean(),
        Tournament.find({ name: pattern }).select("_id").limit(300).lean(),
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
      TournamentMatch.countDocuments(query),
      TournamentMatch.find(query).select("-snapshot").sort({ updatedAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    ]);
    const teamIds = matches.flatMap((m: any) => [m.team1, m.team2]);
    const [teams, tournaments, contacts] = await Promise.all([
      TournamentTeam.find({ _id: { $in: teamIds } }).select("name").lean(),
      Tournament.find({ _id: { $in: matches.map((m: any) => m.tournament) } }).select("name").lean(),
      contactsFor(matches.map((m: any) => m.organizer)),
    ]);
    const teamName = new Map(teams.map((t: any) => [String(t._id), t.name]));
    const tournamentName = new Map(tournaments.map((t: any) => [String(t._id), t.name]));
    res.status(200).json({
      kind,
      matches: matches.map((m: any) => ({
        id: String(m._id),
        kind,
        title: `${teamName.get(String(m.team1)) ?? "?"} vs ${teamName.get(String(m.team2)) ?? "?"}`,
        status: m.status,
        resultText: m.resultText ?? "",
        tournamentId: String(m.tournament),
        tournamentName: tournamentName.get(String(m.tournament)) ?? "",
        liveCode: m.liveCode ?? "",
        scorer: contacts.get(String(m.organizer)) ?? null,
        startedAt: m.startedAt ?? m.createdAt,
        updatedAt: m.completedAt ?? m.updatedAt,
      })),
      pagination: buildPaginationMeta(total, pagination),
    });
  } catch (error) {
    console.error("admin listMatches failed", error);
    res.status(500).json({ message: "Unable to load matches" });
  }
};

/** DELETE /admin/matches/:kind/:id -- tournament matches also refresh that tournament's table. */
export const deleteMatch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = oid(req.params.id);
    if (!id) {
      res.status(404).json({ message: "Match not found" });
      return;
    }
    if (req.params.kind === "friendly") {
      const match = await SavedMatch.findByIdAndDelete(id).select("teams user").lean();
      if (!match) {
        res.status(404).json({ message: "Match not found" });
        return;
      }
      audit(req, "delete_friendly_match", { matchId: String(id), teams: (match as any).teams, user: String((match as any).user) });
      res.status(200).json({ message: "Match deleted" });
      return;
    }
    const match = await TournamentMatch.findByIdAndDelete(id).lean();
    if (!match) {
      res.status(404).json({ message: "Match not found" });
      return;
    }
    // Points table and team stats no longer count it.
    if ((match as any).status === "completed") {
      await recalculateTournamentStatistics(match.tournament as Types.ObjectId, String(match.organizer));
    }
    audit(req, "delete_tournament_match", { matchId: String(id), tournamentId: String(match.tournament), status: (match as any).status });
    res.status(200).json({ message: "Match deleted" });
  } catch (error) {
    console.error("admin deleteMatch failed", error);
    res.status(500).json({ message: "Unable to delete match" });
  }
};
