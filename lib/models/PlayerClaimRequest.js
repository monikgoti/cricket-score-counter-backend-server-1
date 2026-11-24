"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerClaimRequest = exports.CLAIM_STATUSES = void 0;
const mongoose_1 = require("mongoose");
exports.CLAIM_STATUSES = ["pending", "approved", "rejected", "cancelled"];
const claimSchema = new mongoose_1.Schema({
    identity: { type: mongoose_1.Schema.Types.ObjectId, ref: "PlayerIdentity", required: true, index: true },
    requesterPlayer: { type: mongoose_1.Schema.Types.ObjectId, ref: "PlayerIdentity", required: true },
    requester: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    approver: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: exports.CLAIM_STATUSES, default: "pending", index: true },
    message: { type: String, trim: true, maxlength: 300 },
    decidedAt: { type: Date },
}, { timestamps: true });
exports.PlayerClaimRequest = (0, mongoose_1.model)("PlayerClaimRequest", claimSchema);
//# sourceMappingURL=PlayerClaimRequest.js.map