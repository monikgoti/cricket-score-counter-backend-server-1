import type { Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  BALL_TYPES,
  Tournament,
  TOURNAMENT_FORMATS,
  TOURNAMENT_SQUAD_MODES,
  TOURNAMENT_STATUSES,
  type BallType,
  type ITournament,
  type TournamentFormat,
  type TournamentSquadMode,
  type TournamentStatus,
} from "../models/Tournament";
import {
  TournamentMatch,
  type ITournamentMatch,
} from "../models/TournamentMatch";
import {
  TournamentTeam,
  type ITeamStatistics,
  type ITournamentPlayerStatistics,
  type ITournamentPlayer,
  type ITournamentTeam,
} from "../models/TournamentTeam";
import {
  SavedPlayerTeam,
  type ISavedPlayerTeam,
} from "../models/SavedPlayerTeam";
import { trackEvent } from "../utils/analytics";
import { parsePagination, buildPaginationMeta } from "../utils/pagination";

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionalText = (value: unknown) => {
  const text = normalizeText(value);
  return text || undefined;
};

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parsePositiveNumber = (value: unknown): number | null => {
  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
};

const isTournamentFormat = (value: unknown): value is TournamentFormat =>
  typeof value === "string" &&
  TOURNAMENT_FORMATS.includes(value as TournamentFormat);

const isBallType = (value: unknown): value is BallType =>
  typeof value === "string" && BALL_TYPES.includes(value as BallType);

const isTournamentStatus = (value: unknown): value is TournamentStatus =>
  typeof value === "string" &&
  TOURNAMENT_STATUSES.includes(value as TournamentStatus);

const isTournamentSquadMode = (value: unknown): value is TournamentSquadMode =>
  typeof value === "string" &&
  TOURNAMENT_SQUAD_MODES.includes(value as TournamentSquadMode);

const normalizePlayers = (players: unknown): ITournamentPlayer[] => {
  if (!Array.isArray(players)) {
    return [];
  }

  const seen = new Set<string>();
  const normalizedPlayers: ITournamentPlayer[] = [];

  players.forEach((player) => {
    const name =
      typeof player === "string"
        ? normalizeText(player)
        : normalizeText(player?.name);
    const key = name.toLowerCase();

    if (!name || seen.has(key)) {
      return;
    }

    seen.add(key);
    const playerId =
      typeof player === "object" &&
      player !== null &&
      Types.ObjectId.isValid(normalizeText((player as any).playerId))
        ? new Types.ObjectId(normalizeText((player as any).playerId))
        : undefined;

    normalizedPlayers.push({
      playerId,
      username:
        typeof player === "object" && player !== null
          ? normalizeOptionalText((player as any).username)?.toLowerCase()
          : undefined,
      name,
      role:
        typeof player === "object" && player !== null
          ? normalizeOptionalText((player as any).role)
          : undefined,
      contactNumber:
        typeof player === "object" && player !== null
          ? normalizeOptionalText((player as any).contactNumber)
          : undefined,
    });
  });

  return normalizedPlayers;
};

const defaultStatistics = (): ITeamStatistics => ({
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  noResults: 0,
  points: 0,
  runsFor: 0,
  runsAgainst: 0,
  wicketsTaken: 0,
  wicketsLost: 0,
  ballsFaced: 0,
  ballsBowled: 0,
  netRunRate: 0,
});

const defaultPlayerStatistics = (): ITournamentPlayerStatistics => ({
  matchesPlayed: 0,
  runs: 0,
  ballsFaced: 0,
  fours: 0,
  sixes: 0,
  wickets: 0,
  ballsBowled: 0,
  runsConceded: 0,
});

const normalizeStatistics = (statistics: unknown): ITeamStatistics => {
  const defaults = defaultStatistics();
  if (!statistics || typeof statistics !== "object") {
    return defaults;
  }

  const compactStats = statistics as Record<string, unknown>;
  const expandedStatistics: Record<string, unknown> = {
    ...compactStats,
    matchesPlayed: compactStats.matchesPlayed ?? compactStats.played,
    wins: compactStats.wins ?? compactStats.won,
    losses: compactStats.losses ?? compactStats.lost,
  };
  const statKeys = Object.keys(defaults) as Array<keyof ITeamStatistics>;
  return statKeys.reduce<ITeamStatistics>((acc, key) => {
    const value = Number(expandedStatistics[key]);
    acc[key] = Number.isFinite(value) ? value : defaults[key];
    return acc;
  }, defaults);
};

const getEventTotalRuns = (event: any) => {
  const value = Number(event?.value ?? 0);
  const safeValue = Number.isFinite(value) ? value : 0;
  return event?.extra_type === "no-ball-extra" ? safeValue + 1 : safeValue;
};

const isLegalDelivery = (event: any) =>
  event?.type !== "wide" && event?.extra_type !== "no-ball-extra";

const summarizeSnapshotInning = (snapshot: any, teamName: string) => {
  const overs = snapshot?.recentEventsByTeams?.[teamName] ?? {};
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;

  Object.values(overs).forEach((events: any) => {
    if (!Array.isArray(events)) return;
    events.forEach((event) => {
      runs += getEventTotalRuns(event);
      if (event?.type === "wicket") wickets += 1;
      if (isLegalDelivery(event)) legalBalls += 1;
    });
  });

  return { runs, wickets, legalBalls };
};

const parseNonNegativeNumber = (value: unknown): number | null => {
  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return numberValue;
};

const parseOversToBalls = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const [overText, ballText = "0"] = String(value).split(".");
  const overs = Number.parseInt(overText, 10);
  const balls = Number.parseInt(ballText, 10);

  if (
    !Number.isFinite(overs) ||
    !Number.isFinite(balls) ||
    overs < 0 ||
    balls < 0 ||
    balls > 5
  ) {
    return null;
  }

  return overs * 6 + balls;
};

type InningSummary = {
  runs: number;
  wickets: number;
  legalBalls: number;
};

const normalizeInningSummary = (value: any): InningSummary | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const runs = parseNonNegativeNumber(value.runs ?? value.score);
  const wickets = parseNonNegativeNumber(value.wickets);
  const legalBalls =
    parseNonNegativeNumber(
      value.legalBalls ?? value.balls ?? value.ballsFaced,
    ) ?? parseOversToBalls(value.overs);

  if (runs === null && wickets === null && legalBalls === null) {
    return null;
  }

  return {
    runs: runs ?? 0,
    wickets: wickets ?? 0,
    legalBalls: legalBalls ?? 0,
  };
};

const getInningFromCollection = (
  collection: any,
  teamId: string,
  teamName: string,
): InningSummary | null => {
  if (!collection) {
    return null;
  }

  if (Array.isArray(collection)) {
    const row = collection.find(
      (item) =>
        String(item?.teamId ?? "") === teamId ||
        normalizeText(item?.teamName).toLowerCase() === teamName.toLowerCase(),
    );
    return normalizeInningSummary(row);
  }

  if (typeof collection === "object") {
    return (
      normalizeInningSummary(collection[teamId]) ??
      normalizeInningSummary(collection[teamName])
    );
  }

  return null;
};

const summarizeMatchInning = (
  source: any,
  teamId: string,
  teamName: string,
  side: "team1" | "team2",
): InningSummary => {
  const manualSummary =
    normalizeInningSummary(source?.[`${side}Inning`]) ??
    normalizeInningSummary(source?.[`${side}Score`]) ??
    normalizeInningSummary(source?.[`${side}Stats`]) ??
    getInningFromCollection(source?.innings, teamId, teamName) ??
    getInningFromCollection(source?.teamScores, teamId, teamName);

  if (manualSummary) {
    return manualSummary;
  }

  return summarizeSnapshotInning(source, teamName);
};

const buildMatchStatSource = (body: any) => {
  if (body?.snapshot && typeof body.snapshot === "object") {
    return {
      ...body.snapshot,
      innings: body.innings ?? body.snapshot.innings,
      teamScores: body.teamScores ?? body.snapshot.teamScores,
      team1Inning: body.team1Inning ?? body.snapshot.team1Inning,
      team2Inning: body.team2Inning ?? body.snapshot.team2Inning,
      team1Score: body.team1Score ?? body.snapshot.team1Score,
      team2Score: body.team2Score ?? body.snapshot.team2Score,
    };
  }

  return {
    innings: body?.innings,
    teamScores: body?.teamScores,
    team1Inning: body?.team1Inning,
    team2Inning: body?.team2Inning,
    team1Score: body?.team1Score,
    team2Score: body?.team2Score,
    recentEventsByTeams: body?.recentEventsByTeams,
  };
};

const getNetRunRate = (
  runsFor: number,
  ballsFaced: number,
  runsAgainst: number,
  ballsBowled: number,
) => {
  const battingRate = ballsFaced > 0 ? runsFor / (ballsFaced / 6) : 0;
  const bowlingRate = ballsBowled > 0 ? runsAgainst / (ballsBowled / 6) : 0;
  return Number((battingRate - bowlingRate).toFixed(3));
};

const normalizePlayerKey = (value: unknown) =>
  normalizeText(value).toLowerCase();

const addPlayerScorecardStats = (team: ITournamentTeam, scorecard: any) => {
  if (!scorecard || typeof scorecard !== "object" || !team.players.length) {
    return;
  }

  const playerByName = new Map(
    team.players.map((player) => [normalizePlayerKey(player.name), player]),
  );
  const touched = new Set<string>();
  const batting =
    scorecard.batting && typeof scorecard.batting === "object"
      ? scorecard.batting
      : {};
  const bowling =
    scorecard.bowling && typeof scorecard.bowling === "object"
      ? scorecard.bowling
      : {};

  Object.entries(batting).forEach(([playerName, rawStats]) => {
    const player = playerByName.get(normalizePlayerKey(playerName));
    if (!player || !rawStats || typeof rawStats !== "object") {
      return;
    }

    const stats = rawStats as Record<string, unknown>;
    const current = {
      ...defaultPlayerStatistics(),
      ...(player.statistics ?? {}),
    };
    current.runs += Number(stats.runs) || 0;
    current.ballsFaced += Number(stats.balls) || 0;
    current.fours += Number(stats.fours) || 0;
    current.sixes += Number(stats.sixes) || 0;
    player.statistics = current;
    touched.add(normalizePlayerKey(player.name));
  });

  Object.entries(bowling).forEach(([playerName, rawStats]) => {
    const player = playerByName.get(normalizePlayerKey(playerName));
    if (!player || !rawStats || typeof rawStats !== "object") {
      return;
    }

    const stats = rawStats as Record<string, unknown>;
    const current = {
      ...defaultPlayerStatistics(),
      ...(player.statistics ?? {}),
    };
    current.wickets += Number(stats.wickets) || 0;
    current.ballsBowled += Number(stats.balls) || 0;
    current.runsConceded += Number(stats.runsConceded) || 0;
    player.statistics = current;
    touched.add(normalizePlayerKey(player.name));
  });

  touched.forEach((key) => {
    const player = playerByName.get(key);
    if (!player) return;
    player.statistics = {
      ...defaultPlayerStatistics(),
      ...(player.statistics ?? {}),
      matchesPlayed: (player.statistics?.matchesPlayed ?? 0) + 1,
    };
  });
};

const ensureAuthenticated = (
  req: AuthenticatedRequest,
  res: Response,
): string | null => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  return req.user.id;
};

const findOwnedTournament = async (
  tournamentId: string,
  userId: string,
): Promise<ITournament | null> => {
  if (!Types.ObjectId.isValid(tournamentId)) {
    return null;
  }

  return Tournament.findOne({
    _id: new Types.ObjectId(tournamentId),
    organizer: new Types.ObjectId(userId),
  });
};

const findOwnedTournamentTeam = async (
  teamId: string,
  tournamentId: Types.ObjectId,
  userId: string,
): Promise<ITournamentTeam | null> => {
  if (!Types.ObjectId.isValid(teamId)) {
    return null;
  }

  return TournamentTeam.findOne({
    _id: new Types.ObjectId(teamId),
    tournament: tournamentId,
    organizer: new Types.ObjectId(userId),
  });
};

const findOwnedTournamentTeamsByIds = async (
  tournamentId: Types.ObjectId,
  userId: string,
  teamIds: string[],
): Promise<ITournamentTeam[]> => {
  const objectIds = teamIds
    .filter((teamId) => Types.ObjectId.isValid(teamId))
    .map((teamId) => new Types.ObjectId(teamId));

  if (!objectIds.length) {
    return [];
  }

  return TournamentTeam.find({
    _id: { $in: objectIds },
    tournament: tournamentId,
    organizer: new Types.ObjectId(userId),
  });
};

const buildPairKey = (team1Id: string, team2Id: string): string =>
  [team1Id, team2Id].sort().join(":");

const getValidMatchTeamId = (
  value: unknown,
  team1Id: string,
  team2Id: string,
): string => {
  const teamId = normalizeText(value);
  return teamId === team1Id || teamId === team2Id ? teamId : "";
};

const getBattingFirstTeamId = (
  body: any,
  team1Id: string,
  team2Id: string,
): string => {
  const explicitBattingFirstTeamId = getValidMatchTeamId(
    body?.battingFirstTeamId,
    team1Id,
    team2Id,
  );
  if (explicitBattingFirstTeamId) {
    return explicitBattingFirstTeamId;
  }

  const tossWinnerTeamId = getValidMatchTeamId(
    body?.tossWinnerTeamId,
    team1Id,
    team2Id,
  );
  const tossDecision = normalizeText(body?.tossDecision);
  if (!tossWinnerTeamId || (tossDecision !== "bat" && tossDecision !== "bowl")) {
    return "";
  }

  if (tossDecision === "bat") {
    return tossWinnerTeamId;
  }

  return tossWinnerTeamId === team1Id ? team2Id : team1Id;
};

const syncMissingTeamLogos = async (
  teams: ITournamentTeam[],
): Promise<void> => {
  const teamsMissingLogo = teams.filter((team) => !team.logoUrl);
  if (!teamsMissingLogo.length) {
    return;
  }

  const teamsWithSourceId = teamsMissingLogo.filter((team) => team.sourceTeamId);
  const teamsWithoutSourceId = teamsMissingLogo.filter(
    (team) => !team.sourceTeamId,
  );

  const sourceTeamById = new Map<string, ISavedPlayerTeam>();

  if (teamsWithSourceId.length) {
    const sourceTeamIds = [
      ...new Set(teamsWithSourceId.map((team) => String(team.sourceTeamId))),
    ];
    const sourceTeams = await SavedPlayerTeam.find({
      _id: { $in: sourceTeamIds },
    });
    sourceTeams.forEach((sourceTeam) =>
      sourceTeamById.set(String(sourceTeam._id), sourceTeam),
    );
  }

  // Older teams registered before sourceTeamId was tracked: fall back to a
  // name + owner match against the organizer's saved teams.
  const nameMatchByTeamId = new Map<string, ISavedPlayerTeam>();
  if (teamsWithoutSourceId.length) {
    const organizerIds = [
      ...new Set(teamsWithoutSourceId.map((team) => String(team.organizer))),
    ];
    const candidateSavedTeams = await SavedPlayerTeam.find({
      owner: { $in: organizerIds.map((id) => new Types.ObjectId(id)) },
    });
    const savedTeamByOwnerAndName = new Map<string, ISavedPlayerTeam>();
    candidateSavedTeams.forEach((savedTeam) => {
      savedTeamByOwnerAndName.set(
        `${String(savedTeam.owner)}::${savedTeam.name.toLowerCase()}`,
        savedTeam,
      );
    });
    teamsWithoutSourceId.forEach((team) => {
      const match = savedTeamByOwnerAndName.get(
        `${String(team.organizer)}::${team.name.toLowerCase()}`,
      );
      if (match) {
        nameMatchByTeamId.set(String(team._id), match);
      }
    });
  }

  const updates: Promise<unknown>[] = [];
  teamsMissingLogo.forEach((team) => {
    const sourceTeam =
      sourceTeamById.get(String(team.sourceTeamId)) ??
      nameMatchByTeamId.get(String(team._id));
    if (!sourceTeam?.logoUrl) {
      return;
    }

    team.logoUrl = sourceTeam.logoUrl;
    const setFields: Record<string, unknown> = { logoUrl: sourceTeam.logoUrl };
    if (!team.sourceTeamId) {
      team.sourceTeamId = sourceTeam._id as Types.ObjectId;
      setFields.sourceTeamId = sourceTeam._id;
    }
    updates.push(TournamentTeam.updateOne({ _id: team._id }, { $set: setFields }));
  });

  if (updates.length) {
    await Promise.all(updates);
  }
};

const getTournamentTeamDocs = async (
  tournamentId: Types.ObjectId,
  userId: string,
): Promise<ITournamentTeam[]> => {
  const teams = await TournamentTeam.find({
    tournament: tournamentId,
    organizer: new Types.ObjectId(userId),
  }).sort({ "statistics.points": -1, "statistics.netRunRate": -1, name: 1 });
  await syncMissingTeamLogos(teams);
  return teams;
};

const getTournamentMatches = async (
  tournamentId: Types.ObjectId,
  userId: string,
): Promise<ITournamentMatch[]> =>
  TournamentMatch.find({
    tournament: tournamentId,
    organizer: new Types.ObjectId(userId),
  }).sort({ createdAt: -1 });

const resolveTournamentMatch = async (
  tournamentId: Types.ObjectId,
  userId: string,
  matchIdentifier: unknown,
  body: any,
): Promise<ITournamentMatch | null> => {
  const identifier = normalizeText(matchIdentifier);
  const scorerMatchId =
    normalizeText(body?.scorerMatchId) ||
    normalizeText(body?.clientMatchId) ||
    normalizeText(body?.gameId) ||
    identifier;

  if (Types.ObjectId.isValid(identifier)) {
    const match = await TournamentMatch.findOne({
      _id: new Types.ObjectId(identifier),
      tournament: tournamentId,
      organizer: new Types.ObjectId(userId),
    });
    if (match) return match;
  }

  if (scorerMatchId) {
    const match = await TournamentMatch.findOne({
      scorerMatchId,
      tournament: tournamentId,
      organizer: new Types.ObjectId(userId),
    }).sort({ updatedAt: -1 });
    if (match) return match;
  }

  const team1Id = normalizeText(body?.team1Id);
  const team2Id = normalizeText(body?.team2Id);
  if (
    Types.ObjectId.isValid(team1Id) &&
    Types.ObjectId.isValid(team2Id) &&
    team1Id !== team2Id
  ) {
    const pairKey = buildPairKey(team1Id, team2Id);
    return TournamentMatch.findOne({
      tournament: tournamentId,
      organizer: new Types.ObjectId(userId),
      pairKey,
      status: { $ne: "completed" },
    }).sort({ updatedAt: -1 });
  }

  return null;
};

const resolveTournamentMatchFromSavedMatchPayload = async (
  userId: string,
  body: Record<string, unknown>,
): Promise<{
  tournament: ITournament;
  match: ITournamentMatch | null;
} | null> => {
  const tournamentId = normalizeText(body?.tournamentId);
  const matchIdentifier = body?.tournamentMatchId ?? body?.clientMatchId ?? body?.matchId;
  const userObjectId = new Types.ObjectId(userId);

  if (Types.ObjectId.isValid(tournamentId)) {
    const tournament = await findOwnedTournament(tournamentId, userId);
    if (!tournament) {
      return null;
    }

    return {
      tournament,
      match: await resolveTournamentMatch(
        tournament._id as Types.ObjectId,
        userId,
        matchIdentifier,
        body,
      ),
    };
  }

  const identifier = normalizeText(matchIdentifier);
  if (Types.ObjectId.isValid(identifier)) {
    const match = await TournamentMatch.findOne({
      _id: new Types.ObjectId(identifier),
      organizer: userObjectId,
    });
    if (match) {
      const tournament = await findOwnedTournament(
        String(match.tournament),
        userId,
      );
      return tournament ? { tournament, match } : null;
    }
  }

  const scorerMatchId =
    normalizeText(body?.scorerMatchId) ||
    normalizeText(body?.clientMatchId) ||
    normalizeText(body?.gameId);
  if (!scorerMatchId) {
    return null;
  }

  const match = await TournamentMatch.findOne({
    organizer: userObjectId,
    scorerMatchId,
  }).sort({ updatedAt: -1 });
  console.log('match', match)
  if (!match) {
    return null;
  }

  const tournament = await findOwnedTournament(String(match.tournament), userId);
  return tournament ? { tournament, match } : null;
};

const serializeMatch = (
  match: ITournamentMatch,
  teamById: Map<string, ITournamentTeam>,
) => {
  const team1Id = String(match.team1);
  const team2Id = String(match.team2);
  const winnerTeamId = match.winnerTeam ? String(match.winnerTeam) : "";
  const tossWinnerTeamId = match.tossWinnerTeam
    ? String(match.tossWinnerTeam)
    : "";
  const battingFirstTeamId = match.battingFirstTeam
    ? String(match.battingFirstTeam)
    : "";

  return {
    id: String(match._id),
    tournamentId: String(match.tournament),
    team1Id,
    team2Id,
    team1Name: teamById.get(team1Id)?.name ?? "",
    team2Name: teamById.get(team2Id)?.name ?? "",
    status: match.status,
    tossWinnerTeamId,
    tossWinnerTeamName: tossWinnerTeamId
      ? teamById.get(tossWinnerTeamId)?.name ?? ""
      : "",
    tossDecision: match.tossDecision ?? "",
    battingFirstTeamId,
    battingFirstTeamName: battingFirstTeamId
      ? teamById.get(battingFirstTeamId)?.name ?? ""
      : "",
    winnerTeamId,
    winnerTeamName: winnerTeamId
      ? teamById.get(winnerTeamId)?.name ?? ""
      : "",
    resultText: match.resultText ?? "",
    scorerMatchId: match.scorerMatchId ?? "",
    snapshot: match.snapshot ?? null,
    startedAt: match.startedAt ?? "",
    completedAt: match.completedAt ?? "",
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
};

const serializeTournament = async (
  tournament: ITournament,
  userId: string,
  includeDetails = false,
) => {
  const teams = includeDetails
    ? await getTournamentTeamDocs(tournament._id as Types.ObjectId, userId)
    : [];
  const matches = includeDetails
    ? await getTournamentMatches(tournament._id as Types.ObjectId, userId)
    : [];
  const teamsCount = includeDetails
    ? teams.length
    : await TournamentTeam.countDocuments({
    tournament: tournament._id,
  });
  const teamById = new Map(teams.map((team) => [String(team._id), team]));

  return {
    id: String(tournament._id),
    name: tournament.name,
    organizerName: tournament.organizerName,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    location: tournament.location,
    logoUrl: tournament.logoUrl ?? "",
    ballType: tournament.ballType,
    customBallType: tournament.customBallType ?? "",
    oversPerMatch: tournament.oversPerMatch,
    format: tournament.format,
    squadMode: tournament.squadMode ?? "teams_only",
    status: tournament.status,
    teamsCount,
    teams: teams.map(serializeTeam),
    matches: matches.map((match) => serializeMatch(match, teamById)),
    createdAt: tournament.createdAt,
    updatedAt: tournament.updatedAt,
  };
};

const serializeTeam = (team: ITournamentTeam) => {
  const statistics =
    typeof (team.statistics as any)?.toObject === "function"
      ? (team.statistics as any).toObject()
      : JSON.parse(JSON.stringify(team.statistics ?? {}));

  const mergedStatistics: ITeamStatistics = {
    ...defaultStatistics(),
    ...statistics,
  };

  const stats = {
    played: mergedStatistics.matchesPlayed,
    won: mergedStatistics.wins,
    lost: mergedStatistics.losses,
    points: mergedStatistics.points,
    netRunRate: mergedStatistics.netRunRate,
  };

  return {
    id: String(team._id),
    tournamentId: String(team.tournament),
    name: team.name,
    logoUrl: team.logoUrl ?? "",
    captainName: team.captainName,
    contactNumber: team.contactNumber,
    players: team.players.map((player) => ({
      id: String(player._id),
      playerId: player.playerId ? String(player.playerId) : "",
      username: player.username ?? "",
      name: player.name,
      role: player.role ?? "",
      contactNumber: player.contactNumber ?? "",
      statistics: {
        ...defaultPlayerStatistics(),
        ...((player.statistics as any)?.toObject?.() ?? player.statistics ?? {}),
      },
    })),
    playerCount: team.players.length,
    stats,
    statistics: mergedStatistics,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
};

const applyMatchStatsToTeams = (
  match: ITournamentMatch,
  teamById: Map<string, ITournamentTeam>,
) => {
  const team1Id = String(match.team1);
  const team2Id = String(match.team2);
  const team1 = teamById.get(team1Id);
  const team2 = teamById.get(team2Id);

  if (!team1 || !team2) {
    return;
  }

  const source: any = match.snapshot ?? {};
  const team1Inning = summarizeMatchInning(source, team1Id, team1.name, "team1");
  const team2Inning = summarizeMatchInning(source, team2Id, team2.name, "team2");
  const winnerTeamId = match.winnerTeam ? String(match.winnerTeam) : "";
  const isTie = !winnerTeamId;

  team1.statistics.matchesPlayed += 1;
  team2.statistics.matchesPlayed += 1;

  if (isTie) {
    team1.statistics.ties += 1;
    team2.statistics.ties += 1;
    team1.statistics.points += 1;
    team2.statistics.points += 1;
  } else if (winnerTeamId === team1Id) {
    team1.statistics.wins += 1;
    team1.statistics.points += 2;
    team2.statistics.losses += 1;
  } else if (winnerTeamId === team2Id) {
    team2.statistics.wins += 1;
    team2.statistics.points += 2;
    team1.statistics.losses += 1;
  }

  team1.statistics.runsFor += team1Inning.runs;
  team1.statistics.runsAgainst += team2Inning.runs;
  team1.statistics.wicketsLost += team1Inning.wickets;
  team1.statistics.wicketsTaken += team2Inning.wickets;
  team1.statistics.ballsFaced += team1Inning.legalBalls;
  team1.statistics.ballsBowled += team2Inning.legalBalls;
  team1.statistics.netRunRate = getNetRunRate(
    team1.statistics.runsFor,
    team1.statistics.ballsFaced,
    team1.statistics.runsAgainst,
    team1.statistics.ballsBowled,
  );

  team2.statistics.runsFor += team2Inning.runs;
  team2.statistics.runsAgainst += team1Inning.runs;
  team2.statistics.wicketsLost += team2Inning.wickets;
  team2.statistics.wicketsTaken += team1Inning.wickets;
  team2.statistics.ballsFaced += team2Inning.legalBalls;
  team2.statistics.ballsBowled += team1Inning.legalBalls;
  team2.statistics.netRunRate = getNetRunRate(
    team2.statistics.runsFor,
    team2.statistics.ballsFaced,
    team2.statistics.runsAgainst,
    team2.statistics.ballsBowled,
  );

  const playerScorecards = source?.playerScorecardByTeam ?? {};
  addPlayerScorecardStats(team1, playerScorecards[team1.name]);
  addPlayerScorecardStats(team2, playerScorecards[team2.name]);
};

const recalculateTournamentStatistics = async (
  tournamentId: Types.ObjectId,
  userId: string,
): Promise<ITournamentTeam[]> => {
  const teams = await TournamentTeam.find({
    tournament: tournamentId,
    organizer: new Types.ObjectId(userId),
  });
  const matches = await TournamentMatch.find({
    tournament: tournamentId,
    organizer: new Types.ObjectId(userId),
    status: "completed",
  }).sort({ completedAt: 1, createdAt: 1 });
  const teamById = new Map(teams.map((team) => [String(team._id), team]));

  teams.forEach((team) => {
    team.statistics = defaultStatistics() as any;
    team.players = team.players.map((player) => ({
      ...player,
      statistics: defaultPlayerStatistics(),
    })) as any;
  });
  matches.forEach((match) => applyMatchStatsToTeams(match, teamById));
  teams.forEach((team) => {
    team.markModified("statistics");
    team.markModified("players");
  });

  await Promise.all(teams.map((team) => team.save()));

  return teams.sort((teamA, teamB) => {
    const pointsDiff = teamB.statistics.points - teamA.statistics.points;
    if (pointsDiff !== 0) return pointsDiff;
    const nrrDiff = teamB.statistics.netRunRate - teamA.statistics.netRunRate;
    if (nrrDiff !== 0) return nrrDiff;
    return teamA.name.localeCompare(teamB.name);
  });
};

export const createTournament = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const name = normalizeText(req.body?.name);
    const organizerName = normalizeText(req.body?.organizerName);
    const startDate = parseDate(req.body?.startDate);
    const endDate = parseDate(req.body?.endDate);
    const location = normalizeText(req.body?.location);
    const ballType = req.body?.ballType;
    const oversPerMatch = parsePositiveNumber(req.body?.oversPerMatch);
    const format = req.body?.format;
    const squadMode = req.body?.squadMode ?? "teams_only";

    if (
      !name ||
      !organizerName ||
      !startDate ||
      !endDate ||
      !location ||
      !isBallType(ballType) ||
      !oversPerMatch ||
      !isTournamentFormat(format) ||
      !isTournamentSquadMode(squadMode)
    ) {
      res.status(400).json({
        message:
          "Name, organizer name, start/end dates, location, ball type, overs per match, format, and squad mode are required",
      });
      return;
    }

    if (endDate < startDate) {
      res.status(400).json({ message: "End date must be after start date" });
      return;
    }

    if (ballType === "custom" && !normalizeText(req.body?.customBallType)) {
      res.status(400).json({ message: "Custom ball type is required" });
      return;
    }

    const tournament = await Tournament.create({
      organizer: new Types.ObjectId(userId),
      name,
      organizerName,
      startDate,
      endDate,
      location,
      logoUrl: normalizeOptionalText(req.body?.logoUrl),
      ballType,
      customBallType:
        ballType === "custom"
          ? normalizeText(req.body?.customBallType)
          : undefined,
      oversPerMatch,
      format,
      squadMode,
      status: "draft",
    });

    trackEvent(req, {
      type: "TOURNAMENT_CREATED",
      userId,
      metadata: { tournamentId: String(tournament._id), name: tournament.name },
    });

    res.status(201).json({
      tournament: await serializeTournament(tournament, userId, true),
    });
  } catch (error) {
    console.error("Create tournament error", error);
    res.status(500).json({ message: "Unable to create tournament" });
  }
};

export const getTournaments = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const query: Record<string, unknown> = {
      organizer: new Types.ObjectId(userId),
    };

    if (isTournamentStatus(req.query.status)) {
      query.status = req.query.status;
    }

    // GET /api/v1/tournaments?page=1&limit=20 -- page/limit are optional;
    // omitting them keeps the old page-1-of-20 default so existing callers
    // still work, they just stop getting everything past the first page.
    const pagination = parsePagination(
      req.query as Record<string, unknown>,
    );

    const [total, tournaments] = await Promise.all([
      Tournament.countDocuments(query),
      Tournament.find(query)
        .sort({ startDate: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
    ]);

    res.status(200).json({
      tournaments: await Promise.all(
        tournaments.map((tournament) =>
          serializeTournament(tournament, userId, true),
        ),
      ),
      pagination: buildPaginationMeta(total, pagination),
    });
  } catch (error) {
    console.error("Get tournaments error", error);
    res.status(500).json({ message: "Unable to load tournaments" });
  }
};

export const getTournament = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const teams = await TournamentTeam.find({
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
    }).sort({ createdAt: 1 });
    await syncMissingTeamLogos(teams);

    res.status(200).json({
      tournament: await serializeTournament(tournament, userId, true),
      teams: teams.map(serializeTeam),
    });
  } catch (error) {
    console.error("Get tournament error", error);
    res.status(500).json({ message: "Unable to load tournament" });
  }
};

export const updateTournament = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const updates: Partial<ITournament> = {};
    if (req.body?.name !== undefined) updates.name = normalizeText(req.body.name);
    if (req.body?.organizerName !== undefined) {
      updates.organizerName = normalizeText(req.body.organizerName);
    }
    if (req.body?.location !== undefined) {
      updates.location = normalizeText(req.body.location);
    }
    if (req.body?.logoUrl !== undefined) {
      updates.logoUrl = normalizeOptionalText(req.body.logoUrl);
    }
    if (req.body?.oversPerMatch !== undefined) {
      const oversPerMatch = parsePositiveNumber(req.body.oversPerMatch);
      if (!oversPerMatch) {
        res.status(400).json({ message: "Overs per match must be greater than 0" });
        return;
      }
      updates.oversPerMatch = oversPerMatch;
    }
    if (req.body?.format !== undefined) {
      if (!isTournamentFormat(req.body.format)) {
        res.status(400).json({ message: "Tournament format is not supported" });
        return;
      }
      updates.format = req.body.format;
    }
    if (req.body?.squadMode !== undefined) {
      if (!isTournamentSquadMode(req.body.squadMode)) {
        res.status(400).json({ message: "Tournament squad mode is not supported" });
        return;
      }
      updates.squadMode = req.body.squadMode;
    }
    if (req.body?.ballType !== undefined) {
      if (!isBallType(req.body.ballType)) {
        res.status(400).json({ message: "Ball type is not supported" });
        return;
      }
      updates.ballType = req.body.ballType;
    }
    if (req.body?.customBallType !== undefined) {
      updates.customBallType = normalizeOptionalText(req.body.customBallType);
    }
    if (req.body?.status !== undefined) {
      if (!isTournamentStatus(req.body.status)) {
        res.status(400).json({ message: "Tournament status is not supported" });
        return;
      }
      updates.status = req.body.status;
    }
    if (req.body?.startDate !== undefined) {
      const startDate = parseDate(req.body.startDate);
      if (!startDate) {
        res.status(400).json({ message: "Start date is invalid" });
        return;
      }
      updates.startDate = startDate;
    }
    if (req.body?.endDate !== undefined) {
      const endDate = parseDate(req.body.endDate);
      if (!endDate) {
        res.status(400).json({ message: "End date is invalid" });
        return;
      }
      updates.endDate = endDate;
    }

    const nextStartDate = updates.startDate ?? tournament.startDate;
    const nextEndDate = updates.endDate ?? tournament.endDate;
    if (nextEndDate < nextStartDate) {
      res.status(400).json({ message: "End date must be after start date" });
      return;
    }

    const nextBallType = updates.ballType ?? tournament.ballType;
    const nextCustomBallType =
      updates.customBallType ?? tournament.customBallType;
    if (nextBallType === "custom" && !nextCustomBallType) {
      res.status(400).json({ message: "Custom ball type is required" });
      return;
    }

    Object.assign(tournament, updates);
    await tournament.save();

    res.status(200).json({
      tournament: await serializeTournament(tournament, userId, true),
    });
  } catch (error) {
    console.error("Update tournament error", error);
    res.status(500).json({ message: "Unable to update tournament" });
  }
};

export const deleteTournament = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    await TournamentMatch.deleteMany({ tournament: tournament._id });
    await TournamentTeam.deleteMany({ tournament: tournament._id });
    await tournament.deleteOne();

    res.status(200).json({ message: "Tournament deleted" });
  } catch (error) {
    console.error("Delete tournament error", error);
    res.status(500).json({ message: "Unable to delete tournament" });
  }
};

export const createTournamentTeam = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const sourceTeamId = normalizeText(req.body?.sourceTeamId);
    const sourceTeam = Types.ObjectId.isValid(sourceTeamId)
      ? await SavedPlayerTeam.findOne({
          _id: new Types.ObjectId(sourceTeamId),
          owner: new Types.ObjectId(userId),
        })
      : null;
    const sourcePlayers =
      sourceTeam?.players.map((player) => ({
        playerId: player.playerId,
        username: player.username,
        name: player.name,
        role: player.role,
        contactNumber: player.contactNumber,
      })) ?? [];
    const name = normalizeText(req.body?.name) || sourceTeam?.name || "";
    const captainName =
      normalizeText(req.body?.captainName) ||
      sourceTeam?.captainName ||
      sourcePlayers[0]?.name ||
      "";
    const contactNumber =
      normalizeText(req.body?.contactNumber) ||
      sourceTeam?.contactNumber ||
      (sourceTeam ? "N/A" : "");
    const players = normalizePlayers(
      Array.isArray(req.body?.players) && req.body.players.length
        ? req.body.players
        : sourcePlayers,
    );

    if (!name || !captainName || !contactNumber) {
      res.status(400).json({
        message: "Team name, captain name, and contact number are required",
      });
      return;
    }
    if ((tournament.squadMode ?? "teams_only") === "with_players" && !players.length) {
      res.status(400).json({
        message: "At least one player is required for this tournament",
      });
      return;
    }

    const team = await TournamentTeam.create({
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
      sourceTeamId: sourceTeam?._id,
      name,
      logoUrl: normalizeOptionalText(req.body?.logoUrl) ?? sourceTeam?.logoUrl,
      captainName,
      contactNumber,
      players,
      statistics: normalizeStatistics(req.body?.statistics),
    });

    res.status(201).json({ team: serializeTeam(team) });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "Team already exists in this tournament" });
      return;
    }

    console.error("Create tournament team error", error);
    res.status(500).json({ message: "Unable to create team" });
  }
};

export const getTournamentTeams = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const teams = await TournamentTeam.find({
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
    }).sort({ "statistics.points": -1, "statistics.netRunRate": -1, name: 1 });
    await syncMissingTeamLogos(teams);

    res.status(200).json({ teams: teams.map(serializeTeam) });
  } catch (error) {
    console.error("Get tournament teams error", error);
    res.status(500).json({ message: "Unable to load teams" });
  }
};

export const getTournamentMatchesList = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const query: Record<string, unknown> = {
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
    };
    const status = normalizeText(req.query.status);
    if (["scheduled", "in_progress", "completed"].includes(status)) {
      query.status = status;
    }

    const [teams, matches] = await Promise.all([
      getTournamentTeamDocs(tournament._id as Types.ObjectId, userId),
      TournamentMatch.find(query).sort({ completedAt: -1, createdAt: -1 }),
    ]);
    const teamById = new Map(teams.map((team) => [String(team._id), team]));

    res.status(200).json({
      matches: matches.map((match) => serializeMatch(match, teamById)),
    });
  } catch (error) {
    console.error("Get tournament matches error", error);
    res.status(500).json({ message: "Unable to load matches" });
  }
};

const mergeTournamentPlayers = (
  existingPlayers: ITournamentPlayer[],
  incomingPlayers: ITournamentPlayer[],
): ITournamentPlayer[] => {
  const existingByPlayerId = new Map<string, ITournamentPlayer>();
  const existingByName = new Map<string, ITournamentPlayer>();

  existingPlayers.forEach((player) => {
    if (player.playerId) {
      existingByPlayerId.set(String(player.playerId), player);
    }
    existingByName.set(normalizePlayerKey(player.name), player);
  });

  return incomingPlayers.map((incoming) => {
    const existing =
      (incoming.playerId &&
        existingByPlayerId.get(String(incoming.playerId))) ||
      existingByName.get(normalizePlayerKey(incoming.name));

    return {
      ...incoming,
      _id: existing?._id,
      statistics: existing?.statistics ?? defaultPlayerStatistics(),
    };
  });
};

export const updateTournamentTeam = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const team = await findOwnedTournamentTeam(
      req.params.teamId,
      tournament._id as Types.ObjectId,
      userId,
    );

    if (!team) {
      res.status(404).json({ message: "Team not found" });
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
      const players = normalizePlayers(req.body.players);
      if ((tournament.squadMode ?? "teams_only") === "with_players" && !players.length) {
        res.status(400).json({
          message: "At least one player is required for this tournament",
        });
        return;
      }
      team.players = mergeTournamentPlayers(team.players as any, players) as any;
    }
    if (req.body?.statistics !== undefined || req.body?.stats !== undefined) {
      team.statistics = normalizeStatistics(
        req.body.statistics ?? req.body.stats,
      ) as any;
    }

    if (!team.name || !team.captainName || !team.contactNumber) {
      res.status(400).json({
        message: "Team name, captain name, and contact number are required",
      });
      return;
    }

    await team.save();

    res.status(200).json({ team: serializeTeam(team) });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "Team already exists in this tournament" });
      return;
    }

    console.error("Update tournament team error", error);
    res.status(500).json({ message: "Unable to update team" });
  }
};

export const updateTournamentTeamPlayers = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    req.body = {
      ...req.body,
      players: req.body?.players,
    };
    await updateTournamentTeam(req, res);
  } catch (error) {
    console.error("Update tournament team players error", error);
    res.status(500).json({ message: "Unable to update team players" });
  }
};

export const updateTournamentTeamStatistics = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    req.body = {
      ...req.body,
      statistics: req.body?.statistics ?? req.body?.stats ?? req.body,
    };
    await updateTournamentTeam(req, res);
  } catch (error) {
    console.error("Update tournament team statistics error", error);
    res.status(500).json({ message: "Unable to update team statistics" });
  }
};

export const deleteTournamentTeam = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const team = await findOwnedTournamentTeam(
      req.params.teamId,
      tournament._id as Types.ObjectId,
      userId,
    );

    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    await TournamentMatch.deleteMany({
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
      $or: [{ team1: team._id }, { team2: team._id }],
    });

    await team.deleteOne();

    await recalculateTournamentStatistics(
      tournament._id as Types.ObjectId,
      userId,
    );

    res.status(200).json({ message: "Team deleted" });
  } catch (error) {
    console.error("Delete tournament team error", error);
    res.status(500).json({ message: "Unable to delete team" });
  }
};

export const recalculateTournamentTeamStatistics = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const teams = await recalculateTournamentStatistics(
      tournament._id as Types.ObjectId,
      userId,
    );
    const completedMatches = await TournamentMatch.find({
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
      status: "completed",
    }).sort({ completedAt: -1, createdAt: -1 });
    const teamById = new Map(teams.map((team) => [String(team._id), team]));

    res.status(200).json({
      message: "Points table synced",
      teams: teams.map(serializeTeam),
      completedMatches: completedMatches.map((match) =>
        serializeMatch(match, teamById),
      ),
      completedMatchesCount: completedMatches.length,
      tournament: await serializeTournament(tournament, userId, true),
    });
  } catch (error) {
    console.error("Recalculate tournament statistics error", error);
    res.status(500).json({ message: "Unable to recalculate statistics" });
  }
};

export const startTournamentMatch = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    const team1Id = normalizeText(req.body?.team1Id);
    const team2Id = normalizeText(req.body?.team2Id);
    if (
      !Types.ObjectId.isValid(team1Id) ||
      !Types.ObjectId.isValid(team2Id) ||
      team1Id === team2Id
    ) {
      res.status(400).json({ message: "Two valid different teams are required" });
      return;
    }

    const teams = await TournamentTeam.find({
      _id: {
        $in: [new Types.ObjectId(team1Id), new Types.ObjectId(team2Id)],
      },
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
    });

    if (teams.length !== 2) {
      res.status(400).json({ message: "Both teams must belong to tournament" });
      return;
    }

    const pairKey = buildPairKey(team1Id, team2Id);
    const tossWinnerTeamId = getValidMatchTeamId(
      req.body?.tossWinnerTeamId,
      team1Id,
      team2Id,
    );
    const tossDecision = normalizeText(req.body?.tossDecision);
    const battingFirstTeamId = getBattingFirstTeamId(req.body, team1Id, team2Id);
    if (
      (req.body?.tossWinnerTeamId && !tossWinnerTeamId) ||
      (req.body?.tossDecision &&
        tossDecision !== "bat" &&
        tossDecision !== "bowl") ||
      (req.body?.battingFirstTeamId && !battingFirstTeamId)
    ) {
      res.status(400).json({
        message:
          "Toss winner, toss decision, and batting first team must match the fixture teams",
      });
      return;
    }
    const startedAt = new Date();
    let match = await TournamentMatch.findOne({
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
      pairKey,
      status: { $ne: "completed" },
    });

    if (match) {
      match.status = "in_progress";
      match.startedAt = match.startedAt ?? startedAt;
      match.scorerMatchId =
        normalizeText(req.body?.scorerMatchId) ||
        normalizeText(req.body?.clientMatchId) ||
        normalizeText(req.body?.gameId) ||
        match.scorerMatchId;
      match.tossWinnerTeam = tossWinnerTeamId
        ? new Types.ObjectId(tossWinnerTeamId)
        : match.tossWinnerTeam;
      match.tossDecision =
        tossDecision === "bat" || tossDecision === "bowl"
          ? tossDecision
          : match.tossDecision;
      match.battingFirstTeam = battingFirstTeamId
        ? new Types.ObjectId(battingFirstTeamId)
        : match.battingFirstTeam;
      await match.save();
    } else {
      match = await TournamentMatch.create({
        tournament: tournament._id,
        organizer: new Types.ObjectId(userId),
        team1: new Types.ObjectId(team1Id),
        team2: new Types.ObjectId(team2Id),
        pairKey,
        status: "in_progress",
        scorerMatchId:
          normalizeText(req.body?.scorerMatchId) ||
          normalizeText(req.body?.clientMatchId) ||
          normalizeText(req.body?.gameId) ||
          undefined,
        tossWinnerTeam: tossWinnerTeamId
          ? new Types.ObjectId(tossWinnerTeamId)
          : undefined,
        tossDecision:
          tossDecision === "bat" || tossDecision === "bowl"
            ? tossDecision
            : undefined,
        battingFirstTeam: battingFirstTeamId
          ? new Types.ObjectId(battingFirstTeamId)
          : undefined,
        startedAt,
      });

      trackEvent(req, {
        type: "MATCH_STARTED",
        userId,
        metadata: {
          matchId: String(match._id),
          tournamentId: String(tournament._id),
          mode: "tournament",
        },
      });
    }

    const teamById = new Map(teams.map((team) => [String(team._id), team]));
    res.status(200).json({
      match: serializeMatch(match, teamById),
      redirectTo: `/tournaments/${String(tournament._id)}`,
    });
  } catch (error) {
    console.error("Start tournament match error", error);
    res.status(500).json({ message: "Unable to start match" });
  }
};

export const completeTournamentMatchFromSavedMatch = async (
  userId: string,
  body: Record<string, unknown>,
  req: AuthenticatedRequest,
): Promise<{
  match: ReturnType<typeof serializeMatch>;
  teams: ReturnType<typeof serializeTeam>[];
  tournament: Awaited<ReturnType<typeof serializeTournament>>;
  redirectTo: string;
} | null> => {
  const resolved = await resolveTournamentMatchFromSavedMatchPayload(
    userId,
    body,
  );
  if (!resolved) {
    return null;
  }

  const { tournament } = resolved;
  let { match } = resolved;

  if (!match) {
    const team1Id = normalizeText(body?.team1Id);
    const team2Id = normalizeText(body?.team2Id);
    if (
      !Types.ObjectId.isValid(team1Id) ||
      !Types.ObjectId.isValid(team2Id) ||
      team1Id === team2Id
    ) {
      return null;
    }

    const teams = await findOwnedTournamentTeamsByIds(
      tournament._id as Types.ObjectId,
      userId,
      [team1Id, team2Id],
    );
    if (teams.length !== 2) {
      return null;
    }

    match = await TournamentMatch.create({
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
      team1: new Types.ObjectId(team1Id),
      team2: new Types.ObjectId(team2Id),
      pairKey: buildPairKey(team1Id, team2Id),
      status: "in_progress",
      scorerMatchId:
        normalizeText(body?.scorerMatchId) ||
        normalizeText(body?.clientMatchId) ||
        normalizeText(body?.gameId) ||
        undefined,
      startedAt: new Date(),
    });

    trackEvent(req, {
      type: "MATCH_STARTED",
      userId,
      metadata: {
        matchId: String(match._id),
        tournamentId: String(tournament._id),
        mode: "tournament",
      },
    });
  }

  const teams = await TournamentTeam.find({
    _id: { $in: [match.team1, match.team2] },
    tournament: tournament._id,
    organizer: new Types.ObjectId(userId),
  });
  const teamById = new Map(teams.map((team) => [String(team._id), team]));
  const team1Id = String(match.team1);
  const team2Id = String(match.team2);

  let winnerTeamId = normalizeText(body?.winnerTeamId);
  const winnerTeamName = normalizeText(body?.winnerTeamName);
  if (!winnerTeamId && winnerTeamName && winnerTeamName !== "Tied") {
    const winnerByName = [...teamById.values()].find(
      (team) => team.name.toLowerCase() === winnerTeamName.toLowerCase(),
    );
    winnerTeamId = winnerByName ? String(winnerByName._id) : "";
  }

  const isCompleted = body?.status === "completed";
  const hasResult = Boolean(
    winnerTeamId ||
      winnerTeamName ||
      normalizeText(body?.resultText) ||
      body?.team1Inning ||
      body?.team2Inning,
  );
  if (!isCompleted && !hasResult) {
    match.status = match.status === "completed" ? "completed" : "in_progress";
    match.resultText = normalizeText(body?.resultText);
    match.scorerMatchId =
      normalizeText(body?.scorerMatchId) ||
      normalizeText(body?.clientMatchId) ||
      normalizeText(body?.gameId) ||
      match.scorerMatchId;
    match.snapshot = buildMatchStatSource(body);
    match.startedAt = match.startedAt ?? new Date();
    await match.save();

    return {
      match: serializeMatch(match, teamById),
      teams: teams.map(serializeTeam),
      tournament: await serializeTournament(tournament, userId, true),
      redirectTo: `/tournaments/${String(tournament._id)}`,
    };
  }

  const isTie = !winnerTeamId || winnerTeamName === "Tied";
  if (!isTie && winnerTeamId !== team1Id && winnerTeamId !== team2Id) {
    return null;
  }

  match.status = "completed";
  match.winnerTeam = isTie ? undefined : new Types.ObjectId(winnerTeamId);
  match.resultText = normalizeText(body?.resultText);
  match.scorerMatchId =
    normalizeText(body?.scorerMatchId) ||
    normalizeText(body?.clientMatchId) ||
    normalizeText(body?.gameId) ||
    match.scorerMatchId;
  match.snapshot = buildMatchStatSource(body);
  match.startedAt = match.startedAt ?? new Date();
  match.completedAt = new Date();

  await match.save();

  trackEvent(req, {
    type: "MATCH_COMPLETED",
    userId,
    metadata: {
      matchId: String(match._id),
      tournamentId: String(tournament._id),
      mode: "tournament",
    },
  });
  const recalculatedTeams = await recalculateTournamentStatistics(
    tournament._id as Types.ObjectId,
    userId,
  );
  const recalculatedTeamById = new Map(
    recalculatedTeams.map((team) => [String(team._id), team]),
  );

  return {
    match: serializeMatch(match, recalculatedTeamById),
    teams: recalculatedTeams.map(serializeTeam),
    tournament: await serializeTournament(tournament, userId, true),
    redirectTo: `/tournaments/${String(tournament._id)}`,
  };
};

export const completeTournamentMatch = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = ensureAuthenticated(req, res);
    if (!userId) return;

    const tournament = await findOwnedTournament(req.params.tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }

    let match = await resolveTournamentMatch(
      tournament._id as Types.ObjectId,
      userId,
      req.params.matchId,
      req.body,
    );

    if (!match) {
      const team1Id = normalizeText(req.body?.team1Id);
      const team2Id = normalizeText(req.body?.team2Id);
      if (
        !Types.ObjectId.isValid(team1Id) ||
        !Types.ObjectId.isValid(team2Id) ||
        team1Id === team2Id
      ) {
        res.status(404).json({ message: "Match not found" });
        return;
      }

      const teams = await findOwnedTournamentTeamsByIds(
        tournament._id as Types.ObjectId,
        userId,
        [team1Id, team2Id],
      );
      if (teams.length !== 2) {
        res.status(400).json({ message: "Both teams must belong to tournament" });
        return;
      }

      match = await TournamentMatch.create({
        tournament: tournament._id,
        organizer: new Types.ObjectId(userId),
        team1: new Types.ObjectId(team1Id),
        team2: new Types.ObjectId(team2Id),
        pairKey: buildPairKey(team1Id, team2Id),
        status: "in_progress",
        scorerMatchId:
          normalizeText(req.body?.scorerMatchId) ||
          normalizeText(req.body?.clientMatchId) ||
          normalizeText(req.body?.gameId) ||
          undefined,
        startedAt: new Date(),
      });

      trackEvent(req, {
        type: "MATCH_STARTED",
        userId,
        metadata: {
          matchId: String(match._id),
          tournamentId: String(tournament._id),
          mode: "tournament",
        },
      });
    }

    const teams = await TournamentTeam.find({
      _id: { $in: [match.team1, match.team2] },
      tournament: tournament._id,
      organizer: new Types.ObjectId(userId),
    });
    const teamById = new Map(teams.map((team) => [String(team._id), team]));

    const statSource = buildMatchStatSource(req.body);
    let winnerTeamId = normalizeText(req.body?.winnerTeamId);
    const winnerTeamName = normalizeText(req.body?.winnerTeamName);
    const team1Id = String(match.team1);
    const team2Id = String(match.team2);
    if (!winnerTeamId && winnerTeamName && winnerTeamName !== "Tied") {
      const winnerByName = [...teamById.values()].find(
        (team) => team.name.toLowerCase() === winnerTeamName.toLowerCase(),
      );
      winnerTeamId = winnerByName ? String(winnerByName._id) : "";
    }
    const isTie = !winnerTeamId || winnerTeamName === "Tied";
    if (!isTie && winnerTeamId !== team1Id && winnerTeamId !== team2Id) {
      res.status(400).json({ message: "Winner team must be part of this match" });
      return;
    }

    if (!teamById.get(team1Id) || !teamById.get(team2Id)) {
      res.status(400).json({ message: "Match teams were not found" });
      return;
    }

    match.status = "completed";
    match.winnerTeam = isTie ? undefined : new Types.ObjectId(winnerTeamId);
    match.resultText = normalizeText(req.body?.resultText);
    match.scorerMatchId =
      normalizeText(req.body?.scorerMatchId) ||
      normalizeText(req.body?.clientMatchId) ||
      normalizeText(req.body?.gameId) ||
      match.scorerMatchId;
    match.snapshot = statSource;
    match.startedAt = match.startedAt ?? new Date();
    match.completedAt = new Date();

    await match.save();

    trackEvent(req, {
      type: "MATCH_COMPLETED",
      userId,
      metadata: {
        matchId: String(match._id),
        tournamentId: String(tournament._id),
        mode: "tournament",
      },
    });
    const recalculatedTeams = await recalculateTournamentStatistics(
      tournament._id as Types.ObjectId,
      userId,
    );
    const recalculatedTeamById = new Map(
      recalculatedTeams.map((team) => [String(team._id), team]),
    );

    res.status(200).json({
      match: serializeMatch(match, recalculatedTeamById),
      teams: recalculatedTeams.map(serializeTeam),
      tournament: await serializeTournament(tournament, userId, true),
      redirectTo: `/tournaments/${String(tournament._id)}`,
    });
  } catch (error) {
    console.error("Complete tournament match error", error);
    res.status(500).json({ message: "Unable to complete match" });
  }
};
