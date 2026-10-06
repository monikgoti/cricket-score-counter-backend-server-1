import { Schema, model, type Document } from "mongoose";

export const EMAIL_OTP_PURPOSES = ["verify_email", "reset_password"] as const;
export type EmailOtpPurpose = (typeof EMAIL_OTP_PURPOSES)[number];

/**
 * One active code per (email, purpose). Codes are stored only as bcrypt
 * hashes and expire automatically through the TTL index on expiresAt.
 */
export interface IEmailOtp extends Document {
  email: string;
  purpose: EmailOtpPurpose;
  otpHash: string;
  /** When the code stops being accepted. */
  codeExpiresAt: Date;
  /** When MongoDB deletes the document (TTL); outlives the code so the
   *  hourly send limit keeps applying. */
  expiresAt: Date;
  attempts: number;
  lastSentAt: Date;
  /** Sends in the current hourly window, to stop email bombing. */
  sendCount: number;
  sendWindowStartedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const emailOtpSchema = new Schema<IEmailOtp>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: EMAIL_OTP_PURPOSES, required: true },
    otpHash: { type: String, required: true, select: false },
    codeExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0, min: 0 },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, default: 0, min: 0 },
    sendWindowStartedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

export const EmailOtp = model<IEmailOtp>("EmailOtp", emailOtpSchema);
