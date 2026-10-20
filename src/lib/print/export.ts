import sharp, { type OverlayOptions } from "sharp";
import { sniffImageType } from "@/lib/artwork/rules";
import { AMAZINGMAIL_9X6_LAYOUT as layout, type PrintRectangle } from "./amazingmail-layout";

// 800 dpi maps every existing layout coordinate to an integer pixel without resizing squares.
export const EXPORT_DPI = 800;
export const EXPORT_SIZE = { width: 7300, height: 4900 };
export type PrintImage = { label: string; input: Buffer; crop: PrintRectangle };
export async function renderPostcard(side: "front" | "back", ads: PrintImage[], houses: Buffer[] = []) {
  const required = layout.paidSlots.filter(s => s.side === side);
  if (ads.length !== required.length || new Set(ads.map(a => a.label)).size !== required.length || required.some(s => !ads.some(a => a.label === s.label))) throw new Error("Every paid position needs approved artwork.");
  if (side === "back" && houses.length !== 2) throw new Error("Add both house advertisements for the back.");
  const layers: OverlayOptions[] = [];
  for (const slot of required) {
    const ad = ads.find(a => a.label === slot.label)!;
    const { crop } = ad;
    if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width < 750 || crop.height < 750 || Math.abs(crop.width - crop.height) > 1) throw new Error(`${slot.label}: the approved crop needs at least 750 × 750 pixels (300 dpi).`);
    const oriented = await sharp(ad.input, { limitInputPixels: 40_000_000 }).rotate().toBuffer();
    const meta = await sharp(oriented).metadata();
    if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > meta.width || crop.y + crop.height > meta.height) throw new Error(`${slot.label}: invalid approved crop.`);
    const input = await sharp(oriented).extract({ left: Math.round(crop.x), top: Math.round(crop.y), width: Math.round(crop.width), height: Math.round(crop.height) }).resize(2000, 2000).png().toBuffer();
    layers.push({ input, left: Math.round(slot.x * EXPORT_DPI), top: Math.round(slot.y * EXPORT_DPI) });
  }
  if (side === "back") {
    for (const [index, region] of layout.houseRegions.entries()) {
      if (!sniffImageType(houses[index].subarray(0,16))) throw new Error(`${region.id}: use a PNG or JPEG file.`);
      const source = sharp(houses[index], { limitInputPixels: 40_000_000 }).rotate();
      const normalized = await source.toBuffer();
      const meta = await sharp(normalized).metadata();
      // Fit without cropping: preserve the complete house advertisement.
      const effectiveDpi = Math.max(meta.width / region.width, meta.height / region.height);
      if (effectiveDpi < 300) throw new Error(`${region.id}: upload higher-resolution house artwork (at least 300 dpi at printed size).`);
      const input = await sharp(normalized).resize(Math.round(region.width * EXPORT_DPI), Math.round(region.height * EXPORT_DPI), { fit: "contain", background: "white" }).png().toBuffer();
      layers.push({ input, left: Math.round(region.x * EXPORT_DPI), top: Math.round(region.y * EXPORT_DPI) });
    }
  }
  return sharp({ create: { ...EXPORT_SIZE, channels: 3, background: "white" } }).composite(layers).withMetadata({ density: EXPORT_DPI }).png().toBuffer();
}
