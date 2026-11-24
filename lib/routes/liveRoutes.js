"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const liveController_1 = require("../controllers/liveController");
const router = (0, express_1.Router)();
router.get("/:code", liveController_1.getLiveMatch);
exports.default = router;
//# sourceMappingURL=liveRoutes.js.map