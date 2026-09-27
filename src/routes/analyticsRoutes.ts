import { Router } from "express";
import {
  getDailyStats,
  getSummaryStats,
  trackClientEvent,
} from "../controllers/analyticsController";
import {
  optionalAuth,
  requireAnalyticsAdmin,
  requireAuth,
} from "../middleware/authMiddleware";

const router = Router();

router.post("/track", optionalAuth, trackClientEvent);
router.get("/daily", requireAuth, requireAnalyticsAdmin, getDailyStats);
router.get("/summary", requireAuth, requireAnalyticsAdmin, getSummaryStats);

export default router;
