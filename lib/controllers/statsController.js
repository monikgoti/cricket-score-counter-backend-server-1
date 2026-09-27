"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStats = void 0;
const User_1 = require("../models/User");
const socketState_1 = require("../utils/socketState");
const getStats = async (req, res) => {
    try {
        const totalUsers = await User_1.User.countDocuments();
        const activeUsers = (0, socketState_1.getActiveUserCount)();
        res.status(200).json({
            totalUsers,
            activeUsers,
        });
    }
    catch (error) {
        console.error("Failed to fetch stats", error);
        res.status(500).json({ message: "Failed to fetch stats" });
    }
};
exports.getStats = getStats;
//# sourceMappingURL=statsController.js.map