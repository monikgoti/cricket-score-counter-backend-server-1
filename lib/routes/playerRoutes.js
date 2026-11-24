"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const playerController_1 = require("../controllers/playerController");
const playerStatsController_1 = require("../controllers/playerStatsController");
const playerAccountController_1 = require("../controllers/playerAccountController");
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.requireAuth, playerController_1.getPlayers);
router.post("/", authMiddleware_1.requireAuth, playerController_1.savePlayers);
router.get("/search", authMiddleware_1.requireAuth, playerAccountController_1.searchPlayers);
router.get("/recent", authMiddleware_1.requireAuth, playerAccountController_1.getRecentPlayers);
router.get("/public/:username", playerAccountController_1.getPublicPlayerProfile);
router.post("/claims/:claimId/:decision", authMiddleware_1.requireAuth, playerAccountController_1.decideClaim);
router.get("/:playerId/avatar", playerAccountController_1.getPlayerAvatar);
router.get("/:playerId/stats", authMiddleware_1.requireAuth, playerStatsController_1.getPlayerCareerStats);
router.post("/:playerId/claim", authMiddleware_1.requireAuth, playerAccountController_1.requestClaim);
exports.default = router;
//# sourceMappingURL=playerRoutes.js.map