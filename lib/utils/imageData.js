"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendImageDataUrl = exports.validateImageDataUrl = exports.MAX_IMAGE_DATA_CHARS = void 0;
/** ~290 KB image. The app resizes logos to at most 512px before uploading. */
exports.MAX_IMAGE_DATA_CHARS = 400000;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** Returns an error message for an invalid uploaded image, or "" if it's fine. */
const validateImageDataUrl = (value, maxChars = exports.MAX_IMAGE_DATA_CHARS) => {
    if (typeof value !== "string" || !IMAGE_DATA_URL.test(value)) {
        return "Logo must be a PNG, JPG or WebP image.";
    }
    if (value.length > maxChars) {
        return `Logo is too large. Please use an image under ${Math.round((maxChars * 0.75) / 1024)} KB.`;
    }
    return "";
};
exports.validateImageDataUrl = validateImageDataUrl;
/** Sends a stored data: URL as an image response, cacheable forever (URLs are versioned). */
const sendImageDataUrl = (res, dataUrl) => {
    const match = dataUrl === null || dataUrl === void 0 ? void 0 : dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!match) {
        res.status(404).end();
        return;
    }
    res.setHeader("Content-Type", match[1]);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(Buffer.from(match[2], "base64"));
};
exports.sendImageDataUrl = sendImageDataUrl;
//# sourceMappingURL=imageData.js.map