"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SavedPlayerTeam = void 0;
const mongoose_1 = require("mongoose");
const savedTeamPlayerSchema = new mongoose_1.Schema({
    playerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "PlayerIdentity",
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    username: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    role: {
        type: String,
        trim: true,
    },
    contactNumber: {
        type: String,
        trim: true,
    },
}, { _id: true });
const savedPlayerTeamSchema = new mongoose_1.Schema({
    owner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    logoUrl: {
        type: String,
        trim: true,
    },
    captainName: {
        type: String,
        trim: true,
    },
    contactNumber: {
        type: String,
        trim: true,
    },
    players: {
        type: [savedTeamPlayerSchema],
        default: [],
    },
}, { timestamps: true });
savedPlayerTeamSchema.index({ owner: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
exports.SavedPlayerTeam = (0, mongoose_1.model)("SavedPlayerTeam", savedPlayerTeamSchema);
//# sourceMappingURL=SavedPlayerTeam.js.map