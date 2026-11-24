"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLogoLink = exports.getImage = exports.uploadImage = exports.mediaPath = void 0;
const mongoose_1 = require("mongoose");
const MediaImage_1 = require("../models/MediaImage");
const imageData_1 = require("../utils/imageData");
const blobStorage_1 = require("../utils/blobStorage");
// Keeps one account from filling the database with images.
const MAX_IMAGES_PER_USER = 300;
const mediaPath = (id) => `/api/v1/media/${String(id)}`;
exports.mediaPath = mediaPath;
/**
 * Stores the image (in Vercel Blob when configured, else in MongoDB) and
 * returns the link to use for it, reusing the earlier upload of the same
 * picture by the same user.
 */
const storeImage = async (owner, dataUrl, kind) => {
    const hash = (0, blobStorage_1.hashImageDataUrl)(dataUrl);
    const existing = await MediaImage_1.MediaImage.findOne({ owner, hash }).select("_id url").lean();
    if (existing) {
        if (existing.url || !(0, blobStorage_1.isBlobStorageEnabled)()) {
            return { url: existing.url || (0, exports.mediaPath)(existing._id), created: false };
        }
        // Uploaded before Blob was switched on: move it across now.
        const url = await (0, blobStorage_1.putImageDataUrl)(dataUrl, `team-logos/${String(owner)}`);
        await MediaImage_1.MediaImage.updateOne({ _id: existing._id }, { $set: { url }, $unset: { data: 1 } });
        return { url, created: false };
    }
    if ((await MediaImage_1.MediaImage.countDocuments({ owner })) >= MAX_IMAGES_PER_USER)
        return null;
    if ((0, blobStorage_1.isBlobStorageEnabled)()) {
        const url = await (0, blobStorage_1.putImageDataUrl)(dataUrl, `team-logos/${String(owner)}`);
        await MediaImage_1.MediaImage.create({ owner, hash, kind, url });
        return { url, created: true };
    }
    const image = await MediaImage_1.MediaImage.create({ owner, hash, kind, data: dataUrl });
    return { url: (0, exports.mediaPath)(image._id), created: true };
};
/** POST /media/images  { dataUrl, kind? }  →  { url } */
const uploadImage = async (req, res) => {
    var _a, _b;
    try {
        const dataUrl = (_a = req.body) === null || _a === void 0 ? void 0 : _a.dataUrl;
        const problem = (0, imageData_1.validateImageDataUrl)(dataUrl);
        if (problem) {
            res.status(400).json({ message: problem.replace("Logo", "Image") });
            return;
        }
        const owner = new mongoose_1.Types.ObjectId(req.user.id);
        const kind = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.kind) === "string" ? req.body.kind.slice(0, 20) : "logo";
        let stored;
        try {
            stored = await storeImage(owner, dataUrl, kind);
        }
        catch (error) {
            // Two uploads of the same picture at once: use the one that won.
            if ((error === null || error === void 0 ? void 0 : error.code) !== 11000)
                throw error;
            stored = await storeImage(owner, dataUrl, kind);
        }
        if (!stored) {
            res.status(429).json({ message: "You've uploaded a lot of images. Remove some team logos first." });
            return;
        }
        res.status(stored.created ? 201 : 200).json({ url: stored.url });
    }
    catch (error) {
        console.error("uploadImage failed", error);
        res.status(500).json({ message: "Unable to upload image" });
    }
};
exports.uploadImage = uploadImage;
/** GET /media/:id — public, cacheable forever (an id never changes content). */
const getImage = async (req, res) => {
    var _a;
    try {
        const id = String((_a = req.params.id) !== null && _a !== void 0 ? _a : "");
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            res.status(404).end();
            return;
        }
        const image = await MediaImage_1.MediaImage.findById(id).select("+data url").lean();
        if (!(image === null || image === void 0 ? void 0 : image.data) && (0, blobStorage_1.isBlobUrl)(image === null || image === void 0 ? void 0 : image.url)) {
            // Moved to Vercel Blob: send old links on to the CDN copy.
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.redirect(301, image.url);
            return;
        }
        (0, imageData_1.sendImageDataUrl)(res, image === null || image === void 0 ? void 0 : image.data);
    }
    catch (error) {
        console.error("getImage failed", error);
        res.status(500).end();
    }
};
exports.getImage = getImage;
/**
 * Stores links to our own uploads as API-relative paths, so a team logo keeps
 * working whichever API host the app happened to be using when it was saved.
 */
const normalizeLogoLink = (value) => {
    if (!value)
        return value;
    const at = value.indexOf("/api/v1/media/");
    return at > 0 ? value.slice(at) : value;
};
exports.normalizeLogoLink = normalizeLogoLink;
//# sourceMappingURL=mediaController.js.map