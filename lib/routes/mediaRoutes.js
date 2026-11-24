"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const mediaController_1 = require("../controllers/mediaController");
const router = (0, express_1.Router)();
router.post("/images", authMiddleware_1.requireAuth, mediaController_1.uploadImage);
router.get("/:id", mediaController_1.getImage);
exports.default = router;
//# sourceMappingURL=mediaRoutes.js.map