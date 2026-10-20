// @vitest-environment node
import { expect, test } from "vitest";
import sharp from "sharp";
import { renderPostcard, EXPORT_DPI, EXPORT_SIZE } from "@/lib/print/export";
import { AMAZINGMAIL_9X6_LAYOUT as layout } from "@/lib/print/amazingmail-layout";
const solid = (color: string, width = 900, height = 900) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
test("front/back exports preserve every paid square, both house regions and a blank postal region", async () => {
  const red = await solid("red"); const blue = await solid("blue", 1200, 500); const green = await solid("green", 1200, 500);
  for (const side of ["front", "back"] as const) {
    const png = await renderPostcard(side, layout.paidSlots.filter(s => s.side === side).map(s => ({ label: s.label, input: red, crop: { x: 0, y: 0, width: 900, height: 900 } })), side === "back" ? [blue, green] : []);
    const meta = await sharp(png).metadata(); expect(meta).toMatchObject({ ...EXPORT_SIZE, density: EXPORT_DPI, format: "png" });
    const pixel = async (x: number, y: number) => [...await sharp(png).extract({ left: Math.floor(x*EXPORT_DPI), top: Math.floor(y*EXPORT_DPI), width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
    for (const s of layout.paidSlots.filter(s => s.side === side)) {
      expect(s.width*EXPORT_DPI).toBe(2000); expect(s.height*EXPORT_DPI).toBe(2000);
      expect(await pixel(s.x + 1.25, s.y + 1.25)).toEqual([255,0,0]);
      expect(await pixel(s.x + 2.5 - 1/EXPORT_DPI, s.y + 1.25)).toEqual([255,0,0]);
    }
    if (side === "back") {
      expect(await pixel(5.195, 4)).toEqual([255,255,255]);
      const postalCrop = await sharp(png).extract({ left: layout.postal.x*EXPORT_DPI, top: layout.postal.y*EXPORT_DPI, width: layout.postal.width*EXPORT_DPI, height: layout.postal.height*EXPORT_DPI }).toBuffer();
      const postal = await sharp(postalCrop).stats();
      expect(postal.channels.slice(0,3).every(c => c.min === 255 && c.max === 255)).toBe(true);
      expect(await pixel(6,0.8)).toEqual([0,0,255]); expect(await pixel(6,2.1)).toEqual([0,128,0]);
    }
  }
}, 30000);
test("exports reject missing positions, low-resolution squares and missing house ads", async () => {
  await expect(renderPostcard("front", [])).rejects.toThrow("Every paid position");
  const image = await solid("red");
  const ads = layout.paidSlots.filter(s => s.side === "front").map(s => ({ label: s.label, input: image, crop: { x: 0, y: 0, width: 500, height: 500 } }));
  await expect(renderPostcard("front", ads)).rejects.toThrow("750 × 750");
  await expect(renderPostcard("back", layout.paidSlots.filter(s => s.side === "back").map(s => ({ label: s.label, input: image, crop: { x: 0, y: 0, width: 900, height: 900 } })))).rejects.toThrow("both house");
});
