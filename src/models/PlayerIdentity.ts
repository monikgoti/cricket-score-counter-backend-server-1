import { Schema, model, type Document, type Types } from "mongoose";

/**
 * public   – listed in search/explore; profile and stats open to anyone.
 * unlisted – not listed anywhere, but anyone with the link (or the exact
 *            username) can open the profile and stats.
 * hidden   – only the owner can see the profile and stats.
 */
export const PLAYER_VISIBILITIES = ["public", "unlisted", "hidden"] as const;
export type PlayerVisibility = (typeof PLAYER_VISIBILITIES)[number];

export interface IPlayerIdentity extends Document {
  createdBy: Types.ObjectId;
  /** The user account that owns this profile (self-registered or claimed). */
  user?: Types.ObjectId;
  claimedAt?: Date;
  city?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  visibility?: PlayerVisibility;
  /** Small JPEG/PNG data URL, served via GET /players/:id/avatar. */
  avatarData?: string;
  avatarVersion?: number;
  /** Set when this (organizer-created) record was claimed into another profile. */
  mergedInto?: Types.ObjectId;
  /** Set by a platform admin: the profile is hidden everywhere public and
   *  its owner can't make it public again until an admin lifts it. */
  suspendedAt?: Date;
  /** Visibility before the suspension, restored when it's lifted. */
  visibilityBeforeSuspension?: PlayerVisibility;
  name: string;
  username: string;
  role?: string;
  contactNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const playerIdentitySchema = new Schema<IPlayerIdentity>(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
      unique: true,
      index: true,
    },
    role: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    claimedAt: { type: Date },
    city: { type: String, trim: true },
    battingStyle: { type: String, trim: true },
    bowlingStyle: { type: String, trim: true },
    visibility: {
      type: String,
      enum: PLAYER_VISIBILITIES,
      default: "public",
    },
    avatarData: { type: String, select: false },
    avatarVersion: { type: Number, default: 0 },
    mergedInto: {
      type: Schema.Types.ObjectId,
      ref: "PlayerIdentity",
    },
    suspendedAt: { type: Date },
    visibilityBeforeSuspension: { type: String, enum: PLAYER_VISIBILITIES },
  },
  { timestamps: true },
);

playerIdentitySchema.index({ name: "text", username: "text" });
// One player profile per user account.
playerIdentitySchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: "objectId" } } },
);

export const PlayerIdentity = model<IPlayerIdentity>(
  "PlayerIdentity",
  playerIdentitySchema,
);
