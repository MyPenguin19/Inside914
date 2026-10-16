import "server-only";
import sharp from "sharp";
import { checkUpload, MIN_IMAGE_PIXELS, type ArtworkType } from "./rules";

export type ImageCheck =
  | { ok: true; contentType: ArtworkType; width: number; height: number; byteSize: number }
  | { ok: false; reason: "empty" | "too_large" | "unsupported_type" | "corrupt" | "too_small" };

const SHARP_FORMAT: Record<ArtworkType, string> = { "image/jpeg": "jpeg", "image/png": "png" };

// The authoritative check on the stored bytes: real file signature, a full decode (catches
// truncated or disguised files), and the displayed (EXIF-oriented) pixel size.
export async function validateImage(bytes: Buffer): Promise<ImageCheck> {
  const basic = checkUpload(bytes.length, bytes.subarray(0, 16));
  if (!basic.ok) return { ok: false, reason: basic.problem };

  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 });
    const meta = await image.metadata();
    if (meta.format !== SHARP_FORMAT[basic.type]) return { ok: false, reason: "unsupported_type" };
    await image.clone().resize(32, 32, { fit: "inside" }).toBuffer(); // forces a full decode

    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) return { ok: false, reason: "corrupt" };
    if (Math.min(width, height) < MIN_IMAGE_PIXELS) return { ok: false, reason: "too_small" };
    return { ok: true, contentType: basic.type, width, height, byteSize: bytes.length };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}
