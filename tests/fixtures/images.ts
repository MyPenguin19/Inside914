import sharp from "sharp";

// Real image bytes generated on the fly, so tests never depend on binary fixtures.
export async function makeImage(format: "jpeg" | "png" | "gif" | "webp", width = 900, height = 600) {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 30, g: 92, b: 74 } } });
  return base[format]().toBuffer();
}
