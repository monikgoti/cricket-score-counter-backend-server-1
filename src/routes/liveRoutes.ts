import { Router } from "express";
import { getLiveMatch } from "../controllers/liveController";

const router = Router();

router.get("/:code", getLiveMatch);

export default router;
