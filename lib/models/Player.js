"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Player = void 0;
const mongoose_1 = require("mongoose");
const playerSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    teamName: {
        type: String,
        required: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
}, {
    timestamps: true,
});
playerSchema.index({ user: 1, teamName: 1, name: 1 }, { unique: true });
exports.Player = (0, mongoose_1.model)("Player", playerSchema);
//# sourceMappingURL=Player.js.map