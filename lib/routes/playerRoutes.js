"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const playerController_1 = require("../controllers/playerController");
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.requireAuth, playerController_1.getPlayers);
router.post("/", authMiddleware_1.requireAuth, playerController_1.savePlayers);
exports.default = router;
//# sourceMappingURL=playerRoutes.js.map