import { Schema, model, type Document, type Types } from "mongoose";

export interface IPlayerIdentity extends Document {
  createdBy: Types.ObjectId;
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
  },
  { timestamps: true },
);

playerIdentitySchema.index({ name: "text", username: "text" });

export const PlayerIdentity = model<IPlayerIdentity>(
  "PlayerIdentity",
  playerIdentitySchema,
);
