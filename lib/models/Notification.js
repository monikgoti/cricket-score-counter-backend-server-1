"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = exports.NOTIFICATION_TYPES = void 0;
const mongoose_1 = require("mongoose");
exports.NOTIFICATION_TYPES = [
    "squad_added",
    "team_added",
    "claim_requested",
    "claim_approved",
    "claim_rejected",
    "player_left_squad",
];
const notificationSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: exports.NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    link: { type: String, trim: true },
    data: { type: mongoose_1.Schema.Types.Mixed },
    readAt: { type: Date },
}, { timestamps: true });
notificationSchema.index({ user: 1, createdAt: -1 });
// Notifications clean themselves up after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
exports.Notification = (0, mongoose_1.model)("Notification", notificationSchema);
//# sourceMappingURL=Notification.js.map