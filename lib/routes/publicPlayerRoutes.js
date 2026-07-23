"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const playerTeamController_1 = require("../controllers/playerTeamController");
const router = (0, express_1.Router)();
router.get("/", playerTeamController_1.getPublicPlayers);
exports.default = router;
//# sourceMappingURL=publicPlayerRoutes.js.map