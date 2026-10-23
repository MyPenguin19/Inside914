import sharp, { type OverlayOptions } from "sharp";
import { MAX_IMAGE_PIXELS, sniffImageType } from "@/lib/artwork/rules";
import { AMAZINGMAIL_9X6_LAYOUT, type PrintRectangle } from "./amazingmail-layout";

import { acceptsCrop, PRINT_DPI, POSTCARD_LAYOUT_V2, POSTCARD_LAYOUTS, type PostcardLayout } from "./layouts";
import { containImage, PRINT_BACKGROUND } from "./image-fit";
import { placeholderSvg } from "./placeholder";

export const EXPORT_DPI = PRINT_DPI;
export const EXPORT_SIZE = { width: Math.round(POSTCARD_LAYOUT_V2.file.width * EXPORT_DPI), height: Math.round(POSTCARD_LAYOUT_V2.file.height * EXPORT_DPI) };
export type PrintImage = { label: string; input: Buffer; crop: PrintRectangle };

export const POSTCARD_BACKGROUND = PRINT_BACKGROUND;
export const HOUSE_OUTPUT = { width: 2990, height: 2086 }; // archived V1
export const houseOutput = (layout: PostcardLayout) => ({ width: Math.round(layout.housePanel.width * EXPORT_DPI), height: Math.round(layout.housePanel.height * EXPORT_DPI) });

// Decode as well as inspect metadata: truncated/corrupt images are not production-ready.
export async function validHouseArtwork(input?: Buffer): Promise<Buffer | undefined> {
  if (!input) return undefined;
  try {
    const image = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" });
    const meta = await image.metadata();
    if (!POSTCARD_LAYOUTS.some(l => { const size = houseOutput(l); return meta.width === size.width && meta.height === size.height; }) ||
        (meta.pages ?? 1) !== 1 || (meta.orientation ?? 1) !== 1) return undefined;
    await image.raw().toBuffer();
    return input;
  } catch { return undefined; }
}

export async function normalizeHouse(input: Buffer, crop: PrintRectangle, layout: PostcardLayout = AMAZINGMAIL_9X6_LAYOUT) {
  const output = houseOutput(layout);
  const minimum = { width: Math.ceil(layout.housePanel.width * 300), height: Math.ceil(layout.housePanel.height * 300) };
  if (!sniffImageType(input.subarray(0,16))) throw new Error("Use a PNG or JPEG image.");
  const oriented = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  if (!crop || ![crop.x,crop.y,crop.width,crop.height].every(Number.isSafeInteger) ||
      crop.x < 0 || crop.y < 0 || crop.width < minimum.width || crop.height < minimum.height ||
      crop.x + crop.width > meta.width || crop.y + crop.height > meta.height ||
      Math.abs(crop.width - crop.height * output.width / output.height) > 2) {
    throw new Error(`Choose a valid house crop of at least ${minimum.width} × ${minimum.height} pixels at the fixed panel ratio.`);
  }
  const normalized = await sharp(oriented).extract({left:crop.x,top:crop.y,width:crop.width,height:crop.height})
    .resize(output.width,output.height,{fit:"cover"}).flatten({background:POSTCARD_BACKGROUND}).png().toBuffer();
  return { input: normalized, ...output };
}

// The same renderer serves previews and downloads. Campaign key, never "latest",
// determines physical placement. No status mutation or payment operation belongs here.
export async function renderPostcard(side: "front" | "back", ads: PrintImage[], house?: Buffer, occupied: string[] = [], layout: PostcardLayout = AMAZINGMAIL_9X6_LAYOUT) {
  const required = layout.paidSlots.filter(s => s.side === side);
  if (new Set(ads.map(a => a.label)).size !== ads.length || ads.some(a => !required.some(s => s.label === a.label))) throw new Error("Invalid or duplicate postcard position.");
  const layers: OverlayOptions[] = [];
  for (const slot of required) {
    const ad = ads.find(a => a.label === slot.label);
    const width = Math.round(slot.width * EXPORT_DPI), height = Math.round(slot.height * EXPORT_DPI);
    let input: Buffer;
    if (!ad) {
      input = placeholderSvg(width, height, slot.label, occupied.includes(slot.label));
    } else {
      const crop = Object.fromEntries(Object.entries(ad.crop).map(([key, n]) => [key, Math.round(n)])) as PrintRectangle;
      if (![crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) || !acceptsCrop(layout.key, crop)) throw new Error(`${slot.label}: save a valid ${layout.key === POSTCARD_LAYOUT_V2.key ? "artwork" : "square"} crop.`);
      const oriented = await sharp(ad.input, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate().toBuffer();
      const meta = await sharp(oriented).metadata();
      if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > meta.width || crop.y + crop.height > meta.height) throw new Error(`${slot.label}: invalid crop.`);
      const extracted = await sharp(oriented).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toBuffer();
      input = await fitToPanel(extracted, crop, { width, height });
    }
    layers.push({ input, left: Math.round(slot.x * EXPORT_DPI), top: Math.round(slot.y * EXPORT_DPI) });
  }
  if (side === "back" && house) {
    const valid = await validHouseArtwork(house);
    if (valid) {
      const meta = await sharp(valid).metadata();
      layers.push({ input: await fitToPanel(valid, meta, houseOutput(layout)), left: Math.round(layout.housePanel.x * EXPORT_DPI), top: Math.round(layout.housePanel.y * EXPORT_DPI) });
    }
  }
  if (side === "back") {
    const postal = layout.postal;
    layers.push({input: await sharp({create:{width:Math.round(postal.width*EXPORT_DPI),height:Math.round(postal.height*EXPORT_DPI),channels:3,background:"white"}}).png().toBuffer(),
      left:Math.round(postal.x*EXPORT_DPI),top:Math.round(postal.y*EXPORT_DPI)});
  }
  return sharp({ create: { ...EXPORT_SIZE, channels: 3, background: POSTCARD_BACKGROUND } }).composite(layers).withMetadata({ density: EXPORT_DPI }).png().toBuffer();
}

async function fitToPanel(input: Buffer, source: {width:number;height:number}, target: {width:number;height:number}) {
  const fit = containImage(source, target);
  const width = Math.max(1, Math.round(fit.width)), height = Math.max(1, Math.round(fit.height));
  // Let Sharp preserve the source ratio even at extreme aspect ratios, where
  // rounding the two destination dimensions independently would stretch a pixel.
  const image = await sharp(input).resize(width, height, { fit: "inside" }).flatten({background:POSTCARD_BACKGROUND}).png().toBuffer({resolveWithObject:true});
  return sharp({create:{...target,channels:3,background:POSTCARD_BACKGROUND}}).composite([{input:image.data,left:Math.floor((target.width-image.info.width)/2),top:Math.floor((target.height-image.info.height)/2)}]).png().toBuffer();
}
