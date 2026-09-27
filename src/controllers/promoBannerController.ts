import type { Request, Response } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { PromoBanner, type IPromoBanner } from "../models/PromoBanner";

const DEFAULT_SLOT = "home";

const resolveSlot = (raw: unknown): string => {
  const slot = typeof raw === "string" ? raw.trim() : "";
  return slot || DEFAULT_SLOT;
};

const toPublicBanner = (banner: IPromoBanner) => ({
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

const bySortOrder = { order: 1 as const, createdAt: 1 as const };

// GET /api/v1/promo-banner/:slot -- public, no auth required. Returns every
// visible banner for the slot, ordered for display. No banners configured
// (or none currently visible) is not an error -- it's just an empty list,
// matching the frontend's fail-safe handling so the Home page is never
// blocked on this being set up.
export const listBanners = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const slot = resolveSlot(req.params.slot);
    const banners = await PromoBanner.find({ slot, show: true }).sort(
      bySortOrder,
    );
    res.status(200).json({ banners: banners.map(toPublicBanner) });
  } catch (error) {
    console.error("Failed to fetch promo banners", error);
    res.status(500).json({ message: "Failed to fetch promo banners" });
  }
};

// GET /api/v1/promo-banner/:slot/admin -- admin only. Same as above but
// includes hidden banners too, so the admin UI can list and edit
// everything, not just what's currently live.
export const listBannersAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const slot = resolveSlot(req.params.slot);
    const banners = await PromoBanner.find({ slot }).sort(bySortOrder);
    res.status(200).json({ banners: banners.map(toPublicBanner) });
  } catch (error) {
    console.error("Failed to fetch promo banners", error);
    res.status(500).json({ message: "Failed to fetch promo banners" });
  }
};

// A link field may be left empty, may be an absolute http(s) URL (an
// external link, or a CDN-hosted image), or may start with "/" (an
// in-app route for ctaUrl/buttonLink1, or an image served from this app's
// own public folder for imageUrl). Anything else -- a bare string with no
// scheme, a javascript: URL, etc. -- is rejected rather than silently
// stored, since a broken link here is invisible until a real visitor
// clicks it.
const isValidUrlOrPath = (value: string): boolean => {
  if (!value) return true;
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

type FieldSpec =
  | { key: "show" | "openInNewTab"; kind: "boolean" }
  | { key: "order"; kind: "number" }
  | {
      key:
        | "title"
        | "subTitle"
        | "description"
        | "imageUrl"
        | "bannerUrl"
        | "buttonText"
        | "ctaUrl"
        | "buttonText1"
        | "buttonLink1";
      kind: "string";
    };

const FIELD_SPECS: FieldSpec[] = [
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
const validateBannerBody = (
  body: Record<string, unknown>,
  existing?: IPromoBanner | null,
): { errors: string[]; update: Partial<IPromoBanner> } => {
  const errors: string[] = [];
  const update: Partial<IPromoBanner> = {};

  for (const spec of FIELD_SPECS) {
    const raw = body[spec.key];
    if (raw === undefined) continue;

    if (spec.kind === "boolean") {
      if (typeof raw !== "boolean") {
        errors.push(`${spec.key} must be a boolean.`);
        continue;
      }
      update[spec.key] = raw;
    } else if (spec.kind === "number") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        errors.push(`${spec.key} must be a number.`);
        continue;
      }
      update[spec.key] = raw;
    } else {
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

  for (const key of ["ctaUrl", "imageUrl", "bannerUrl", "buttonLink1"] as const) {
    const value = update[key];
    if (value !== undefined && !isValidUrlOrPath(value)) {
      errors.push(
        `${key} must be an absolute http(s) URL or start with '/'.`,
      );
    }
  }

  const nextButtonText1 = update.buttonText1 ?? existing?.buttonText1 ?? "";
  const nextButtonLink1 = update.buttonLink1 ?? existing?.buttonLink1 ?? "";
  if (Boolean(nextButtonText1) !== Boolean(nextButtonLink1)) {
    errors.push(
      "buttonText1 and buttonLink1 must be set together -- provide both, or leave both empty.",
    );
  }

  if (update.show === true) {
    const nextTitle = update.title ?? existing?.title ?? "";
    const nextImage = update.imageUrl ?? existing?.imageUrl ?? "";
    if (!nextTitle && !nextImage) {
      errors.push(
        "Cannot show a banner with no title and no image -- set one of them first.",
      );
    }
  }

  return { errors, update };
};

// POST /api/v1/promo-banner/:slot -- admin only. Creates a new banner in
// the slot. `order` defaults to appending after every banner already in
// this slot when not provided.
export const createBanner = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const slot = resolveSlot(req.params.slot);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const { errors, update } = validateBannerBody(body);
    if (errors.length > 0) {
      res.status(400).json({ message: errors.join(" ") });
      return;
    }

    if (update.order === undefined) {
      const count = await PromoBanner.countDocuments({ slot });
      update.order = count;
    }

    const banner = await PromoBanner.create({
      ...update,
      slot,
      updatedBy: req.user?.email || req.user?.id,
    });

    res.status(201).json({ banner: toPublicBanner(banner) });
  } catch (error) {
    console.error("Failed to create promo banner", error);
    res.status(500).json({ message: "Failed to create promo banner" });
  }
};

// PUT /api/v1/promo-banner/:slot/:id -- admin only. Partial update -- only
// the fields present in the body are changed.
export const updateBanner = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const slot = resolveSlot(req.params.slot);
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      res.status(404).json({ message: "Banner not found" });
      return;
    }

    const existing = await PromoBanner.findOne({ _id: id, slot });
    if (!existing) {
      res.status(404).json({ message: "Banner not found" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const { errors, update } = validateBannerBody(body, existing);
    if (errors.length > 0) {
      res.status(400).json({ message: errors.join(" ") });
      return;
    }

    Object.assign(existing, update, {
      updatedBy: req.user?.email || req.user?.id,
    });
    await existing.save();

    res.status(200).json({ banner: toPublicBanner(existing) });
  } catch (error) {
    console.error("Failed to update promo banner", error);
    res.status(500).json({ message: "Failed to update promo banner" });
  }
};

// DELETE /api/v1/promo-banner/:slot/:id -- admin only.
export const deleteBanner = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const slot = resolveSlot(req.params.slot);
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      res.status(404).json({ message: "Banner not found" });
      return;
    }

    const deleted = await PromoBanner.findOneAndDelete({ _id: id, slot });
    if (!deleted) {
      res.status(404).json({ message: "Banner not found" });
      return;
    }

    res.status(200).json({ message: "Banner deleted" });
  } catch (error) {
    console.error("Failed to delete promo banner", error);
    res.status(500).json({ message: "Failed to delete promo banner" });
  }
};
