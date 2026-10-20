import sharp, { type OverlayOptions } from "sharp";
import { sniffImageType } from "@/lib/artwork/rules";
import { AMAZINGMAIL_9X6_LAYOUT as layout, type PrintRectangle } from "./amazingmail-layout";

export const EXPORT_DPI = 800;
export const EXPORT_SIZE = { width: 7300, height: 4900 };
export type PrintImage = { label: string; input: Buffer; crop: PrintRectangle };

export async function normalizeHouse(input: Buffer) {
  if (!sniffImageType(input.subarray(0,16))) throw new Error("Use a PNG or JPEG image.");
  const normalized = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer();
  const meta = await sharp(normalized).metadata();
  const region = layout.housePanel;
  if (meta.width < Math.ceil(region.width * 300) || meta.height < Math.ceil(region.height * 300)) throw new Error("House artwork needs at least 1122 × 783 pixels. Recommended: 2990 × 2086 pixels.");
  return { input: normalized, width: meta.width, height: meta.height };
}

// The same renderer serves current-state previews and mail-ready downloads.
// No status mutation or payment operation belongs here.
export async function renderPostcard(side: "front" | "back", ads: PrintImage[], house?: Buffer, occupied: string[] = []) {
  const required = layout.paidSlots.filter(s => s.side === side);
  if (new Set(ads.map(a => a.label)).size !== ads.length || ads.some(a => !required.some(s => s.label === a.label))) throw new Error("Invalid or duplicate postcard position.");
  const layers: OverlayOptions[] = [];
  for (const slot of required) {
    const ad = ads.find(a => a.label === slot.label);
    let input: Buffer;
    if (!ad) {
      const title = occupied.includes(slot.label) ? "ARTWORK PENDING" : "AVAILABLE";
      input = Buffer.from(`<svg width="2000" height="2000" xmlns="http://www.w3.org/2000/svg"><rect width="2000" height="2000" fill="#f5f5f5"/><rect x="2" y="2" width="1996" height="1996" fill="none" stroke="#ddd" stroke-width="4"/><g fill="#555" text-anchor="middle" font-family="sans-serif"><text x="1000" y="850" font-size="100">${title}</text><text x="1000" y="1020" font-size="75">Inside914</text><text x="1000" y="1170" font-size="60">${occupied.includes(slot.label) ? "Reserved space" : "Reserve this space"}</text></g></svg>`);
    } else {
      const { crop } = ad;
      if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width < 1 || crop.height < 1 || Math.abs(crop.width - crop.height) > 1) throw new Error(`${slot.label}: save a valid square crop.`);
      const oriented = await sharp(ad.input, { limitInputPixels: 40_000_000 }).rotate().toBuffer();
      const meta = await sharp(oriented).metadata();
      if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > meta.width || crop.y + crop.height > meta.height) throw new Error(`${slot.label}: invalid crop.`);
      input = await sharp(oriented).extract({ left: Math.round(crop.x), top: Math.round(crop.y), width: Math.round(crop.width), height: Math.round(crop.height) }).resize(2000, 2000).png().toBuffer();
    }
    layers.push({ input, left: Math.round(slot.x * EXPORT_DPI), top: Math.round(slot.y * EXPORT_DPI) });
  }
  if (side === "back" && house) {
    const region = layout.housePanel;
    const source = await normalizeHouse(house);
    const input = await sharp(source.input).resize(Math.round(region.width * EXPORT_DPI), Math.round(region.height * EXPORT_DPI), { fit: "contain", background: "white" }).png().toBuffer();
    layers.push({ input, left: Math.round(region.x * EXPORT_DPI), top: Math.round(region.y * EXPORT_DPI) });
  }
  return sharp({ create: { ...EXPORT_SIZE, channels: 3, background: "white" } }).composite(layers).withMetadata({ density: EXPORT_DPI }).png().toBuffer();
}
