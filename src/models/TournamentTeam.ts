import { Schema, model, type Document, type Types } from "mongoose";

export interface ITournamentPlayer {
  _id?: Types.ObjectId;
  playerId?: Types.ObjectId;
  username?: string;
  name: string;
  role?: string;
  contactNumber?: string;
  statistics?: ITournamentPlayerStatistics;
}

export interface ITournamentPlayerStatistics {
  matchesPlayed: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  wickets: number;
  ballsBowled: number;
  runsConceded: number;
}

export interface ITeamStatistics {
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  noResults: number;
  points: number;
  runsFor: number;
  runsAgainst: number;
  wicketsTaken: number;
  wicketsLost: number;
  ballsFaced: number;
  ballsBowled: number;
  netRunRate: number;
}

export interface ITournamentTeam extends Document {
  tournament: Types.ObjectId;
  organizer: Types.ObjectId;
  sourceTeamId?: Types.ObjectId;
  name: string;
  logoUrl?: string;
  captainName: string;
  contactNumber: string;
  players: ITournamentPlayer[];
  statistics: ITeamStatistics;
  createdAt: Date;
  updatedAt: Date;
}

const playerSchema = new Schema<ITournamentPlayer>(
  {
    playerId: {
      type: Schema.Types.ObjectId,
      ref: "PlayerIdentity",
      index: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    statistics: {
      matchesPlayed: { type: Number, default: 0, min: 0 },
      runs: { type: Number, default: 0, min: 0 },
      ballsFaced: { type: Number, default: 0, min: 0 },
      fours: { type: Number, default: 0, min: 0 },
      sixes: { type: Number, default: 0, min: 0 },
      wickets: { type: Number, default: 0, min: 0 },
      ballsBowled: { type: Number, default: 0, min: 0 },
      runsConceded: { type: Number, default: 0, min: 0 },
    },
  },
  {
    _id: true,
  },
);

const statisticsSchema = new Schema<ITeamStatistics>(
  {
    matchesPlayed: { type: Number, default: 0, min: 0 },
    wins: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    ties: { type: Number, default: 0, min: 0 },
    noResults: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0 },
    runsFor: { type: Number, default: 0, min: 0 },
    runsAgainst: { type: Number, default: 0, min: 0 },
    wicketsTaken: { type: Number, default: 0, min: 0 },
    wicketsLost: { type: Number, default: 0, min: 0 },
    ballsFaced: { type: Number, default: 0, min: 0 },
    ballsBowled: { type: Number, default: 0, min: 0 },
    netRunRate: { type: Number, default: 0 },
  },
  {
    _id: false,
  },
);

const tournamentTeamSchema = new Schema<ITournamentTeam>(
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
    sourceTeamId: {
      type: Schema.Types.ObjectId,
      ref: "SavedPlayerTeam",
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
      required: true,
      trim: true,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    players: {
      type: [playerSchema],
      default: [],
    },
    statistics: {
      type: statisticsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

tournamentTeamSchema.index(
  { tournament: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

export const TournamentTeam = model<ITournamentTeam>(
  "TournamentTeam",
  tournamentTeamSchema,
);
