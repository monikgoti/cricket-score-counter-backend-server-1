import { Schema, model, type Document, type Types } from "mongoose";

export const TOURNAMENT_MATCH_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
] as const;

export type TournamentMatchStatus = (typeof TOURNAMENT_MATCH_STATUSES)[number];
export type TossDecision = "bat" | "bowl";

export interface ITournamentMatch extends Document {
  tournament: Types.ObjectId;
  organizer: Types.ObjectId;
  team1: Types.ObjectId;
  team2: Types.ObjectId;
  pairKey: string;
  status: TournamentMatchStatus;
  tossWinnerTeam?: Types.ObjectId;
  tossDecision?: TossDecision;
  battingFirstTeam?: Types.ObjectId;
  winnerTeam?: Types.ObjectId;
  resultText?: string;
  scorerMatchId?: string;
  snapshot?: unknown;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentMatchSchema = new Schema<ITournamentMatch>(
  {
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    organizer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    team1: {
      type: Schema.Types.ObjectId,
      ref: "TournamentTeam",
      required: true,
    },
    team2: {
      type: Schema.Types.ObjectId,
      ref: "TournamentTeam",
      required: true,
    },
    pairKey: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: TOURNAMENT_MATCH_STATUSES,
      default: "scheduled",
    },
    tossWinnerTeam: {
      type: Schema.Types.ObjectId,
      ref: "TournamentTeam",
    },
    tossDecision: {
      type: String,
      enum: ["bat", "bowl"],
    },
    battingFirstTeam: {
      type: Schema.Types.ObjectId,
      ref: "TournamentTeam",
    },
    winnerTeam: {
      type: Schema.Types.ObjectId,
      ref: "TournamentTeam",
    },
    resultText: {
      type: String,
      trim: true,
    },
    scorerMatchId: {
      type: String,
      trim: true,
    },
    snapshot: {
      type: Schema.Types.Mixed,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

tournamentMatchSchema.index({ tournament: 1, pairKey: 1, status: 1 });
tournamentMatchSchema.index({ tournament: 1, createdAt: -1 });

export const TournamentMatch = model<ITournamentMatch>(
  "TournamentMatch",
  tournamentMatchSchema,
);
