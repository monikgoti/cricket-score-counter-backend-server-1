import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware";
import {
  deleteMatch,
  deleteTournament,
  getOverview,
  listMatches,
  listPlayers,
  listTournaments,
  setPlayerSuspension,
} from "../controllers/adminController";

// Platform admin (emails in ADMIN_EMAILS only).
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/overview", getOverview);
router.get("/tournaments", listTournaments);
router.delete("/tournaments/:id", deleteTournament);
router.get("/players", listPlayers);
router.post("/players/:id/suspension", setPlayerSuspension);
router.get("/matches", listMatches);
router.delete("/matches/:kind/:id", deleteMatch);

export default router;
