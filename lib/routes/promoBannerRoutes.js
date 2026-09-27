"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promoBannerController_1 = require("../controllers/promoBannerController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Public -- the web app fetches GET /api/v1/promo-banner/home with no auth
// and gets back every currently-visible banner for that slot.
router.get("/:slot", promoBannerController_1.listBanners);
// Admin only, from here down.
router.get("/:slot/admin", authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, promoBannerController_1.listBannersAdmin);
router.post("/:slot", authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, promoBannerController_1.createBanner);
router.put("/:slot/:id", authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, promoBannerController_1.updateBanner);
router.delete("/:slot/:id", authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, promoBannerController_1.deleteBanner);
exports.default = router;
//# sourceMappingURL=promoBannerRoutes.js.map