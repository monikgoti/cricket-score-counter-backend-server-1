import { Schema, model, type Document } from "mongoose";

// Backs the dynamic advertisement/promo cards the frontend renders on the
// Home page (see PromoBannerCard.tsx / PromoBannerService.ts in the web
// app). Every visual detail an admin can control lives here. Multiple
// banners can exist for the same `slot` -- the public endpoint returns all
// of a slot's visible banners (ordered by `order`) and the frontend
// rotates through them -- so `slot` is a placement, not a unique key.
export interface IPromoBanner extends Document {
  slot: string;
  order: number;
  show: boolean;
  title: string;
  subTitle: string;
  description: string;
  imageUrl: string;
  bannerUrl: string;
  buttonText: string;
  ctaUrl: string;
  // Optional second button, shown alongside the primary one when both its
  // fields are set.
  buttonText1: string;
  buttonLink1: string;
  openInNewTab: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const promoBannerSchema = new Schema<IPromoBanner>(
  {
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
  },
  { timestamps: true },
);

promoBannerSchema.index({ slot: 1, order: 1, createdAt: 1 });

export const PromoBanner = model<IPromoBanner>(
  "PromoBanner",
  promoBannerSchema,
);
