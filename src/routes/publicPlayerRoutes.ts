import { Router } from "express";
import { getPublicPlayers } from "../controllers/playerTeamController";

const router = Router();

router.get("/", getPublicPlayers);

export default router;
