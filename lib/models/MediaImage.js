"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaImage = void 0;
const mongoose_1 = require("mongoose");
const mediaImageSchema = new mongoose_1.Schema({
    owner: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, default: "logo", trim: true },
    data: { type: String, select: false },
    url: { type: String, trim: true },
    hash: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
// The same picture uploaded twice by the same user is stored once.
mediaImageSchema.index({ owner: 1, hash: 1 }, { unique: true });
exports.MediaImage = (0, mongoose_1.model)("MediaImage", mediaImageSchema);
//# sourceMappingURL=MediaImage.js.map