import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  getIncomingClaims,
  getMyClaims,
  getMyPlayer,
  getMyTournaments,
  getNotifications,
  leaveTournamentTeam,
  markNotificationsRead,
  registerMyPlayer,
  updateMyPlayer,
} from "../controllers/playerAccountController";

const router = Router();
router.use(requireAuth);

router.get("/player", getMyPlayer);
router.post("/player", registerMyPlayer);
router.patch("/player", updateMyPlayer);
router.get("/claims", getMyClaims);
router.get("/claim-requests", getIncomingClaims);
router.get("/notifications", getNotifications);
router.post("/notifications/read", markNotificationsRead);
router.get("/tournaments", getMyTournaments);
router.post("/tournaments/teams/:teamId/leave", leaveTournamentTeam);

export default router;
