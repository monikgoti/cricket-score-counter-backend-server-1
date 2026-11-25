import type { Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { PlayerIdentity } from "../models/PlayerIdentity";
import { Tournament, TOURNAMENT_STATUSES, type ITournament } from "../models/Tournament";
import { TournamentMatch } from "../models/TournamentMatch";
import { TournamentTeam, type ITournamentTeam } from "../models/TournamentTeam";
import { extractInnings, formatOvers, type InningsStats } from "../utils/matchStats";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { serializePublicPlayer } from "../utils/players";
import { canViewTournament, tournamentVisibilityOf } from "../utils/visibility";
import { computeTournamentPlayerStats, resolveTournamentSnapshot } from "./playerStatsController";

// Everything here works without logging in. When a token is sent, private
// tournaments open for their organizer and the players in their squads.

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const oid = (value: unknown): Types.ObjectId | null =>
  typeof value === "string" && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;

const publicCache = (res: Response, viewerId: string | null, seconds: number) =>
  res.setHeader("Cache-Control", viewerId ? `private, max-age=${Math.min(seconds, 30)}` : `public, max-age=${seconds}`);

// ---------------------------------------------------------------- players

/**
 * GET /api/v1/explore/players?q=&page=&limit=
 * Registered public profiles. An unlisted profile only shows up when `q` is
 * its exact username (someone who already knows it).
 */
export const explorePlayers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = text(req.query.q, 60);
    const pagination = parsePagination(req.query as Record<string, unknown>, { limit: 24 });
    const base: Record<string, unknown> = {
      user: { $exists: true },
      mergedInto: { $exists: false },
      suspendedAt: { $exists: false },
    };
    let filter: Record<string, unknown> = { ...base, visibility: { $in: ["public", null] } };
    if (q.length >= 2) {
      const pattern = new RegExp(escapeRegExp(q), "i");
      filter = {
        $or: [
          { ...filter, $or: [{ name: pattern }, { username: pattern }, { city: pattern }] },
          { ...base, visibility: "unlisted", username: q.toLowerCase().replace(/^@/, "") },
        ],
      };
    }
    const [total, players] = await Promise.all([
      PlayerIdentity.countDocuments(filter),
      PlayerIdentity.find(filter)
        // No search: newest profiles first (the "latest" list on Explore).
        .sort(q ? { name: 1 } : { createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
    ]);
    publicCache(res, req.user?.id ?? null, 60);
    res.status(200).json({
      players: players.map((p) => serializePublicPlayer(p as any)),
      pagination: buildPaginationMeta(total, pagination),
    });
  } catch (error) {
    console.error("explorePlayers failed", error);
    res.status(500).json({ message: "Unable to load players" });
  }
};

// ---------------------------------------------------------------- tournaments

const tournamentSummary = (t: Pick<ITournament, "_id" | "name" | "organizerName" | "location" | "startDate" | "endDate" | "logoUrl" | "status" | "format" | "ballType" | "customBallType" | "oversPerMatch" | "visibility">) => ({
  id: String(t._id),
  name: t.name,
  organizerName: t.organizerName,
  location: t.location,
  startDate: t.startDate,
  endDate: t.endDate,
  logoUrl: t.logoUrl ?? "",
  status: t.status,
  format: t.format,
  ballType: t.ballType === "custom" ? t.customBallType || "custom" : t.ballType,
  oversPerMatch: t.oversPerMatch,
  visibility: tournamentVisibilityOf(t),
});

/** GET /api/v1/explore/tournaments?q=&status=&page=&limit= — public tournaments only. */
export const exploreTournaments = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = text(req.query.q, 60);
    const pagination = parsePagination(req.query as Record<string, unknown>, { limit: 20 });
    // Tournaments saved before visibility existed have no value and count as public.
    const filter: Record<string, unknown> = { visibility: { $in: ["public", null] } };
    if ((TOURNAMENT_STATUSES as readonly string[]).includes(String(req.query.status))) {
      filter.status = req.query.status;
    } else {
      // Drafts usually have no teams or matches yet: keep them off the list.
      filter.status = { $ne: "draft" };
    }
    if (q.length >= 2) {
      const pattern = new RegExp(escapeRegExp(q), "i");
      filter.$or = [{ name: pattern }, { location: pattern }, { organizerName: pattern }];
    }
    const [total, tournaments] = await Promise.all([
      Tournament.countDocuments(filter),
      Tournament.find(filter)
        .select("name organizerName location startDate endDate logoUrl status format ballType customBallType oversPerMatch visibility")
        // No search: newest tournaments first; a search groups by status.
        .sort(q.length >= 2 ? { status: 1, startDate: -1 } : { createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
    ]);
    const ids = tournaments.map((t) => t._id);
    const [teamCounts, matchCounts] = await Promise.all([
      TournamentTeam.aggregate([{ $match: { tournament: { $in: ids } } }, { $group: { _id: "$tournament", n: { $sum: 1 } } }]),
      TournamentMatch.aggregate([
        { $match: { tournament: { $in: ids }, status: "completed" } },
        { $group: { _id: "$tournament", n: { $sum: 1 } } },
      ]),
    ]);
    const teamsBy = new Map(teamCounts.map((c) => [String(c._id), c.n as number]));
    const matchesBy = new Map(matchCounts.map((c) => [String(c._id), c.n as number]));
    publicCache(res, req.user?.id ?? null, 60);
    res.status(200).json({
      tournaments: tournaments.map((t) => ({
        ...tournamentSummary(t as any),
        teamsCount: teamsBy.get(String(t._id)) ?? 0,
        matchesCompleted: matchesBy.get(String(t._id)) ?? 0,
      })),
      pagination: buildPaginationMeta(total, pagination),
    });
  } catch (error) {
    console.error("exploreTournaments failed", error);
    res.status(500).json({ message: "Unable to load tournaments" });
  }
};

/** Loads a tournament the viewer may see, or answers 404 (never reveals private ones). */
const loadViewableTournament = async (req: AuthenticatedRequest, res: Response) => {
  const id = oid(req.params.tournamentId);
  const tournament = id ? await Tournament.findById(id).lean() : null;
  if (!tournament || !(await canViewTournament(tournament, req.user?.id))) {
    res.status(404).json({ message: "This tournament doesn't exist or is private." });
    return null;
  }
  return tournament;
};

const inningsSummary = (innings: InningsStats[]) =>
  innings.map((i) => ({
    team: i.battingTeam,
    runs: i.runs,
    wickets: i.wickets,
    overs: formatOvers(i.legalBalls, i.ballsPerOver),
  }));

/**
 * GET /api/v1/explore/tournaments/:tournamentId
 * Overview, points table, squads and match results. No phone numbers, and
 * squad links only to players whose profiles aren't hidden.
 */
export const getPublicTournament = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadViewableTournament(req, res);
    if (!tournament) return;
    const viewerId = req.user?.id ?? null;
    const [teams, matches] = await Promise.all([
      TournamentTeam.find({ tournament: tournament._id })
        .sort({ "statistics.points": -1, "statistics.netRunRate": -1, name: 1 })
        .lean(),
      TournamentMatch.find({ tournament: tournament._id })
        .select("team1 team2 status winnerTeam resultText liveCode snapshot startedAt completedAt createdAt")
        .sort({ completedAt: -1, createdAt: -1 })
        .lean(),
    ]);
    const teamById = new Map(teams.map((t) => [String(t._id), t as unknown as ITournamentTeam]));
    const linkedIds = teams.flatMap((t) => (t.players ?? []).flatMap((p) => (p.playerId ? [p.playerId] : [])));
    const profiles = await PlayerIdentity.find({ _id: { $in: linkedIds }, visibility: { $ne: "hidden" }, mergedInto: { $exists: false } }).lean();
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));

    publicCache(res, viewerId, 60);
    res.status(200).json({
      tournament: {
        ...tournamentSummary(tournament),
        isOrganizer: Boolean(viewerId && String(tournament.organizer) === viewerId),
      },
      pointsTable: teams.map((t, index) => {
        const s = (t.statistics ?? {}) as Partial<ITournamentTeam["statistics"]>;
        return {
          rank: index + 1,
          teamId: String(t._id),
          name: t.name,
          logoUrl: t.logoUrl ?? "",
          played: s.matchesPlayed ?? 0,
          won: s.wins ?? 0,
          lost: s.losses ?? 0,
          tied: s.ties ?? 0,
          noResult: s.noResults ?? 0,
          points: s.points ?? 0,
          netRunRate: s.netRunRate ?? 0,
        };
      }),
      teams: teams.map((t) => ({
        id: String(t._id),
        name: t.name,
        logoUrl: t.logoUrl ?? "",
        captainName: t.captainName ?? "",
        players: (t.players ?? []).map((p) => {
          const profile = p.playerId ? profileById.get(String(p.playerId)) : undefined;
          return {
            name: p.name,
            role: p.role ?? "",
            player: profile ? serializePublicPlayer(profile as any) : null,
          };
        }),
      })),
      matches: matches.map((m) => {
        const t1 = teamById.get(String(m.team1));
        const t2 = teamById.get(String(m.team2));
        const winnerName = m.winnerTeam ? teamById.get(String(m.winnerTeam))?.name ?? "" : "";
        const snapshot = m.snapshot ? resolveTournamentSnapshot(m.snapshot, t1?.name ?? "", t2?.name ?? "", winnerName) : null;
        return {
          id: String(m._id),
          team1Id: String(m.team1),
          team2Id: String(m.team2),
          team1Name: t1?.name ?? "",
          team2Name: t2?.name ?? "",
          status: m.status,
          winnerTeamId: m.winnerTeam ? String(m.winnerTeam) : "",
          resultText: m.resultText ?? "",
          liveCode: m.status === "in_progress" ? m.liveCode ?? "" : "",
          date: m.completedAt ?? m.startedAt ?? m.createdAt,
          innings: snapshot ? inningsSummary(extractInnings(snapshot)) : [],
          hasScorecard: m.status === "completed" && Boolean(snapshot),
        };
      }),
    });
  } catch (error) {
    console.error("getPublicTournament failed", error);
    res.status(500).json({ message: "Unable to load tournament" });
  }
};

/** GET /api/v1/explore/tournaments/:tournamentId/matches/:matchId — full scorecard of a completed match. */
export const getPublicTournamentScorecard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadViewableTournament(req, res);
    if (!tournament) return;
    const matchId = oid(req.params.matchId);
    const match = matchId
      ? await TournamentMatch.findOne({ _id: matchId, tournament: tournament._id, status: "completed" })
          .select("team1 team2 winnerTeam resultText snapshot completedAt")
          .lean()
      : null;
    if (!match) {
      res.status(404).json({ message: "Match not found" });
      return;
    }
    const teams = await TournamentTeam.find({ _id: { $in: [match.team1, match.team2] } }).select("name").lean();
    const nameOf = (id: unknown) => teams.find((t) => String(t._id) === String(id))?.name ?? "";
    const snapshot = resolveTournamentSnapshot(match.snapshot, nameOf(match.team1), nameOf(match.team2), match.winnerTeam ? nameOf(match.winnerTeam) : "");
    // Completed matches never change, so this can be cached for a while.
    publicCache(res, req.user?.id ?? null, 600);
    res.status(200).json({
      matchId: String(match._id),
      team1Name: nameOf(match.team1),
      team2Name: nameOf(match.team2),
      resultText: match.resultText ?? "",
      date: match.completedAt ?? null,
      innings: extractInnings(snapshot).map((i) => ({ ...i, overs: undefined, oversText: formatOvers(i.legalBalls, i.ballsPerOver) })),
    });
  } catch (error) {
    console.error("getPublicTournamentScorecard failed", error);
    res.status(500).json({ message: "Unable to load scorecard" });
  }
};

/** GET /api/v1/explore/tournaments/:tournamentId/player-stats — leaders, records and per-player figures. */
export const getPublicTournamentPlayerStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await loadViewableTournament(req, res);
    if (!tournament) return;
    const isOrganizer = Boolean(req.user && String(tournament.organizer) === req.user.id);
    publicCache(res, req.user?.id ?? null, 120);
    res.status(200).json(
      await computeTournamentPlayerStats(tournament._id as Types.ObjectId, { forPublic: !isOrganizer }),
    );
  } catch (error) {
    console.error("getPublicTournamentPlayerStats failed", error);
    res.status(500).json({ message: "Unable to load tournament stats" });
  }
};
