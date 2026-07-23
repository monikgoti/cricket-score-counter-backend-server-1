import { Schema, model, type Document, type Types } from "mongoose";

export interface IPlayer extends Document {
  user: Types.ObjectId;
  teamName: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const playerSchema = new Schema<IPlayer>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

playerSchema.index({ user: 1, teamName: 1, name: 1 }, { unique: true });

export const Player = model<IPlayer>("Player", playerSchema);
