"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsEvent = exports.ANALYTICS_EVENT_TYPES = void 0;
const mongoose_1 = require("mongoose");
exports.ANALYTICS_EVENT_TYPES = [
    "PAGE_VIEW",
    "USER_SIGNUP",
    "USER_LOGIN",
    "TOURNAMENT_CREATED",
    "MATCH_STARTED",
    "MATCH_COMPLETED",
    // Home-page ad/promo banner instrumentation (see PromoBannerCard.tsx on
    // the frontend) -- VIEW fires once per banner while it's actually
    // visible in the viewport, CLICK fires on either of its buttons.
    // metadata carries { bannerId, slot, title, ctaKind?, buttonText?, url? }.
    "PROMO_BANNER_VIEW",
    "PROMO_BANNER_CLICK",
];
const analyticsEventSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: exports.ANALYTICS_EVENT_TYPES,
        required: true,
    },
    day: {
        type: String,
        required: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
    },
    sessionId: {
        type: String,
    },
    path: {
        type: String,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
    },
}, {
    timestamps: { createdAt: true, updatedAt: false },
});
analyticsEventSchema.index({ day: 1, type: 1 });
analyticsEventSchema.index({ day: 1, userId: 1 });
analyticsEventSchema.index({ day: 1, sessionId: 1 });
exports.AnalyticsEvent = (0, mongoose_1.model)("AnalyticsEvent", analyticsEventSchema);
//# sourceMappingURL=AnalyticsEvent.js.map