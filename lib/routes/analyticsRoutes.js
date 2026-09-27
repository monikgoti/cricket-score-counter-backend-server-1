"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analyticsController_1 = require("../controllers/analyticsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.post("/track", authMiddleware_1.optionalAuth, analyticsController_1.trackClientEvent);
router.get("/daily", authMiddleware_1.requireAuth, authMiddleware_1.requireAnalyticsAdmin, analyticsController_1.getDailyStats);
router.get("/summary", authMiddleware_1.requireAuth, authMiddleware_1.requireAnalyticsAdmin, analyticsController_1.getSummaryStats);
exports.default = router;
//# sourceMappingURL=analyticsRoutes.js.map