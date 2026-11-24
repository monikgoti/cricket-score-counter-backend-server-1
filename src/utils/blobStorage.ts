import { createHash } from "crypto";
import { del, put } from "@vercel/blob";

/**
 * Image storage on Vercel Blob.
 *
 * Turned on by setting BLOB_READ_WRITE_TOKEN (from the Blob store in the
 * Vercel dashboard). Without it, uploads keep being stored in MongoDB, which
 * is handy for local development.
 */
export const isBlobStorageEnabled = (): boolean => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** sha1 of the image, used to store the same picture only once. */
export const hashImageDataUrl = (dataUrl: string): string =>
  createHash("sha1").update(dataUrl).digest("hex");

/**
 * Uploads a validated data: URL image and returns its public CDN link.
 * `folder` is e.g. "team-logos/<userId>" or "tournament-logos/<tournamentId>".
 * The file name is the image hash, so re-uploading the same picture reuses
 * the same link.
 */
export const putImageDataUrl = async (dataUrl: string, folder: string): Promise<string> => {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) throw new Error("Not an image data URL");
  const contentType = match[1];
  const ext = EXTENSIONS[contentType] ?? "img";
  const pathname = `${folder}/${hashImageDataUrl(dataUrl)}.${ext}`;
  const blob = await put(pathname, Buffer.from(match[2], "base64"), {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    // The name is the content hash, so the file at a link never changes.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
};

/** True for links that point at our Vercel Blob store. */
export const isBlobUrl = (value: string | undefined | null): value is string =>
  Boolean(value && /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(value));

/** Deletes a blob we own. Never throws: a leftover file is not worth failing a request. */
export const deleteBlobQuietly = async (url: string | undefined | null): Promise<void> => {
  if (!isBlobStorageEnabled() || !isBlobUrl(url)) return;
  try {
    await del(url);
  } catch (error) {
    console.warn("Blob delete failed", url, error);
  }
};
