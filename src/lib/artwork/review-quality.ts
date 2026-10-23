import { containImage, containedPpi } from "@/lib/print/image-fit";
import { isCropInside, type CropPixels } from "./rules";

export type ReviewResolution = "PASS" | "REVIEW" | "FAIL";

// Advisory only: this assessment never approves content or changes print/payment readiness.
export function reviewResolution(ppi: number): ReviewResolution {
  return ppi >= 300 ? "PASS" : ppi >= 200 ? "REVIEW" : "FAIL";
}

export function assessArtworkQuality(
  source: { width: number; height: number },
  crop: CropPixels | null,
  panel: { width: number; height: number },
) {
  if (!crop || ![source.width, source.height, panel.width, panel.height, crop.width, crop.height].every(n => Number.isFinite(n) && n > 0) ||
      ![crop.x, crop.y].every(Number.isFinite) || !isCropInside(crop, source)) return null;
  // Match renderPostcard: extraction rounds saved crop pixels before containing them.
  const pixels = { width: Math.round(crop.width), height: Math.round(crop.height) };
  if (!pixels.width || !pixels.height || Math.round(crop.x) + pixels.width > source.width ||
      Math.round(crop.y) + pixels.height > source.height) return null;
  const fit = containImage(pixels, panel);
  const ppi = containedPpi(pixels, panel);
  return {
    ppi,
    status: reviewResolution(ppi),
    printed: { width: fit.width, height: fit.height },
    minimumPixels: { width: Math.ceil(fit.width * 300 - 1e-8), height: Math.ceil(fit.height * 300 - 1e-8) },
  };
}
