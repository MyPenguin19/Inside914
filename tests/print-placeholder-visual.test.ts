// @vitest-environment node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, test } from "vitest";
import { placeholderSvg } from "@/lib/print/placeholder";
import { renderPostcard, houseOutput, EXPORT_SIZE } from "@/lib/print/export";
import { POSTCARD_LAYOUTS, layoutVersion } from "@/lib/print/layouts";

const goldens = resolve("tests/fixtures/print-placeholders");
const output = resolve("../../outputs/inside914-print-hotfix");
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");

// These checked-in raster references were visually reviewed, not regenerated in CI.
// Compare actual pixels: successful PNG encoding or output dimensions cannot catch tofu.
async function matchesGolden(input: Buffer, name: string) {
  const actual = await sharp(input).resize({ width: 500 }).removeAlpha().png().toBuffer();
  if (process.env.UPDATE_PRINT_GOLDENS === "1") {
    await mkdir(goldens, { recursive: true });
    await writeFile(resolve(goldens, `${name}.png`), actual);
  }
  const expected = await sharp(await readFile(resolve(goldens, `${name}.png`))).removeAlpha().raw().toBuffer();
  const pixels = await sharp(actual).raw().toBuffer();
  expect(pixels.length).toBe(expected.length);
  // Small platform antialiasing differences are tolerated; missing/changed glyphs aren't.
  let changed = 0;
  for (let i = 0; i < pixels.length; i++) if (Math.abs(pixels[i] - expected[i]) > 16) changed++;
  expect(changed / pixels.length).toBeLessThan(0.0005);
}

test("all supported letters and digits have stable raster outlines, with no font fallback", async () => {
  const svg = placeholderSvg(2000, 1000, "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789", false);
  expect(svg.toString()).not.toMatch(/<text|font-family|<image|href=/);
  await matchesGolden(svg, "alphabet");
  expect(() => placeholderSvg(2000, 2000, "F☃", false)).toThrow("Unsupported print placeholder character");
});

for (const layout of POSTCARD_LAYOUTS) for (const side of ["front", "back"] as const) {
  test.each(["empty", "partial", "full"] as const)(`${layoutVersion(layout.key)} ${side} %s raster preserves labels, artwork, house and postal area`, async state => {
    await mkdir(output, { recursive: true });
    const slots = layout.paidSlots.filter(s => s.side === side);
    // Raster input with distinct quadrants catches stretching, cropping and placement drift.
    const image = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#3461a4" } })
      .composite([{ input: await sharp({ create: { width: 450, height: 450, channels: 3, background: "#e8b243" } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
    const house = await sharp({ create: { ...houseOutput(layout), channels: 3, background: "#42634b" } }).png().toBuffer();
    const original = digest(image);
    const ads = (state === "full" ? slots : state === "partial" ? slots.slice(1, 2) : [])
      .map(s => ({ label: s.label, input: image, crop: { x: 0, y: 0, width: 900, height: 900 } }));
    const png = await renderPostcard(side, ads, house, state === "partial" ? [slots[0].label, slots[1].label] : [], layout);
    expect(digest(image)).toBe(original);
    expect(await sharp(png).metadata()).toMatchObject({ ...EXPORT_SIZE, density: 800, format: "png" });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((Math.round(y * 800) * info.width + Math.round(x * 800)) * 3, (Math.round(y * 800) * info.width + Math.round(x * 800)) * 3 + 3)];
    for (const slot of slots) {
      const hasArt = ads.some(a => a.label === slot.label);
      expect(pixel(slot.x + slot.width * 0.25, slot.y + slot.height * 0.25)).toEqual(hasArt ? [232, 178, 67] : [245, 245, 245]);
      expect(pixel(slot.x + slot.width * 0.75, slot.y + slot.height * 0.75)).toEqual(hasArt ? [52, 97, 164] : [245, 245, 245]);
    }
    if (state !== "full") {
      const s = slots[0];
      const panel = await sharp(png).extract({ left: Math.round(s.x * 800), top: Math.round(s.y * 800), width: Math.round(s.width * 800), height: Math.round(s.height * 800) }).png().toBuffer();
      await matchesGolden(panel, `${layoutVersion(layout.key)}-${side}-${state}`);
    }
    if (side === "back") {
      expect(pixel(layout.housePanel.x + 0.2, layout.housePanel.y + 0.2)).toEqual([66, 99, 75]);
      const p = layout.postal;
      const postal = await sharp(await sharp(png).extract({ left: Math.round(p.x * 800), top: Math.round(p.y * 800), width: Math.round(p.width * 800), height: Math.round(p.height * 800) }).png().toBuffer()).stats();
      expect(postal.channels.slice(0, 3).every(c => c.min === 255 && c.max === 255)).toBe(true);
    }
    await writeFile(resolve(output, `${layoutVersion(layout.key)}-${side}-${state}.png`), png);
    await sharp(png).resize(1095).toFile(resolve(output, `${layoutVersion(layout.key)}-${side}-${state}-review.png`));
  }, 30000);
}
