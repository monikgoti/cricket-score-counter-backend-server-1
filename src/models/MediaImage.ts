import { Schema, model, type Document, type Types } from "mongoose";

/**
 * A small uploaded image (team logos). With Vercel Blob configured the file
 * lives there and `url` is its CDN link; otherwise `data` holds the image and
 * it's served at /api/v1/media/:id. Either way this record keeps the
 * per-user count and stops the same picture being stored twice.
 */
export interface IMediaImage extends Document {
  owner: Types.ObjectId;
  kind: string;
  data?: string;
  url?: string;
  hash: string;
  createdAt: Date;
}

const mediaImageSchema = new Schema<IMediaImage>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, default: "logo", trim: true },
    data: { type: String, select: false },
    url: { type: String, trim: true },
    hash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// The same picture uploaded twice by the same user is stored once.
mediaImageSchema.index({ owner: 1, hash: 1 }, { unique: true });

export const MediaImage = model<IMediaImage>("MediaImage", mediaImageSchema);
