import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import { getImage, uploadImage } from "../controllers/mediaController";

const router = Router();
router.post("/images", requireAuth, uploadImage);
router.get("/:id", getImage);

export default router;
