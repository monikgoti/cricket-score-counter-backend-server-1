"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const savedMatchController_1 = require("../controllers/savedMatchController");
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.requireAuth, savedMatchController_1.getMatches);
router.get("/:id", authMiddleware_1.requireAuth, savedMatchController_1.getMatch);
router.post("/", authMiddleware_1.requireAuth, savedMatchController_1.saveMatch);
exports.default = router;
//# sourceMappingURL=savedMatchRoutes.js.map