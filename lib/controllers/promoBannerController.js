"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBanner = exports.updateBanner = exports.createBanner = exports.listBannersAdmin = exports.listBanners = void 0;
const mongoose_1 = require("mongoose");
const PromoBanner_1 = require("../models/PromoBanner");
const DEFAULT_SLOT = "home";
const resolveSlot = (raw) => {
    const slot = typeof raw === "string" ? raw.trim() : "";
    return slot || DEFAULT_SLOT;
};
const toPublicBanner = (banner) => ({
    id: String(banner._id),
    slot: banner.slot,
    order: banner.order,
    show: banner.show,
    title: banner.title,
    subTitle: banner.subTitle,
    description: banner.description,
    imageUrl: banner.imageUrl,
    bannerUrl: banner.bannerUrl,
    buttonText: banner.buttonText,
    ctaUrl: banner.ctaUrl,
    buttonText1: banner.buttonText1,
    buttonLink1: banner.buttonLink1,
    openInNewTab: banner.openInNewTab,
});
const bySortOrder = { order: 1, createdAt: 1 };
// GET /api/v1/promo-banner/:slot -- public, no auth required. Returns every
// visible banner for the slot, ordered for display. No banners configured
// (or none currently visible) is not an error -- it's just an empty list,
// matching the frontend's fail-safe handling so the Home page is never
// blocked on this being set up.
const listBanners = async (req, res) => {
    try {
        const slot = resolveSlot(req.params.slot);
        const banners = await PromoBanner_1.PromoBanner.find({ slot, show: true }).sort(bySortOrder);
        res.status(200).json({ banners: banners.map(toPublicBanner) });
    }
    catch (error) {
        console.error("Failed to fetch promo banners", error);
        res.status(500).json({ message: "Failed to fetch promo banners" });
    }
};
exports.listBanners = listBanners;
// GET /api/v1/promo-banner/:slot/admin -- admin only. Same as above but
// includes hidden banners too, so the admin UI can list and edit
// everything, not just what's currently live.
const listBannersAdmin = async (req, res) => {
    try {
        const slot = resolveSlot(req.params.slot);
        const banners = await PromoBanner_1.PromoBanner.find({ slot }).sort(bySortOrder);
        res.status(200).json({ banners: banners.map(toPublicBanner) });
    }
    catch (error) {
        console.error("Failed to fetch promo banners", error);
        res.status(500).json({ message: "Failed to fetch promo banners" });
    }
};
exports.listBannersAdmin = listBannersAdmin;
// A link field may be left empty, may be an absolute http(s) URL (an
// external link, or a CDN-hosted image), or may start with "/" (an
// in-app route for ctaUrl/buttonLink1, or an image served from this app's
// own public folder for imageUrl). Anything else -- a bare string with no
// scheme, a javascript: URL, etc. -- is rejected rather than silently
// stored, since a broken link here is invisible until a real visitor
// clicks it.
const isValidUrlOrPath = (value) => {
    if (!value)
        return true;
    if (value.startsWith("/"))
        return true;
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    catch (_a) {
        return false;
    }
};
const FIELD_SPECS = [
    { key: "show", kind: "boolean" },
    { key: "order", kind: "number" },
    { key: "title", kind: "string" },
    { key: "subTitle", kind: "string" },
    { key: "description", kind: "string" },
    { key: "imageUrl", kind: "string" },
    { key: "bannerUrl", kind: "string" },
    { key: "buttonText", kind: "string" },
    { key: "ctaUrl", kind: "string" },
    { key: "buttonText1", kind: "string" },
    { key: "buttonLink1", kind: "string" },
    { key: "openInNewTab", kind: "boolean" },
];
// Parses and type-checks the request body against FIELD_SPECS, then runs
// the cross-field checks that apply regardless of create vs. update:
//  - ctaUrl / imageUrl / buttonLink1 must be a valid URL or in-app path
//  - the optional second button's two fields must be set together (either
//    both present or both empty) -- a lone buttonText1 with no link, or
//    vice versa, is never useful and is almost certainly a mistake
// `existing` (when updating) supplies fallback values for fields not
// present in this request, so the "show requires content" check below
// still sees the full picture.
const validateBannerBody = (body, existing) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const errors = [];
    const update = {};
    for (const spec of FIELD_SPECS) {
        const raw = body[spec.key];
        if (raw === undefined)
            continue;
        if (spec.kind === "boolean") {
            if (typeof raw !== "boolean") {
                errors.push(`${spec.key} must be a boolean.`);
                continue;
            }
            update[spec.key] = raw;
        }
        else if (spec.kind === "number") {
            if (typeof raw !== "number" || !Number.isFinite(raw)) {
                errors.push(`${spec.key} must be a number.`);
                continue;
            }
            update[spec.key] = raw;
        }
        else {
            if (typeof raw !== "string") {
                errors.push(`${spec.key} must be a string.`);
                continue;
            }
            update[spec.key] = raw.trim();
        }
    }
    if (errors.length > 0) {
        return { errors, update };
    }
    for (const key of ["ctaUrl", "imageUrl", "bannerUrl", "buttonLink1"]) {
        const value = update[key];
        if (value !== undefined && !isValidUrlOrPath(value)) {
            errors.push(`${key} must be an absolute http(s) URL or start with '/'.`);
        }
    }
    const nextButtonText1 = (_b = (_a = update.buttonText1) !== null && _a !== void 0 ? _a : existing === null || existing === void 0 ? void 0 : existing.buttonText1) !== null && _b !== void 0 ? _b : "";
    const nextButtonLink1 = (_d = (_c = update.buttonLink1) !== null && _c !== void 0 ? _c : existing === null || existing === void 0 ? void 0 : existing.buttonLink1) !== null && _d !== void 0 ? _d : "";
    if (Boolean(nextButtonText1) !== Boolean(nextButtonLink1)) {
        errors.push("buttonText1 and buttonLink1 must be set together -- provide both, or leave both empty.");
    }
    if (update.show === true) {
        const nextTitle = (_f = (_e = update.title) !== null && _e !== void 0 ? _e : existing === null || existing === void 0 ? void 0 : existing.title) !== null && _f !== void 0 ? _f : "";
        const nextImage = (_h = (_g = update.imageUrl) !== null && _g !== void 0 ? _g : existing === null || existing === void 0 ? void 0 : existing.imageUrl) !== null && _h !== void 0 ? _h : "";
        if (!nextTitle && !nextImage) {
            errors.push("Cannot show a banner with no title and no image -- set one of them first.");
        }
    }
    return { errors, update };
};
// POST /api/v1/promo-banner/:slot -- admin only. Creates a new banner in
// the slot. `order` defaults to appending after every banner already in
// this slot when not provided.
const createBanner = async (req, res) => {
    var _a, _b, _c;
    try {
        const slot = resolveSlot(req.params.slot);
        const body = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
        const { errors, update } = validateBannerBody(body);
        if (errors.length > 0) {
            res.status(400).json({ message: errors.join(" ") });
            return;
        }
        if (update.order === undefined) {
            const count = await PromoBanner_1.PromoBanner.countDocuments({ slot });
            update.order = count;
        }
        const banner = await PromoBanner_1.PromoBanner.create(Object.assign(Object.assign({}, update), { slot, updatedBy: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id) }));
        res.status(201).json({ banner: toPublicBanner(banner) });
    }
    catch (error) {
        console.error("Failed to create promo banner", error);
        res.status(500).json({ message: "Failed to create promo banner" });
    }
};
exports.createBanner = createBanner;
// PUT /api/v1/promo-banner/:slot/:id -- admin only. Partial update -- only
// the fields present in the body are changed.
const updateBanner = async (req, res) => {
    var _a, _b, _c;
    try {
        const slot = resolveSlot(req.params.slot);
        const { id } = req.params;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            res.status(404).json({ message: "Banner not found" });
            return;
        }
        const existing = await PromoBanner_1.PromoBanner.findOne({ _id: id, slot });
        if (!existing) {
            res.status(404).json({ message: "Banner not found" });
            return;
        }
        const body = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
        const { errors, update } = validateBannerBody(body, existing);
        if (errors.length > 0) {
            res.status(400).json({ message: errors.join(" ") });
            return;
        }
        Object.assign(existing, update, {
            updatedBy: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id),
        });
        await existing.save();
        res.status(200).json({ banner: toPublicBanner(existing) });
    }
    catch (error) {
        console.error("Failed to update promo banner", error);
        res.status(500).json({ message: "Failed to update promo banner" });
    }
};
exports.updateBanner = updateBanner;
// DELETE /api/v1/promo-banner/:slot/:id -- admin only.
const deleteBanner = async (req, res) => {
    try {
        const slot = resolveSlot(req.params.slot);
        const { id } = req.params;
        if (!mongoose_1.Types.ObjectId.isValid(id)) {
            res.status(404).json({ message: "Banner not found" });
            return;
        }
        const deleted = await PromoBanner_1.PromoBanner.findOneAndDelete({ _id: id, slot });
        if (!deleted) {
            res.status(404).json({ message: "Banner not found" });
            return;
        }
        res.status(200).json({ message: "Banner deleted" });
    }
    catch (error) {
        console.error("Failed to delete promo banner", error);
        res.status(500).json({ message: "Failed to delete promo banner" });
    }
};
exports.deleteBanner = deleteBanner;
//# sourceMappingURL=promoBannerController.js.map