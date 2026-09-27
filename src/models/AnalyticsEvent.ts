import { Schema, model, Types, type Document } from "mongoose";

export const ANALYTICS_EVENT_TYPES = [
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
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface IAnalyticsEvent extends Document {
  type: AnalyticsEventType;
  day: string; // "YYYY-MM-DD" in UTC, precomputed for fast day-bucket queries
  userId?: Types.ObjectId;
  sessionId?: string;
  path?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const analyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    type: {
      type: String,
      enum: ANALYTICS_EVENT_TYPES,
      required: true,
    },
    day: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    sessionId: {
      type: String,
    },
    path: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

analyticsEventSchema.index({ day: 1, type: 1 });
analyticsEventSchema.index({ day: 1, userId: 1 });
analyticsEventSchema.index({ day: 1, sessionId: 1 });

export const AnalyticsEvent = model<IAnalyticsEvent>(
  "AnalyticsEvent",
  analyticsEventSchema,
);
