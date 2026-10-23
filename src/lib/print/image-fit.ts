import type { PrintRectangle } from "./amazingmail-layout";

export const PRINT_BACKGROUND = "#f4f2ec";

// Shared by CSS previews and Sharp: the approved source crop is contained, never stretched.
// Rounded output is confined to the destination pixel box; all original bytes remain untouched.
export function containImage(source: { width: number; height: number }, target: { width: number; height: number }): PrintRectangle {
  if (![source.width, source.height, target.width, target.height].every(n => Number.isFinite(n) && n > 0)) {
    throw new RangeError("Image and destination dimensions must be positive.");
  }
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height };
}

export function containedPpi(source: { width: number; height: number }, target: { width: number; height: number }) {
  const fit = containImage(source, target);
  return Math.floor(Math.min(source.width / fit.width, source.height / fit.height) + 1e-8);
}
