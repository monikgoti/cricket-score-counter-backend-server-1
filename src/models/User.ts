import { Schema, model, type Document } from "mongoose";

export const AUTH_PROVIDERS = ["password", "google", "mobile"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface IUser extends Document {
  name: string;
  email?: string;
  password?: string;
  googleId?: string;
  phoneNumber?: string;
  phoneVerifiedAt?: Date;
  authProvider: AuthProvider;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
    phoneVerifiedAt: {
      type: Date,
    },
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: "password",
      required: true,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export const User = model<IUser>("User", userSchema);
