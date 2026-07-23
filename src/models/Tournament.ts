import { Schema, model, type Document, type Types } from "mongoose";

export const TOURNAMENT_FORMATS = ["league", "knockout"] as const;
export const BALL_TYPES = ["tennis", "leather", "custom"] as const;
export const TOURNAMENT_STATUSES = ["draft", "active", "completed"] as const;
export const TOURNAMENT_SQUAD_MODES = ["teams_only", "with_players"] as const;

export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];
export type BallType = (typeof BALL_TYPES)[number];
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export type TournamentSquadMode = (typeof TOURNAMENT_SQUAD_MODES)[number];

export interface ITournament extends Document {
  organizer: Types.ObjectId;
  name: string;
  organizerName: string;
  startDate: Date;
  endDate: Date;
  location: string;
  logoUrl?: string;
  ballType: BallType;
  customBallType?: string;
  oversPerMatch: number;
  format: TournamentFormat;
  squadMode: TournamentSquadMode;
  status: TournamentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentSchema = new Schema<ITournament>(
  {
    organizer: {
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
    organizerName: {
      type: String,
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    ballType: {
      type: String,
      enum: BALL_TYPES,
      required: true,
    },
    customBallType: {
      type: String,
      trim: true,
    },
    oversPerMatch: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    format: {
      type: String,
      enum: TOURNAMENT_FORMATS,
      required: true,
    },
    squadMode: {
      type: String,
      enum: TOURNAMENT_SQUAD_MODES,
      default: "teams_only",
    },
    status: {
      type: String,
      enum: TOURNAMENT_STATUSES,
      default: "draft",
    },
  },
  {
    timestamps: true,
  },
);

tournamentSchema.index({ organizer: 1, createdAt: -1 });

export const Tournament = model<ITournament>("Tournament", tournamentSchema);
