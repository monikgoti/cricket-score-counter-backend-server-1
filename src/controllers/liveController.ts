import type { Request, Response } from "express";
import { TournamentMatch } from "../models/TournamentMatch";
import { Tournament } from "../models/Tournament";
import { TournamentTeam } from "../models/TournamentTeam";
import { isTournamentLiveCode } from "../utils/liveCode";

/**
 * GET /api/v1/live/:code — public, no login.
 *
 * What a spectator needs to follow a tournament match the organizer shared:
 * names, logos, status, result and the latest saved score (updated every
 * over while it's being scored, and the final scorecard once it's done).
 * Ball-by-ball updates still come over the live socket; this is what the
 * watch page shows when the scorer isn't connected. Nothing private
 * (phone numbers, organizer account) is included.
 */
export const getLiveMatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code ?? "").trim().toUpperCase();
    if (!isTournamentLiveCode(code)) {
      res.status(404).json({ message: "Match not found" });
      return;
    }
    const match = await TournamentMatch.findOne({ liveCode: code }).lean();
    if (!match) {
      res.status(404).json({ message: "Match not found" });
      return;
    }
    const [tournament, teams] = await Promise.all([
      Tournament.findById(match.tournament).select("name logoUrl location").lean(),
      TournamentTeam.find({ _id: { $in: [match.team1, match.team2] } }).select("name logoUrl").lean(),
    ]);
    if (!tournament) {
      res.status(404).json({ message: "Match not found" });
      return;
    }
    const teamById = new Map(teams.map((team) => [String(team._id), team]));
    const team = (id: unknown) => {
      const doc = id ? teamById.get(String(id)) : undefined;
      return { name: doc?.name ?? "", logoUrl: doc?.logoUrl ?? "" };
    };
    res.setHeader(
      "Cache-Control",
      match.status === "completed" ? "public, max-age=300" : "public, max-age=15",
    );
    res.status(200).json({
      match: {
        code,
        status: match.status,
        tournamentName: tournament.name,
        tournamentLogoUrl: tournament.logoUrl ?? "",
        location: tournament.location ?? "",
        team1: team(match.team1),
        team2: team(match.team2),
        winnerTeamName: match.winnerTeam ? team(match.winnerTeam).name : "",
        resultText: match.resultText ?? "",
        snapshot: match.snapshot ?? null,
        startedAt: match.startedAt ?? null,
        completedAt: match.completedAt ?? null,
        updatedAt: match.updatedAt,
      },
    });
  } catch (error) {
    console.error("getLiveMatch failed", error);
    res.status(500).json({ message: "Unable to load match" });
  }
};
