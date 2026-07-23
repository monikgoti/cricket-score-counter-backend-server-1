import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  createSavedPlayerTeam,
  deleteSavedPlayerTeam,
  getSavedPlayerTeams,
  updateSavedPlayerTeam,
} from "../controllers/playerTeamController";

const router = Router();

router.get("/", requireAuth, getSavedPlayerTeams);
router.post("/", requireAuth, createSavedPlayerTeam);
router.put("/:teamId", requireAuth, updateSavedPlayerTeam);
router.patch("/:teamId", requireAuth, updateSavedPlayerTeam);
router.delete("/:teamId", requireAuth, deleteSavedPlayerTeam);

export default router;
