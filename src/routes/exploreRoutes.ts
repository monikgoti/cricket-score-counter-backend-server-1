import { Router } from "express";
import { optionalAuth } from "../middleware/authMiddleware";
import {
  explorePlayers,
  exploreTournaments,
  getPublicTournament,
  getPublicTournamentPlayerStats,
  getPublicTournamentScorecard,
} from "../controllers/exploreController";

// Login-free discovery: public players and tournaments. A token, when sent,
// lets organizers and squad players open their private tournaments too.
const router = Router();
router.use(optionalAuth);

router.get("/players", explorePlayers);
router.get("/tournaments", exploreTournaments);
router.get("/tournaments/:tournamentId", getPublicTournament);
router.get("/tournaments/:tournamentId/player-stats", getPublicTournamentPlayerStats);
router.get("/tournaments/:tournamentId/matches/:matchId", getPublicTournamentScorecard);

export default router;
