"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoBanner = void 0;
const mongoose_1 = require("mongoose");
const promoBannerSchema = new mongoose_1.Schema({
    slot: {
        type: String,
        required: true,
        trim: true,
    },
    order: {
        type: Number,
        default: 0,
    },
    show: {
        type: Boolean,
        default: false,
    },
    title: {
        type: String,
        default: "",
        trim: true,
    },
    subTitle: {
        type: String,
        default: "",
        trim: true,
    },
    description: {
        type: String,
        default: "",
        trim: true,
    },
    imageUrl: {
        type: String,
        default: "",
        trim: true,
    },
    bannerUrl: {
        type: String,
        default: "",
        trim: true,
    },
    buttonText: {
        type: String,
        default: "",
        trim: true,
    },
    ctaUrl: {
        type: String,
        default: "",
        trim: true,
    },
    buttonText1: {
        type: String,
        default: "",
        trim: true,
    },
    buttonLink1: {
        type: String,
        default: "",
        trim: true,
    },
    openInNewTab: {
        type: Boolean,
        default: true,
    },
    updatedBy: {
        type: String,
    },
}, { timestamps: true });
promoBannerSchema.index({ slot: 1, order: 1, createdAt: 1 });
exports.PromoBanner = (0, mongoose_1.model)("PromoBanner", promoBannerSchema);
//# sourceMappingURL=PromoBanner.js.map