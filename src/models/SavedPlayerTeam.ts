import { Schema, model, type Document, type Types } from "mongoose";

export interface ISavedTeamPlayer {
  _id?: Types.ObjectId;
  playerId: Types.ObjectId;
  name: string;
  username: string;
  role?: string;
  contactNumber?: string;
}

export interface ISavedPlayerTeam extends Document {
  owner: Types.ObjectId;
  name: string;
  logoUrl?: string;
  captainName?: string;
  contactNumber?: string;
  players: ISavedTeamPlayer[];
  createdAt: Date;
  updatedAt: Date;
}

const savedTeamPlayerSchema = new Schema<ISavedTeamPlayer>(
  {
    playerId: {
      type: Schema.Types.ObjectId,
      ref: "PlayerIdentity",
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
  { _id: true },
);

const savedPlayerTeamSchema = new Schema<ISavedPlayerTeam>(
  {
    owner: {
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
    logoUrl: {
      type: String,
      trim: true,
    },
    captainName: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    players: {
      type: [savedTeamPlayerSchema],
      default: [],
    },
  },
  { timestamps: true },
);

savedPlayerTeamSchema.index(
  { owner: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

export const SavedPlayerTeam = model<ISavedPlayerTeam>(
  "SavedPlayerTeam",
  savedPlayerTeamSchema,
);
