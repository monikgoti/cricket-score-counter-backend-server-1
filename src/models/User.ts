import { Schema, model, type Document } from "mongoose";

export const AUTH_PROVIDERS = ["password", "google", "mobile", "apple"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface IUser extends Document {
  name: string;
  email?: string;
  password?: string;
  googleId?: string;
  /** Sign in with Apple user ID (the identity token's `sub`). */
  appleId?: string;
  /** Apple refresh token, kept only so it can be revoked on account
   *  deletion (App Store Guideline 5.1.1(v)). */
  appleRefreshToken?: string;
  phoneNumber?: string;
  phoneVerifiedAt?: Date;
  /** false only for email/password signups that haven't entered their
   *  email code yet. Missing (accounts created before verification
   *  existed) counts as verified, so nobody gets locked out. */
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
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
    appleId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
    appleRefreshToken: {
      type: String,
      select: false,
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
    emailVerified: {
      type: Boolean,
    },
    emailVerifiedAt: {
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
