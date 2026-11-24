"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const playerAccountController_1 = require("../controllers/playerAccountController");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.requireAuth);
router.get("/player", playerAccountController_1.getMyPlayer);
router.post("/player", playerAccountController_1.registerMyPlayer);
router.patch("/player", playerAccountController_1.updateMyPlayer);
router.get("/claims", playerAccountController_1.getMyClaims);
router.get("/claim-requests", playerAccountController_1.getIncomingClaims);
router.get("/notifications", playerAccountController_1.getNotifications);
router.post("/notifications/read", playerAccountController_1.markNotificationsRead);
router.get("/tournaments", playerAccountController_1.getMyTournaments);
router.post("/tournaments/teams/:teamId/leave", playerAccountController_1.leaveTournamentTeam);
exports.default = router;
//# sourceMappingURL=meRoutes.js.map