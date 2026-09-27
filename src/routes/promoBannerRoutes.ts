import { Router } from "express";
import {
  createBanner,
  deleteBanner,
  listBanners,
  listBannersAdmin,
  updateBanner,
} from "../controllers/promoBannerController";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware";

const router = Router();

// Public -- the web app fetches GET /api/v1/promo-banner/home with no auth
// and gets back every currently-visible banner for that slot.
router.get("/:slot", listBanners);

// Admin only, from here down.
router.get("/:slot/admin", requireAuth, requireAdmin, listBannersAdmin);
router.post("/:slot", requireAuth, requireAdmin, createBanner);
router.put("/:slot/:id", requireAuth, requireAdmin, updateBanner);
router.delete("/:slot/:id", requireAuth, requireAdmin, deleteBanner);

export default router;
