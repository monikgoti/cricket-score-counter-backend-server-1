import type { Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { Player } from "../models/Player";

const normalizeName = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizePlayers = (players: unknown): string[] => {
  if (!Array.isArray(players)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  players.forEach((player) => {
    const name = normalizeName(player);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  });

  return result;
};

export const getPlayers = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const teams =
      typeof req.query.teams === "string"
        ? req.query.teams
            .split(",")
            .map((team) => team.trim())
            .filter(Boolean)
        : [];

    const query: Record<string, unknown> = {
      user: new Types.ObjectId(req.user.id),
    };
    if (teams.length) {
      query.teamName = { $in: teams };
    }

    const rows = await Player.find(query).sort({ teamName: 1, createdAt: 1 });
    const playersByTeam = rows.reduce<Record<string, string[]>>((acc, row) => {
      acc[row.teamName] = [...(acc[row.teamName] ?? []), row.name];
      return acc;
    }, {});

    res.status(200).json({ playersByTeam });
  } catch (error) {
    console.error("Get players error", error);
    res.status(500).json({ message: "Unable to load players" });
  }
};

export const savePlayers = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const teams = Array.isArray(req.body?.teams) ? req.body.teams : [];
    const user = new Types.ObjectId(req.user.id);
    const saved: Record<string, string[]> = {};

    for (const team of teams) {
      const teamName = normalizeName(team?.teamName);
      const players = normalizePlayers(team?.players);
      if (!teamName) continue;

      await Player.deleteMany({ user, teamName });
      if (players.length) {
        await Player.insertMany(
          players.map((name) => ({
            user,
            teamName,
            name,
          })),
          { ordered: false },
        );
      }
      saved[teamName] = players;
    }

    res.status(200).json({ playersByTeam: saved });
  } catch (error) {
    console.error("Save players error", error);
    res.status(500).json({ message: "Unable to save players" });
  }
};
