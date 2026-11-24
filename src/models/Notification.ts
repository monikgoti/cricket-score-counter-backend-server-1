import { Schema, model, type Document, type Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "squad_added",
  "team_added",
  "claim_requested",
  "claim_approved",
  "claim_rejected",
  "player_left_squad",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification extends Document {
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path to open, e.g. /tournaments/:id or /me. */
  link?: string;
  data?: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    link: { type: String, trim: true },
    data: { type: Schema.Types.Mixed },
    readAt: { type: Date },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
// Notifications clean themselves up after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification = model<INotification>("Notification", notificationSchema);
