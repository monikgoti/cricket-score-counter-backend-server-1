import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { getPlayers, savePlayers } from "../controllers/playerController";

const router = Router();

router.get("/", requireAuth, getPlayers);
router.post("/", requireAuth, savePlayers);

export default router;
