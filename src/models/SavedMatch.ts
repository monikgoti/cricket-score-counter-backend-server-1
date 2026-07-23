import { Schema, model, type Document, type Types } from "mongoose";

export interface ISavedMatch extends Document {
  user: Types.ObjectId;
  clientMatchId: string;
  teams: string[];
  status: "in_progress" | "completed";
  resultText: string;
  snapshot: Record<string, unknown>;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const savedMatchSchema = new Schema<ISavedMatch>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clientMatchId: {
      type: String,
      required: true,
      trim: true,
    },
    teams: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["in_progress", "completed"],
      default: "in_progress",
      index: true,
    },
    resultText: {
      type: String,
      default: "",
      trim: true,
    },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    savedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

savedMatchSchema.index({ user: 1, clientMatchId: 1 }, { unique: true });

export const SavedMatch = model<ISavedMatch>("SavedMatch", savedMatchSchema);
