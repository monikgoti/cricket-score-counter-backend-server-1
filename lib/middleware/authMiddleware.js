"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const User_1 = require("../models/User");
const jwt_1 = require("../utils/jwt");
const requireAuth = async (req, res, next) => {
    var _a;
    try {
        const authHeader = req.headers.authorization;
        const token = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))
            ? authHeader.slice("Bearer ".length)
            : null;
        if (!token || !process.env.JWT_SECRET) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const verification = (0, jwt_1.verifyTokenWithRefresh)(token);
        if (verification.status !== "valid") {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        if (verification.refreshedToken) {
            res.setHeader("X-Access-Token", verification.refreshedToken);
            res.setHeader("Access-Control-Expose-Headers", "X-Access-Token");
        }
        const user = await User_1.User.findById(verification.userId);
        if (!user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        req.user = {
            id: String(user._id),
            name: user.name,
            email: (_a = user.email) !== null && _a !== void 0 ? _a : "",
            phoneNumber: user.phoneNumber,
        };
        next();
    }
    catch (error) {
        res.status(401).json({ message: "Unauthorized" });
    }
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=authMiddleware.js.map