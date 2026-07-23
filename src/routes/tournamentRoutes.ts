import { Router } from "express";
import {
  createTournament,
  createTournamentTeam,
  completeTournamentMatch,
  deleteTournament,
  deleteTournamentTeam,
  getTournament,
  getTournamentMatchesList,
  getTournaments,
  getTournamentTeams,
  recalculateTournamentTeamStatistics,
  startTournamentMatch,
  updateTournament,
  updateTournamentTeam,
  updateTournamentTeamPlayers,
  updateTournamentTeamStatistics,
} from "../controllers/tournamentController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

router.get("/", requireAuth, getTournaments);
router.post("/", requireAuth, createTournament);
router.get("/:tournamentId", requireAuth, getTournament);
router.patch("/:tournamentId", requireAuth, updateTournament);
router.put("/:tournamentId", requireAuth, updateTournament);
router.delete("/:tournamentId", requireAuth, deleteTournament);

router.get("/:tournamentId/teams", requireAuth, getTournamentTeams);
router.post("/:tournamentId/teams", requireAuth, createTournamentTeam);
router.patch("/:tournamentId/teams/:teamId", requireAuth, updateTournamentTeam);
router.put("/:tournamentId/teams/:teamId", requireAuth, updateTournamentTeam);
router.put(
  "/:tournamentId/teams/:teamId/players",
  requireAuth,
  updateTournamentTeamPlayers,
);
router.patch(
  "/:tournamentId/teams/:teamId/statistics",
  requireAuth,
  updateTournamentTeamStatistics,
);
router.delete("/:tournamentId/teams/:teamId", requireAuth, deleteTournamentTeam);

router.post(
  "/:tournamentId/statistics/recalculate",
  requireAuth,
  recalculateTournamentTeamStatistics,
);
router.post(
  "/:tournamentId/statistics/sync",
  requireAuth,
  recalculateTournamentTeamStatistics,
);
router.post(
  "/:tournamentId/points-table/sync",
  requireAuth,
  recalculateTournamentTeamStatistics,
);

router.get("/:tournamentId/matches", requireAuth, getTournamentMatchesList);
router.post("/:tournamentId/matches/start", requireAuth, startTournamentMatch);
router.post(
  "/:tournamentId/matches/complete",
  requireAuth,
  completeTournamentMatch,
);
router.post(
  "/:tournamentId/matches/:matchId/complete",
  requireAuth,
  completeTournamentMatch,
);
router.patch(
  "/:tournamentId/matches/:matchId/fix",
  requireAuth,
  completeTournamentMatch,
);
router.post(
  "/:tournamentId/matches/:matchId/fix",
  requireAuth,
  completeTournamentMatch,
);

export default router;
