import { Schema, model, type Document } from "mongoose";

export interface IOtpVerification extends Document {
  phoneNumber: string;
  otpHash: string;
  /** When MongoDB deletes the doc (TTL). Outlives the code so the hourly
   *  send limit keeps applying. */
  expiresAt: Date;
  /** When the code stops being accepted (falls back to expiresAt for
   *  records created before this field existed). */
  codeExpiresAt?: Date;
  attempts: number;
  lastSentAt?: Date;
  sendCount?: number;
  sendWindowStartedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const otpVerificationSchema = new Schema<IOtpVerification>(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    codeExpiresAt: { type: Date },
    lastSentAt: { type: Date },
    sendCount: { type: Number, default: 0, min: 0 },
    sendWindowStartedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

export const OtpVerification = model<IOtpVerification>(
  "OtpVerification",
  otpVerificationSchema,
);
