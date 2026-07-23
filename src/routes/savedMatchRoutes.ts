import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  getMatch,
  getMatches,
  saveMatch,
} from "../controllers/savedMatchController";

const router = Router();

router.get("/", requireAuth, getMatches);
router.get("/:id", requireAuth, getMatch);
router.post("/", requireAuth, saveMatch);

export default router;
