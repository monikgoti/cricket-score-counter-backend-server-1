"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const adminController_1 = require("../controllers/adminController");
// Platform admin (emails in ADMIN_EMAILS only).
const router = (0, express_1.Router)();
router.use(authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin);
router.get("/overview", adminController_1.getOverview);
router.get("/tournaments", adminController_1.listTournaments);
router.delete("/tournaments/:id", adminController_1.deleteTournament);
router.get("/players", adminController_1.listPlayers);
router.post("/players/:id/suspension", adminController_1.setPlayerSuspension);
router.get("/matches", adminController_1.listMatches);
router.delete("/matches/:kind/:id", adminController_1.deleteMatch);
exports.default = router;
//# sourceMappingURL=adminRoutes.js.map