"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBlobQuietly = exports.isBlobUrl = exports.putImageDataUrl = exports.hashImageDataUrl = exports.isBlobStorageEnabled = void 0;
const crypto_1 = require("crypto");
const blob_1 = require("@vercel/blob");
/**
 * Image storage on Vercel Blob.
 *
 * Turned on by setting BLOB_READ_WRITE_TOKEN (from the Blob store in the
 * Vercel dashboard). Without it, uploads keep being stored in MongoDB, which
 * is handy for local development.
 */
const isBlobStorageEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
exports.isBlobStorageEnabled = isBlobStorageEnabled;
const EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
};
/** sha1 of the image, used to store the same picture only once. */
const hashImageDataUrl = (dataUrl) => (0, crypto_1.createHash)("sha1").update(dataUrl).digest("hex");
exports.hashImageDataUrl = hashImageDataUrl;
/**
 * Uploads a validated data: URL image and returns its public CDN link.
 * `folder` is e.g. "team-logos/<userId>" or "tournament-logos/<tournamentId>".
 * The file name is the image hash, so re-uploading the same picture reuses
 * the same link.
 */
const putImageDataUrl = async (dataUrl, folder) => {
    var _a;
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!match)
        throw new Error("Not an image data URL");
    const contentType = match[1];
    const ext = (_a = EXTENSIONS[contentType]) !== null && _a !== void 0 ? _a : "img";
    const pathname = `${folder}/${(0, exports.hashImageDataUrl)(dataUrl)}.${ext}`;
    const blob = await (0, blob_1.put)(pathname, Buffer.from(match[2], "base64"), {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        // The name is the content hash, so the file at a link never changes.
        cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return blob.url;
};
exports.putImageDataUrl = putImageDataUrl;
/** True for links that point at our Vercel Blob store. */
const isBlobUrl = (value) => Boolean(value && /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(value));
exports.isBlobUrl = isBlobUrl;
/** Deletes a blob we own. Never throws: a leftover file is not worth failing a request. */
const deleteBlobQuietly = async (url) => {
    if (!(0, exports.isBlobStorageEnabled)() || !(0, exports.isBlobUrl)(url))
        return;
    try {
        await (0, blob_1.del)(url);
    }
    catch (error) {
        console.warn("Blob delete failed", url, error);
    }
};
exports.deleteBlobQuietly = deleteBlobQuietly;
//# sourceMappingURL=blobStorage.js.map