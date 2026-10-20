// @vitest-environment node
import { expect, test } from "vitest";
import sharp from "sharp";
import { renderPostcard, normalizeHouse, EXPORT_DPI, EXPORT_SIZE } from "@/lib/print/export";
import { AMAZINGMAIL_9X6_LAYOUT as layout } from "@/lib/print/amazingmail-layout";
const solid = (color: string, width = 900, height = 900) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
test("front/back exports preserve every paid square, the permanent house panel and a blank postal region", async () => {
  const red = await solid("red"); const blue = await solid("blue", 1495, 1043);
  for (const side of ["front", "back"] as const) {
    const png = await renderPostcard(side, layout.paidSlots.filter(s => s.side === side).map(s => ({ label: s.label, input: red, crop: { x: 0, y: 0, width: 900, height: 900 } })), side === "back" ? blue : undefined);
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
      expect(await pixel(6,0.8)).toEqual([0,0,255]); expect(await pixel(6,2.1)).toEqual([0,0,255]);
    }
  }
}, 30000);
test("preview exports allow empty positions and a missing house panel but reject malformed crops", async () => {
  const blank = await renderPostcard("back", []);
  expect(await sharp(blank).metadata()).toMatchObject(EXPORT_SIZE);
  const image = await solid("red");
  await expect(renderPostcard("front", [{label:"F1",input:image,crop:{x:0,y:0,width:0,height:0}}])).rejects.toThrow("valid square crop");
  await expect(normalizeHouse(await solid("red",500,500))).rejects.toThrow("1122 × 783");
}, 30000);
test.each([1,4,9,10])("current-state export works with %i occupied positions, including unapproved artwork", async count => {
  const image = await solid("red");
  const occupied = layout.paidSlots.slice(0,count);
  for (const side of ["front","back"] as const) {
    const ads = occupied.filter(s=>s.side===side).map(s=>({label:s.label,input:image,crop:{x:0,y:0,width:900,height:900}}));
    const png=await renderPostcard(side,ads);
    expect(await sharp(png).metadata()).toMatchObject({...EXPORT_SIZE,density:800});
    for(const slot of layout.paidSlots.filter(s=>s.side===side)) {
      const pixel=[...await sharp(png).extract({left:Math.round((slot.x+0.1)*800),top:Math.round((slot.y+0.1)*800),width:1,height:1}).removeAlpha().raw().toBuffer()];
      expect(pixel).toEqual(occupied.includes(slot) ? [255,0,0] : [245,245,245]);
    }
  }
},30000);
test("replacing the permanent house image changes future renders without changing postal pixels", async()=> {
 const a=await renderPostcard("back",[],await solid("blue",1495,1043));
 const b=await renderPostcard("back",[],await solid("green",1495,1043));
 expect(a.equals(b)).toBe(false);
 for(const png of [a,b]) {
  const stats=await sharp(await sharp(png).extract({left:4160,top:2236,width:3140,height:2664}).toBuffer()).stats();
  expect(stats.channels.slice(0,3).every(c=>c.min===255 && c.max===255)).toBe(true);
 }
},30000);
