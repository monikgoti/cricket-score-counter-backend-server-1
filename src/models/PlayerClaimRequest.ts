import { Schema, model, type Document, type Types } from "mongoose";

export const CLAIM_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/**
 * A registered player asking to take over a player record an organizer
 * created for them, so that record's match history joins their profile.
 * The organizer who created the record decides.
 */
export interface IPlayerClaimRequest extends Document {
  /** The organizer-created record being claimed. */
  identity: Types.ObjectId;
  /** The requesting user's own player profile. */
  requesterPlayer: Types.ObjectId;
  requester: Types.ObjectId;
  /** Who decides: the user who created `identity`. */
  approver: Types.ObjectId;
  status: ClaimStatus;
  message?: string;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const claimSchema = new Schema<IPlayerClaimRequest>(
  {
    identity: { type: Schema.Types.ObjectId, ref: "PlayerIdentity", required: true, index: true },
    requesterPlayer: { type: Schema.Types.ObjectId, ref: "PlayerIdentity", required: true },
    requester: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    approver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: CLAIM_STATUSES, default: "pending", index: true },
    message: { type: String, trim: true, maxlength: 300 },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

export const PlayerClaimRequest = model<IPlayerClaimRequest>("PlayerClaimRequest", claimSchema);
