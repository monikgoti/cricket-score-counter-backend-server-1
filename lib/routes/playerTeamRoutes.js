"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const playerTeamController_1 = require("../controllers/playerTeamController");
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.requireAuth, playerTeamController_1.getSavedPlayerTeams);
router.post("/", authMiddleware_1.requireAuth, playerTeamController_1.createSavedPlayerTeam);
router.put("/:teamId", authMiddleware_1.requireAuth, playerTeamController_1.updateSavedPlayerTeam);
router.patch("/:teamId", authMiddleware_1.requireAuth, playerTeamController_1.updateSavedPlayerTeam);
router.delete("/:teamId", authMiddleware_1.requireAuth, playerTeamController_1.deleteSavedPlayerTeam);
exports.default = router;
//# sourceMappingURL=playerTeamRoutes.js.map