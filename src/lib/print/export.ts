import sharp, { type OverlayOptions } from "sharp";
import { sniffImageType } from "@/lib/artwork/rules";
import { AMAZINGMAIL_9X6_LAYOUT as layout, type PrintRectangle } from "./amazingmail-layout";

export const EXPORT_DPI = 800;
export const EXPORT_SIZE = { width: 7300, height: 4900 };
export type PrintImage = { label: string; input: Buffer; crop: PrintRectangle };

export const POSTCARD_BACKGROUND = "#f4f2ec";
export const HOUSE_OUTPUT = { width: 2990, height: 2086 };

export async function normalizeHouse(input: Buffer, crop: PrintRectangle) {
  if (!sniffImageType(input.subarray(0,16))) throw new Error("Use a PNG or JPEG image.");
  const oriented = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  if (!crop || ![crop.x,crop.y,crop.width,crop.height].every(Number.isSafeInteger) ||
      crop.x < 0 || crop.y < 0 || crop.width < 1122 || crop.height < 783 ||
      crop.x + crop.width > meta.width || crop.y + crop.height > meta.height ||
      Math.abs(crop.width - crop.height * HOUSE_OUTPUT.width / HOUSE_OUTPUT.height) > 2) {
    throw new Error("Choose a valid house crop of at least 1122 × 783 pixels at the fixed panel ratio.");
  }
  const normalized = await sharp(oriented).extract({left:crop.x,top:crop.y,width:crop.width,height:crop.height})
    .resize(HOUSE_OUTPUT.width,HOUSE_OUTPUT.height,{fit:"cover"}).flatten({background:POSTCARD_BACKGROUND}).png().toBuffer();
  return { input: normalized, ...HOUSE_OUTPUT };
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
    const meta = await sharp(house).metadata();
    if (meta.width !== HOUSE_OUTPUT.width || meta.height !== HOUSE_OUTPUT.height) {
      throw new Error("Re-save the permanent house artwork using the crop editor in Settings before downloading the back.");
    }
    layers.push({ input: house, left: Math.round(region.x * EXPORT_DPI), top: Math.round(region.y * EXPORT_DPI) });
  }
  if (side === "back") {
    const postal = layout.postal;
    layers.push({input: await sharp({create:{width:Math.round(postal.width*EXPORT_DPI),height:Math.round(postal.height*EXPORT_DPI),channels:3,background:"white"}}).png().toBuffer(),
      left:Math.round(postal.x*EXPORT_DPI),top:Math.round(postal.y*EXPORT_DPI)});
  }
  return sharp({ create: { ...EXPORT_SIZE, channels: 3, background: POSTCARD_BACKGROUND } }).composite(layers).withMetadata({ density: EXPORT_DPI }).png().toBuffer();
}
