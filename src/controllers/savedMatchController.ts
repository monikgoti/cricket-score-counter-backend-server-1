import type { Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { SavedMatch, type ISavedMatch } from "../models/SavedMatch";
import { Tournament, type ITournament } from "../models/Tournament";
import {
  TournamentMatch,
  type ITournamentMatch,
} from "../models/TournamentMatch";
import { TournamentTeam, type ITournamentTeam } from "../models/TournamentTeam";
import { completeTournamentMatchFromSavedMatch } from "./tournamentController";

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const getMatchSortTime = (match: { savedAt?: unknown; updatedAt?: unknown }) => {
  const timestamp =
    match.savedAt instanceof Date
      ? match.savedAt
      : match.updatedAt instanceof Date
      ? match.updatedAt
      : null;
  return timestamp?.getTime() ?? 0;
};

const serializeMatch = (match: ISavedMatch) => ({
  id: String(match._id),
  source: "saved",
  isTournamentMatch: false,
  clientMatchId: match.clientMatchId,
  teams: match.teams ?? [],
  status: match.status,
  resultText: match.resultText ?? "",
  snapshot: match.snapshot,
  savedAt: match.savedAt,
  createdAt: match.createdAt,
  updatedAt: match.updatedAt,
});

const serializeTournamentMatch = (
  match: ITournamentMatch,
  teamById: Map<string, ITournamentTeam>,
  tournamentById: Map<string, ITournament>,
) => {
  const team1Id = String(match.team1);
  const team2Id = String(match.team2);
  const team1Name = teamById.get(team1Id)?.name ?? "";
  const team2Name = teamById.get(team2Id)?.name ?? "";
  const winnerTeamId = match.winnerTeam ? String(match.winnerTeam) : "";
  const tournamentId = String(match.tournament);
  const tournament = tournamentById.get(tournamentId);

  return {
    id: String(match._id),
    source: "tournament",
    isTournamentMatch: true,
    clientMatchId: match.scorerMatchId ?? "",
    scorerMatchId: match.scorerMatchId ?? "",
    tournamentId,
    tournamentName: tournament?.name ?? "",
    tournamentLogoUrl: tournament?.logoUrl ?? "",
    team1Id,
    team2Id,
    team1Name,
    team2Name,
    teams: [team1Name || team1Id, team2Name || team2Id],
    status: match.status,
    winnerTeamId,
    winnerTeamName: winnerTeamId ? teamById.get(winnerTeamId)?.name ?? "" : "",
    resultText: match.resultText ?? "",
    snapshot: match.snapshot ?? null,
    savedAt: match.completedAt ?? match.updatedAt ?? match.createdAt,
    startedAt: match.startedAt ?? "",
    completedAt: match.completedAt ?? "",
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
};

export const saveMatch = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const snapshot = req.body?.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      res.status(400).json({ message: "Match snapshot is required" });
      return;
    }

    const clientMatchId =
      normalizeText(req.body?.clientMatchId) ||
      normalizeText((snapshot as { gameId?: unknown }).gameId) ||
      `match-${Date.now()}`;

    const teams = Array.isArray(req.body?.teams)
      ? req.body.teams.map(normalizeText).filter(Boolean)
      : Array.isArray((snapshot as { teams?: unknown }).teams)
      ? ((snapshot as { teams?: unknown[] }).teams ?? [])
          .map(normalizeText)
          .filter(Boolean)
      : [];

    const status =
      req.body?.status === "completed" ? "completed" : "in_progress";
    const resultText = normalizeText(req.body?.resultText);
    const tournamentId = normalizeText(req.body?.tournamentId);
    const user = new Types.ObjectId(req.user.id);

    if (tournamentId) {
      if (!Types.ObjectId.isValid(tournamentId)) {
        res.status(400).json({ message: "Valid tournament id is required" });
        return;
      }

      const tournamentResult = await completeTournamentMatchFromSavedMatch(
        req.user.id,
        {
          ...req.body,
          snapshot,
          clientMatchId,
          scorerMatchId: normalizeText(req.body?.scorerMatchId) || clientMatchId,
          teams,
          status,
          resultText,
        },
      );

      if (!tournamentResult) {
        res.status(400).json({ message: "Unable to save tournament match" });
        return;
      }

      res.status(200).json({
        match: tournamentResult.match,
        tournamentMatch: tournamentResult.match,
        tournamentTeams: tournamentResult.teams,
        tournament: tournamentResult.tournament,
        redirectTo: tournamentResult.redirectTo,
      });
      return;
    }

    const match = await SavedMatch.findOneAndUpdate(
      { user, clientMatchId },
      {
        user,
        clientMatchId,
        teams,
        status,
        resultText,
        snapshot,
        savedAt: new Date(),
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({
      match: serializeMatch(match),
    });
  } catch (error) {
    console.error("Save match error", error);
    res.status(500).json({ message: "Unable to save match" });
  }
};

export const getMatches = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = new Types.ObjectId(req.user.id);
    const [savedMatches, tournamentMatches] = await Promise.all([
      SavedMatch.find({ user }).sort({ savedAt: -1 }),
      TournamentMatch.find({ organizer: user }).sort({
        completedAt: -1,
        updatedAt: -1,
        createdAt: -1,
      }),
    ]);

    const tournamentTeamIds = [
      ...new Set(
        tournamentMatches.flatMap((match) => [
          String(match.team1),
          String(match.team2),
          match.winnerTeam ? String(match.winnerTeam) : "",
        ]),
      ),
    ].filter(Boolean);
    const tournamentTeams = tournamentTeamIds.length
      ? await TournamentTeam.find({
          _id: { $in: tournamentTeamIds },
          organizer: user,
        })
      : [];
    const teamById = new Map(
      tournamentTeams.map((team) => [String(team._id), team]),
    );
    const tournamentIds = [
      ...new Set(tournamentMatches.map((match) => String(match.tournament))),
    ];
    const tournaments = tournamentIds.length
      ? await Tournament.find({
          _id: { $in: tournamentIds },
          organizer: user,
        })
      : [];
    const tournamentById = new Map(
      tournaments.map((tournament) => [String(tournament._id), tournament]),
    );

    const matches = [
      ...savedMatches.map(serializeMatch),
      ...tournamentMatches.map((match) =>
        serializeTournamentMatch(match, teamById, tournamentById),
      ),
    ].sort((a, b) => getMatchSortTime(b) - getMatchSortTime(a));

    res.status(200).json({ matches });
  } catch (error) {
    console.error("Get matches error", error);
    res.status(500).json({ message: "Unable to load matches" });
  }
};

export const getMatch = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const idQuery = Types.ObjectId.isValid(req.params.id)
      ? [{ _id: new Types.ObjectId(req.params.id) }]
      : [];

    const user = new Types.ObjectId(req.user.id);
    const match = await SavedMatch.findOne({
      user,
      $or: [...idQuery, { clientMatchId: req.params.id }],
    });

    if (match) {
      res.status(200).json({ match: serializeMatch(match) });
      return;
    }

    const tournamentMatch = await TournamentMatch.findOne({
      organizer: user,
      $or: [...idQuery, { scorerMatchId: req.params.id }],
    }).sort({ updatedAt: -1 });

    if (!tournamentMatch) {
      res.status(404).json({ message: "Match not found" });
      return;
    }

    const teamIds = [
      String(tournamentMatch.team1),
      String(tournamentMatch.team2),
      tournamentMatch.winnerTeam ? String(tournamentMatch.winnerTeam) : "",
    ].filter(Boolean);
    const teams = await TournamentTeam.find({
      _id: { $in: teamIds },
      organizer: user,
    });
    const teamById = new Map(teams.map((team) => [String(team._id), team]));
    const tournament = await Tournament.findOne({
      _id: tournamentMatch.tournament,
      organizer: user,
    });
    const tournamentById = new Map(
      tournament ? [[String(tournament._id), tournament]] : [],
    );

    res.status(200).json({
      match: serializeTournamentMatch(tournamentMatch, teamById, tournamentById),
    });
  } catch (error) {
    console.error("Get match error", error);
    res.status(500).json({ message: "Unable to load match" });
  }
};
