import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/authMiddleware";
import { getPlayers, savePlayers } from "../controllers/playerController";
import { getPlayerCareerStats } from "../controllers/playerStatsController";
import {
  decideClaim,
  getPlayerAvatar,
  getPublicPlayerProfile,
  getRecentPlayers,
  requestClaim,
  searchPlayers,
} from "../controllers/playerAccountController";

const router = Router();

router.get("/", requireAuth, getPlayers);
router.post("/", requireAuth, savePlayers);
router.get("/search", requireAuth, searchPlayers);
router.get("/recent", requireAuth, getRecentPlayers);
router.get("/public/:username", getPublicPlayerProfile);
router.post("/claims/:claimId/:decision", requireAuth, decideClaim);
router.get("/:playerId/avatar", getPlayerAvatar);
// Login optional: public/unlisted profiles are open to anyone.
router.get("/:playerId/stats", optionalAuth, getPlayerCareerStats);
router.post("/:playerId/claim", requireAuth, requestClaim);

export default router;
