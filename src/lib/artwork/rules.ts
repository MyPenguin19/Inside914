// Artwork rules shared by the browser (fast feedback) and the server (the real check).
import { PRINT_SPEC } from "@/lib/print/spec";

export type ArtworkType = "image/jpeg" | "image/png";

// Must match the `artwork` bucket's file_size_limit (migration artwork_storage_and_hold_extension).
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MIN_IMAGE_PIXELS = 300; // shortest side; anything smaller can't fill a position

export type UploadProblem = "empty" | "too_large" | "unsupported_type";

// Identify JPEG/PNG from the file's first bytes. Names and browser MIME types are never trusted.
export function sniffImageType(head: Uint8Array): ArtworkType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= png.length && png.every((byte, i) => head[i] === byte)) return "image/png";
  return null;
}

export function checkUpload(size: number, head: Uint8Array): { ok: true; type: ArtworkType } | { ok: false; problem: UploadProblem } {
  if (size <= 0) return { ok: false, problem: "empty" };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, problem: "too_large" };
  const type = sniffImageType(head);
  return type ? { ok: true, type } : { ok: false, problem: "unsupported_type" };
}

export function formatMegabytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export type SlotGeometry = { side: "front" | "back"; x: number; y: number; width: number; height: number };

// Bounds on one physical side; never union coordinates across front and back.
export function adArea(slots: SlotGeometry[]): SlotGeometry {
  slots = slots.filter(s => s.side === slots[0].side);
  const left = Math.min(...slots.map((s) => s.x));
  const top = Math.min(...slots.map((s) => s.y));
  const right = Math.max(...slots.map((s) => s.x + s.width));
  const bottom = Math.max(...slots.map((s) => s.y + s.height));
  return { side: slots[0].side, x: left, y: top, width: right - left, height: bottom - top };
}

export type CropPixels = { x: number; y: number; width: number; height: number };

// Pixels per inch the chosen crop will have once printed at the ad's size.
export function effectivePpi(crop: Pick<CropPixels, "width" | "height">, area: Pick<SlotGeometry, "width" | "height">) {
  return Math.floor(Math.min(crop.width / area.width, crop.height / area.height));
}

export type ResolutionLevel = "good" | "low" | "poor";

export function resolutionLevel(ppi: number): ResolutionLevel {
  if (ppi >= PRINT_SPEC.recommendedPpi) return "good";
  return ppi >= PRINT_SPEC.minimumPpi ? "low" : "poor";
}

// Is a crop rectangle inside the image (allowing a pixel of rounding)?
export function isCropInside(crop: CropPixels, image: { width: number; height: number }) {
  return (
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= image.width + 1 &&
    crop.y + crop.height <= image.height + 1
  );
}

export function adAreas(slots: SlotGeometry[]): SlotGeometry[] {
  return (["front", "back"] as const).flatMap(side => {
    const own = slots.filter(s => s.side === side);
    return own.length ? [adArea(own)] : [];
  });
}
