import type { Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { resolveLiveIdentity, serializePublicPlayer } from "../utils/players";
import { canViewProfile, tournamentVisibilityOf, viewableTournamentIds } from "../utils/visibility";
import { PlayerIdentity } from "../models/PlayerIdentity";
import { SavedMatch } from "../models/SavedMatch";
import { SavedPlayerTeam } from "../models/SavedPlayerTeam";
import { Tournament } from "../models/Tournament";
import { TournamentMatch } from "../models/TournamentMatch";
import { TournamentTeam, type ITournamentTeam } from "../models/TournamentTeam";
import {
  aggregatePerformances,
  extractInnings,
  getPlayerPerformance,
  normalizeName,
  type InningsStats,
  type PlayerMatchPerformance,
  type SnapshotLike,
} from "../utils/matchStats";
import {
  computeAchievements,
  computeCareerInsights,
  type CareerMatchRow,
  type CareerPartnership,
} from "../utils/careerInsights";

// Upper bound on friendly (saved) matches scanned for one career profile, so
// a very active scorer can't make this endpoint unboundedly expensive.
const MAX_SAVED_MATCHES = 400;
const RECENT_MATCHES_LIMIT = 30;
const LEADERBOARD_LIMIT = 10;
// Anonymous career responses are identical for everyone, so keep them briefly
// to spare the database (and Render bandwidth) when a profile link is shared.
const ANON_CACHE_MS = 60_000;
const ANON_CACHE_MAX = 200;

const toObjectId = (value: unknown): Types.ObjectId | null =>
  typeof value === "string" && Types.ObjectId.isValid(value)
    ? new Types.ObjectId(value)
    : null;

const hasTwoTeamNames = (teams: unknown): teams is string[] =>
  Array.isArray(teams) &&
  teams.length >= 2 &&
  teams.slice(0, 2).every((t) => typeof t === "string" && t.trim() !== "");

/**
 * Tournament snapshots sometimes carry placeholder team names (["", ""]);
 * fill them from the match's team documents so the engine can line players
 * up with their innings. Also takes the winner from the match record, which
 * is authoritative for tournament results.
 */
export const resolveTournamentSnapshot = (
  snapshot: unknown,
  team1Name: string,
  team2Name: string,
  winnerName: string,
): SnapshotLike | null => {
  if (!snapshot || typeof snapshot !== "object") return null;
  const raw = snapshot as Record<string, unknown>;
  const events = (raw.recentEventsByTeams ?? {}) as Record<string, unknown>;
  let teams = hasTwoTeamNames(raw.teams) ? (raw.teams as string[]) : [team1Name, team2Name];
  // Batting order: whichever team's events exist under the given names.
  if (!teams.every((t) => t in events) && [team1Name, team2Name].every((t) => t in events)) {
    teams = [team1Name, team2Name];
  }
  return {
    ...raw,
    teams,
    winningTeam: winnerName || (typeof raw.winningTeam === "string" ? raw.winningTeam : ""),
  };
};

type MatchSource = "tournament" | "friendly";

interface RecentMatchRow {
  matchId: string;
  source: MatchSource;
  date: string;
  team: string;
  opponent: string;
  tournamentId?: string;
  tournamentName?: string;
  result: PlayerMatchPerformance["result"];
  batting?: PlayerMatchPerformance["batting"];
  bowling?: PlayerMatchPerformance["bowling"];
  fielding: PlayerMatchPerformance["fielding"];
}

const toIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : typeof value === "string" ? value : "";

/** The player's stands in their own team's innings, from their point of view. */
const partnershipsFor = (innings: InningsStats[], teamName: string, playerName: string): CareerPartnership[] => {
  const teamKey = normalizeName(teamName);
  const me = normalizeName(playerName);
  const inn = innings.find((i) => normalizeName(i.battingTeam) === teamKey);
  if (!inn) return [];
  return inn.partnerships
    .filter((p) => p.runs > 0 && p.batter1 && p.batter2 && [p.batter1, p.batter2].some((b) => normalizeName(b) === me))
    .map((p) => {
      const first = normalizeName(p.batter1) === me;
      return {
        partner: first ? p.batter2 : p.batter1,
        wicket: p.number,
        runs: p.runs,
        balls: p.balls,
        ownRuns: first ? p.batter1Runs : p.batter2Runs,
        unbroken: p.unbroken,
      };
    });
};

export interface CareerViewer {
  /** Logged-in user looking at the profile, if any. */
  userId?: string | null;
  /** The viewer owns this profile: everything is included. */
  isOwner?: boolean;
}

type CareerRow = CareerMatchRow & { sortTime: number };

/**
 * Career statistics for one player identity, across every tournament they
 * were registered in (any organizer) and every completed friendly match
 * scored with a saved team that includes them.
 *
 * Matches from private tournaments are only included when the viewer owns
 * the profile, organized that tournament, or played in it.
 */
export const computePlayerCareer = async (playerObjectId: Types.ObjectId, viewer: CareerViewer = {}) => {
  const rows: CareerRow[] = [];

  // ---- Tournament matches -------------------------------------------
  const playerTeams = await TournamentTeam.find({ "players.playerId": playerObjectId })
    .select("tournament name players")
    .lean();
  const nameInTeam = new Map<string, string>();
  playerTeams.forEach((team) => {
    const entry = (team.players ?? []).find(
      (p) => p.playerId && String(p.playerId) === String(playerObjectId),
    );
    if (entry) nameInTeam.set(String(team._id), entry.name);
  });
  const allTournamentIds = Array.from(new Set(playerTeams.map((t) => String(t.tournament))));
  const allTournaments = await Tournament.find({ _id: { $in: allTournamentIds } })
    .select("name logoUrl startDate endDate status organizer visibility")
    .lean();
  const allowed = viewer.isOwner
    ? new Set(allTournaments.map((t) => String(t._id)))
    : await viewableTournamentIds(allTournaments, viewer.userId);
  const tournaments = allTournaments.filter((t) => allowed.has(String(t._id)));
  const tournamentIds = tournaments.map((t) => t._id);
  const playerTeamIds = playerTeams.filter((t) => allowed.has(String(t.tournament))).map((t) => t._id);

  const tournamentMatches = tournamentIds.length
    ? await TournamentMatch.find({
        tournament: { $in: tournamentIds },
        status: "completed",
        $or: [{ team1: { $in: playerTeamIds } }, { team2: { $in: playerTeamIds } }],
      })
        .select("tournament team1 team2 winnerTeam snapshot completedAt updatedAt")
        .lean()
    : [];
  const tournamentById = new Map(tournaments.map((t) => [String(t._id), t]));
  const opponentIds = tournamentMatches.flatMap((m) => [m.team1, m.team2]);
  const allTeams = opponentIds.length
    ? await TournamentTeam.find({ _id: { $in: opponentIds } }).select("name").lean()
    : [];
  const teamNameById = new Map(allTeams.map((t) => [String(t._id), t.name]));

  const perTournament = new Map<string, { teamName: string; perfs: PlayerMatchPerformance[] }>();
  tournamentMatches.forEach((match) => {
    const team1Id = String(match.team1);
    const team2Id = String(match.team2);
    const ownTeamId = nameInTeam.has(team1Id) ? team1Id : nameInTeam.has(team2Id) ? team2Id : "";
    if (!ownTeamId) return;
    const snapshot = resolveTournamentSnapshot(
      match.snapshot,
      teamNameById.get(team1Id) ?? "",
      teamNameById.get(team2Id) ?? "",
      match.winnerTeam ? teamNameById.get(String(match.winnerTeam)) ?? "" : "",
    );
    const ownTeamName = teamNameById.get(ownTeamId) ?? "";
    const playerName = nameInTeam.get(ownTeamId) ?? "";
    const innings = extractInnings(snapshot);
    const perf = getPlayerPerformance(snapshot, ownTeamName, playerName, innings);
    if (!perf) return;
    const tournamentId = String(match.tournament);
    const bucket = perTournament.get(tournamentId) ?? { teamName: ownTeamName, perfs: [] };
    bucket.perfs.push(perf);
    perTournament.set(tournamentId, bucket);
    const date = match.completedAt ?? match.updatedAt;
    rows.push({
      matchId: String(match._id),
      source: "tournament",
      date: toIso(date),
      sortTime: date ? new Date(date).getTime() : 0,
      team: perf.team,
      opponent: perf.opponent,
      tournamentId,
      tournamentName: tournamentById.get(tournamentId)?.name ?? "",
      perf,
      partnerships: partnershipsFor(innings, ownTeamName, playerName),
    });
  });

  // ---- Friendly (saved) matches ---------------------------------------
  // Saved matches only store player names, so link them through the saved
  // teams that include this player: same owner + team name + player name.
  const savedTeams = await SavedPlayerTeam.find({ "players.playerId": playerObjectId })
    .select("owner name players")
    .lean();
  const links = savedTeams.flatMap((team) => {
    const entry = (team.players ?? []).find((p) => String(p.playerId) === String(playerObjectId));
    return entry ? [{ owner: String(team.owner), teamName: team.name, playerName: entry.name }] : [];
  });
  if (links.length > 0) {
    const savedMatches = await SavedMatch.find({
      status: "completed",
      $or: links.map((l) => ({ user: new Types.ObjectId(l.owner), teams: l.teamName })),
    })
      .sort({ savedAt: -1 })
      .limit(MAX_SAVED_MATCHES)
      .select("user teams snapshot savedAt")
      .lean();
    savedMatches.forEach((match) => {
      const owner = String(match.user);
      const link = links.find(
        (l) =>
          l.owner === owner &&
          (match.teams ?? []).some((t) => normalizeName(t) === normalizeName(l.teamName)),
      );
      if (!link) return;
      const snapshot = match.snapshot as SnapshotLike;
      const innings = extractInnings(snapshot);
      const perf = getPlayerPerformance(snapshot, link.teamName, link.playerName, innings);
      if (!perf) return;
      rows.push({
        matchId: String(match._id),
        source: "friendly",
        date: toIso(match.savedAt),
        sortTime: match.savedAt ? new Date(match.savedAt).getTime() : 0,
        team: perf.team,
        opponent: perf.opponent,
        perf,
        partnerships: partnershipsFor(innings, link.teamName, link.playerName),
      });
    });
  }

  rows.sort((a, b) => b.sortTime - a.sortTime);
  const tournamentRows = rows.filter((r) => r.source === "tournament");
  const friendlyRows = rows.filter((r) => r.source === "friendly");
  const privateTournamentIds = new Set(
    tournaments.filter((t) => tournamentVisibilityOf(t) === "private").map((t) => String(t._id)),
  );

  return {
    overall: aggregatePerformances(rows.map((r) => r.perf)),
    tournament: aggregatePerformances(tournamentRows.map((r) => r.perf)),
    friendly: aggregatePerformances(friendlyRows.map((r) => r.perf)),
    tournaments: Array.from(perTournament.entries())
      .map(([tournamentId, bucket]) => {
        const t = tournamentById.get(tournamentId);
        return {
          tournamentId,
          name: t?.name ?? "",
          logoUrl: t?.logoUrl ?? "",
          status: t?.status ?? "",
          visibility: t ? tournamentVisibilityOf(t) : "private",
          startDate: toIso(t?.startDate),
          teamName: bucket.teamName,
          stats: aggregatePerformances(bucket.perfs),
        };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    recentMatches: rows.slice(0, RECENT_MATCHES_LIMIT).map(
      ({ perf, sortTime, partnerships, ...row }): RecentMatchRow => ({
        ...row,
        result: perf.result,
        batting: perf.batting,
        bowling: perf.bowling,
        fielding: perf.fielding,
      }),
    ),
    ...computeAchievements(rows),
    insights: {
      overall: computeCareerInsights(rows),
      tournament: computeCareerInsights(tournamentRows),
      friendly: computeCareerInsights(friendlyRows),
    },
    privacy: {
      /** Matches from private tournaments: only the owner (and people in them) see these. */
      privateMatches: tournamentRows.filter((r) => r.tournamentId && privateTournamentIds.has(r.tournamentId)).length,
    },
  };
};

const anonCache = new Map<string, { at: number; body: unknown }>();
const readAnonCache = (key: string) => {
  const hit = anonCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ANON_CACHE_MS) {
    anonCache.delete(key);
    return null;
  }
  return hit.body;
};
const writeAnonCache = (key: string, body: unknown) => {
  if (anonCache.size >= ANON_CACHE_MAX) {
    const oldest = anonCache.keys().next().value;
    if (oldest !== undefined) anonCache.delete(oldest);
  }
  anonCache.set(key, { at: Date.now(), body });
};

/**
 * GET /api/v1/players/:playerId/stats  (login optional)
 * Public and unlisted profiles are open to anyone; hidden ones only to their
 * owner. An old record that was claimed into a profile answers with that
 * profile's stats and `redirectTo`.
 */
export const getPlayerCareerStats = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const playerObjectId = toObjectId(req.params.playerId);
    if (!playerObjectId) {
      res.status(400).json({ message: "Valid player id is required" });
      return;
    }
    const identity = await resolveLiveIdentity(playerObjectId);
    if (!identity) {
      res.status(404).json({ message: "Player not found" });
      return;
    }
    const viewerId = req.user?.id ?? null;
    const isOwner = Boolean(identity.user && viewerId && String(identity.user) === viewerId);
    if (!canViewProfile(identity, viewerId)) {
      res.status(403).json({ message: "This player's profile is private" });
      return;
    }

    const cacheKey = `${String(identity._id)}:${String(playerObjectId)}`;
    if (!viewerId) {
      const cached = readAnonCache(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "public, max-age=60");
        res.status(200).json(cached);
        return;
      }
    }

    const career = await computePlayerCareer(identity._id as Types.ObjectId, { userId: viewerId, isOwner });
    const body = {
      player: {
        ...serializePublicPlayer(identity),
        isOwner,
        visibility: identity.visibility ?? "public",
        memberSince: identity.claimedAt ?? (identity.user ? identity.createdAt : null),
      },
      redirectTo: String(identity._id) !== String(playerObjectId) ? String(identity._id) : undefined,
      ...career,
      // Others never learn how many private matches were left out.
      privacy: isOwner ? career.privacy : undefined,
    };
    if (!viewerId) writeAnonCache(cacheKey, body);
    res.setHeader("Cache-Control", viewerId ? "private, max-age=30" : "public, max-age=60");
    res.status(200).json(body);
  } catch (error) {
    console.error("getPlayerCareerStats failed", error);
    res.status(500).json({ message: "Unable to load player stats" });
  }
};

/**
 * Per-player figures and records for one tournament. With `forPublic`, roster
 * links to hidden profiles are dropped so the public page can't open them.
 */
export const computeTournamentPlayerStats = async (
  tournamentId: Types.ObjectId,
  { forPublic = false }: { forPublic?: boolean } = {},
) => {
  const [teams, matches] = await Promise.all([
    TournamentTeam.find({ tournament: tournamentId }).lean(),
    TournamentMatch.find({ tournament: tournamentId, status: "completed" })
      .select("team1 team2 winnerTeam snapshot completedAt")
      .sort({ completedAt: 1 })
      .lean(),
  ]);
  const teamById = new Map(teams.map((t) => [String(t._id), t as unknown as ITournamentTeam]));

  let visibleProfileIds: Set<string> | null = null;
  if (forPublic) {
    const ids = teams.flatMap((t) => (t.players ?? []).flatMap((p) => (p.playerId ? [p.playerId] : [])));
    const visible = await PlayerIdentity.find({ _id: { $in: ids }, visibility: { $ne: "hidden" }, mergedInto: { $exists: false } })
      .select("_id")
      .lean();
    visibleProfileIds = new Set(visible.map((p) => String(p._id)));
  }
  const linkFor = (playerId: unknown) => {
    if (!playerId) return "";
    const id = String(playerId);
    return !visibleProfileIds || visibleProfileIds.has(id) ? id : "";
  };

  const perfsByPlayer = new Map<string, PlayerMatchPerformance[]>();
  const topInnings: Array<Record<string, unknown> & { runs: number; balls: number }> = [];
  const bestBowling: Array<Record<string, unknown> & { wickets: number; runs: number }> = [];
  const partnerships: Array<Record<string, unknown> & { runs: number; balls: number }> = [];

  matches.forEach((match) => {
    const team1 = teamById.get(String(match.team1));
    const team2 = teamById.get(String(match.team2));
    if (!team1 || !team2) return;
    const snapshot = resolveTournamentSnapshot(
      match.snapshot,
      team1.name,
      team2.name,
      match.winnerTeam ? teamById.get(String(match.winnerTeam))?.name ?? "" : "",
    );
    if (!snapshot) return;
    const innings: InningsStats[] = extractInnings(snapshot);
    const matchId = String(match._id);

    [team1, team2].forEach((team) => {
      (team.players ?? []).forEach((player) => {
        const perf = getPlayerPerformance(snapshot, team.name, player.name, innings);
        if (!perf) return;
        const key = String(player._id);
        const list = perfsByPlayer.get(key) ?? [];
        list.push(perf);
        perfsByPlayer.set(key, list);
        const base = {
          matchId,
          playerKey: key,
          playerId: linkFor(player.playerId),
          name: player.name,
          teamName: team.name,
          opponent: perf.opponent,
        };
        if (perf.batting && (perf.batting.balls > 0 || perf.batting.runs > 0 || perf.batting.out)) {
          topInnings.push({ ...base, runs: perf.batting.runs, balls: perf.batting.balls, notOut: !perf.batting.out, fours: perf.batting.fours, sixes: perf.batting.sixes });
        }
        if (perf.bowling && perf.bowling.balls > 0) {
          bestBowling.push({ ...base, wickets: perf.bowling.wickets, runs: perf.bowling.runs, balls: perf.bowling.balls });
        }
      });
    });

    innings.forEach((inn) => {
      inn.partnerships
        .filter((p) => p.batter1 && p.batter2 && p.runs > 0)
        .forEach((p) => {
          partnerships.push({
            matchId,
            teamName: inn.battingTeam,
            opponent: inn.bowlingTeam,
            wicket: p.number,
            batter1: p.batter1,
            batter2: p.batter2,
            batter1Runs: p.batter1Runs,
            batter2Runs: p.batter2Runs,
            extras: p.extras,
            runs: p.runs,
            balls: p.balls,
            unbroken: p.unbroken,
          });
        });
    });
  });

  const players = teams.flatMap((team) =>
    (team.players ?? []).map((player) => ({
      playerKey: String(player._id),
      playerId: linkFor(player.playerId),
      name: player.name,
      role: player.role ?? "",
      teamId: String(team._id),
      teamName: team.name,
      teamLogoUrl: team.logoUrl ?? "",
      stats: aggregatePerformances(perfsByPlayer.get(String(player._id)) ?? []),
    })),
  );

  return {
    tournamentId: String(tournamentId),
    matchesCounted: matches.length,
    players,
    records: {
      topInnings: topInnings
        .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
        .slice(0, LEADERBOARD_LIMIT),
      bestBowling: bestBowling
        .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
        .slice(0, LEADERBOARD_LIMIT),
      partnerships: partnerships
        .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
        .slice(0, LEADERBOARD_LIMIT),
    },
  };
};

/**
 * GET /api/v1/tournaments/:tournamentId/player-stats
 * Full per-player figures for one tournament (organizer only), plus records:
 * top individual innings, best bowling, and highest partnerships.
 */
export const getTournamentPlayerStats = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const tournamentObjectId = toObjectId(req.params.tournamentId);
    if (!tournamentObjectId) {
      res.status(400).json({ message: "Valid tournament id is required" });
      return;
    }
    const organizer = new Types.ObjectId(req.user.id);
    const tournament = await Tournament.findOne({ _id: tournamentObjectId, organizer }).select("_id").lean();
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }
    res.status(200).json(await computeTournamentPlayerStats(tournamentObjectId));
  } catch (error) {
    console.error("getTournamentPlayerStats failed", error);
    res.status(500).json({ message: "Unable to load tournament player stats" });
  }
};
