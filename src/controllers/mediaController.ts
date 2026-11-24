import type { Request, Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { MediaImage } from "../models/MediaImage";
import { sendImageDataUrl, validateImageDataUrl } from "../utils/imageData";
import { hashImageDataUrl, isBlobStorageEnabled, isBlobUrl, putImageDataUrl } from "../utils/blobStorage";

// Keeps one account from filling the database with images.
const MAX_IMAGES_PER_USER = 300;

export const mediaPath = (id: unknown) => `/api/v1/media/${String(id)}`;

/**
 * Stores the image (in Vercel Blob when configured, else in MongoDB) and
 * returns the link to use for it, reusing the earlier upload of the same
 * picture by the same user.
 */
const storeImage = async (owner: Types.ObjectId, dataUrl: string, kind: string): Promise<{ url: string; created: boolean } | null> => {
  const hash = hashImageDataUrl(dataUrl);
  const existing = await MediaImage.findOne({ owner, hash }).select("_id url").lean();
  if (existing) {
    if (existing.url || !isBlobStorageEnabled()) {
      return { url: existing.url || mediaPath(existing._id), created: false };
    }
    // Uploaded before Blob was switched on: move it across now.
    const url = await putImageDataUrl(dataUrl, `team-logos/${String(owner)}`);
    await MediaImage.updateOne({ _id: existing._id }, { $set: { url }, $unset: { data: 1 } });
    return { url, created: false };
  }
  if ((await MediaImage.countDocuments({ owner })) >= MAX_IMAGES_PER_USER) return null;
  if (isBlobStorageEnabled()) {
    const url = await putImageDataUrl(dataUrl, `team-logos/${String(owner)}`);
    await MediaImage.create({ owner, hash, kind, url });
    return { url, created: true };
  }
  const image = await MediaImage.create({ owner, hash, kind, data: dataUrl });
  return { url: mediaPath(image._id), created: true };
};

/** POST /media/images  { dataUrl, kind? }  →  { url } */
export const uploadImage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dataUrl = req.body?.dataUrl;
    const problem = validateImageDataUrl(dataUrl);
    if (problem) {
      res.status(400).json({ message: problem.replace("Logo", "Image") });
      return;
    }
    const owner = new Types.ObjectId(req.user!.id);
    const kind = typeof req.body?.kind === "string" ? req.body.kind.slice(0, 20) : "logo";
    let stored: Awaited<ReturnType<typeof storeImage>>;
    try {
      stored = await storeImage(owner, dataUrl, kind);
    } catch (error: any) {
      // Two uploads of the same picture at once: use the one that won.
      if (error?.code !== 11000) throw error;
      stored = await storeImage(owner, dataUrl, kind);
    }
    if (!stored) {
      res.status(429).json({ message: "You've uploaded a lot of images. Remove some team logos first." });
      return;
    }
    res.status(stored.created ? 201 : 200).json({ url: stored.url });
  } catch (error) {
    console.error("uploadImage failed", error);
    res.status(500).json({ message: "Unable to upload image" });
  }
};

/** GET /media/:id — public, cacheable forever (an id never changes content). */
export const getImage = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    if (!Types.ObjectId.isValid(id)) {
      res.status(404).end();
      return;
    }
    const image = await MediaImage.findById(id).select("+data url").lean();
    if (!image?.data && isBlobUrl(image?.url)) {
      // Moved to Vercel Blob: send old links on to the CDN copy.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.redirect(301, image.url);
      return;
    }
    sendImageDataUrl(res, image?.data);
  } catch (error) {
    console.error("getImage failed", error);
    res.status(500).end();
  }
};

/**
 * Stores links to our own uploads as API-relative paths, so a team logo keeps
 * working whichever API host the app happened to be using when it was saved.
 */
export const normalizeLogoLink = (value: string | undefined): string | undefined => {
  if (!value) return value;
  const at = value.indexOf("/api/v1/media/");
  return at > 0 ? value.slice(at) : value;
};
