// @vitest-environment node
import { expect, test } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { POSTCARD_LAYOUT_V2 as v2, findPostcardLayout, postcardZones, acceptsCrop } from "@/lib/print/layouts";
import { AMAZINGMAIL_9X6_LAYOUT as v1, fileToTrim, type PrintRectangle } from "@/lib/print/amazingmail-layout";
import { containImage, containedPpi } from "@/lib/print/image-fit";
import { renderPostcard, normalizeHouse, houseOutput, EXPORT_SIZE } from "@/lib/print/export";
const overlap = (a:PrintRectangle,b:PrintRectangle) => a.x < b.x+b.width-1e-9 && b.x < a.x+a.width-1e-9 && a.y < b.y+b.height-1e-9 && b.y < a.y+a.height-1e-9;

test("V2 exact front/back geometry fits live, with stable ten paid IDs and protected house/postal regions",()=>{
 expect(v2.paidSlots.map(s=>s.label)).toEqual(["F1","F2","F3","F4","F5","F6","B1","B2","B3","B4"]);
 expect(v2.file).toEqual({x:0,y:0,width:9.125,height:6.125});
 expect(v2.trim).toEqual({x:.0625,y:.0625,width:9,height:6});
 expect(v2.live).toEqual({x:.1875,y:.1875,width:8.75,height:5.75});
 for(const r of [...v2.paidSlots,v2.housePanel]) {
  expect(r.x).toBeGreaterThanOrEqual(v2.live.x); expect(r.y).toBeGreaterThanOrEqual(v2.live.y);
  expect(r.x+r.width).toBeLessThanOrEqual(v2.live.x+v2.live.width+1e-9);
  expect(r.y+r.height).toBeLessThanOrEqual(v2.live.y+v2.live.height+1e-9);
 }
 for(const side of ["front","back"] as const) {
  const slots=v2.paidSlots.filter(s=>s.side===side);
  for(const s of slots) expect([s.width,s.height]).toEqual(side==="front" ? [2.78,2.78] : [2.2925,2.815]);
  const regions=side==="front" ? slots : [...slots,v2.housePanel,v2.postal];
  for(const [i,a] of regions.entries()) for(const b of regions.slice(i+1)) expect(overlap(a,b),`${a.x},${a.y} vs ${b.x},${b.y}`).toBe(false);
 }
 expect(v2.postal).toEqual(v1.postal); // never shrink or shift the exclusion
 expect(v2.housePanel.x).toBe(v2.postal.x);
 expect(v2.postal.y-v2.housePanel.y-v2.housePanel.height).toBeCloseTo(.125,8);
 expect(v2.postal.x-(v2.paidSlots[7].x+v2.paidSlots[7].width)).toBeCloseTo(.3075,8);
 expect(fileToTrim(v2.paidSlots[7])).toMatchObject({x:2.5375,y:.125,width:2.2925,height:2.815});
 expect(postcardZones(v2.key).map(s=>s.kind)).toEqual(["house","postal"]);
});

test("immutable V1 and V2 identities never fall back to the latest for unknown keys",()=>{
 expect(findPostcardLayout(v1.key)).toBe(v1);expect(findPostcardLayout(v2.key)).toBe(v2);expect(findPostcardLayout("unknown")).toBeNull();
 expect(v1.paidSlots.every(s=>s.width===2.5 && s.height===2.5)).toBe(true);
 expect(acceptsCrop(v1.key,{width:900,height:1100})).toBe(false);
 expect(acceptsCrop(v2.key,{width:900,height:1100})).toBe(true);
});

test("migration's canonical geometry exactly matches the application JSON",()=>{
 const sql=readFileSync("supabase/migrations/20261023035620_postcard_layout_v2.sql","utf8");
 const payload=JSON.parse(sql.match(/\$layout\$([\s\S]*?)\$layout\$/)![1]);
 expect(payload).toEqual(JSON.parse(readFileSync("src/lib/print/layout-v2.json","utf8")));
 expect(sql).not.toMatch(/update public\.(bookings|slots|booking_artwork) /i);
 expect(sql).not.toMatch(/drop.*guard_campaign_layout/i);
});

test("shared contain fitting preserves a square on the back and computes resolution for its placed size",()=>{
 const target=v2.paidSlots[6];const fit=containImage({width:900,height:900},target);
 expect(fit.width).toBeCloseTo(target.width);expect(fit.height).toBeCloseTo(target.width);
 expect(fit.y).toBeCloseTo((2.815-2.2925)/2);expect(fit.x).toBe(0);
 expect(containedPpi({width:900,height:900},target)).toBe(392);
 expect(containedPpi({width:834,height:834},v2.paidSlots[0])).toBe(300);
 expect(containedPpi({width:750,height:750},v2.paidSlots[0])).toBe(269);
});

test("800 DPI V2 exports share exact placement, contain old square/house artwork and keep all postal pixels white",async()=>{
 const solid=(width:number,height:number,color:string)=>sharp({create:{width,height,channels:3,background:color}}).png().toBuffer();
 const legacyHouse=await solid(2990,2086,"blue");
 const square=await solid(1200,1200,"red");
 const portrait=await solid(917,1126,"green");
 const ads=v2.paidSlots.map((s,i)=>({label:s.label,input:i===7?portrait:square,crop:{x:0,y:0,width:i===7?917:1200,height:i===7?1126:1200}}));
 for(const side of ["front","back"] as const) {
  const png=await renderPostcard(side,ads.filter(a=>a.label.startsWith(side==="front"?"F":"B")),legacyHouse,[],v2);
  expect(await sharp(png).metadata()).toMatchObject({...EXPORT_SIZE,density:800});
  const pixel=async(x:number,y:number)=>[...await sharp(png).extract({left:Math.round(x*800),top:Math.round(y*800),width:1,height:1}).removeAlpha().raw().toBuffer()];
  for(const s of v2.paidSlots.filter(s=>s.side===side)) {
   expect(await pixel(s.x+s.width/2,s.y+s.height/2)).toEqual(s.label==="B2"?[0,128,0]:[255,0,0]);
   if(side==="front") expect(await pixel(s.x+.00125,s.y+.00125)).toEqual([255,0,0]);
  }
  if(side==="back") {
   const s=v2.paidSlots[6];expect(await pixel(s.x+.1,s.y+.1)).toEqual([244,242,236]); // square letterbox
   expect(await pixel(6,1)).toEqual([0,0,255]);expect(await pixel(6,2.7)).toEqual([244,242,236]);
   const region=v2.postal;
   const stats=await sharp(await sharp(png).extract({left:region.x*800,top:region.y*800,width:region.width*800,height:region.height*800}).png().toBuffer()).stats();
   expect(stats.channels.slice(0,3).every(c=>c.min===255 && c.max===255)).toBe(true);
  }
 }
 const normalized=await normalizeHouse(await solid(2000,1500,"blue"),{x:0,y:0,width:1495,height:993},v2);
 expect(normalized).toMatchObject(houseOutput(v2));
 const missing=await renderPostcard("back",[],undefined,["B3"],v2);
 expect(await sharp(missing).metadata()).toMatchObject(EXPORT_SIZE);
 await expect(renderPostcard("back",[{label:"house",input:square,crop:{x:0,y:0,width:1200,height:1200}}],undefined,[],v2)).rejects.toThrow("Invalid or duplicate");
},30000);

test("representative full-resolution front/back proofs are reproducible review artifacts",async()=>{
 const colors=["#cfe8dc","#fbdec1","#d7e6f5","#e7dcf2","#f3d6df","#e4eac9"];
 const sample=async(width:number,height:number,label:string,color:string)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><g fill="#252525" text-anchor="middle" font-family="sans-serif"><text x="50%" y="32%" font-size="75">${label}</text><text x="50%" y="48%" font-size="42">Representative artwork</text><text x="50%" y="62%" font-size="32">No customer data · Local fixture</text><text x="50%" y="75%" font-size="32">PREVIEW — NOT READY TO MAIL</text></g></svg>`)).png().toBuffer();
 const ads=await Promise.all(v2.paidSlots.map(async(s,i)=>{const width=Math.round(s.width*800),height=Math.round(s.height*800);return {label:s.label,input:await sample(width,height,`${s.label} · ${s.width} × ${s.height} inches`,colors[i%6]),crop:{x:0,y:0,width,height}};}));
 const size=houseOutput(v2);const house=await sample(size.width,size.height,"Inside914 + Inside Diagnostics","#dce5df");
 const dir="test-results/postcard-v2";mkdirSync(dir,{recursive:true});
 for(const side of ["front","back"] as const) {
  const png=await renderPostcard(side,ads.filter(a=>a.label.startsWith(side==="front"?"F":"B")),house,[],v2);
  writeFileSync(`${dir}/${side}-800dpi.png`,png);
  await sharp(png).resize(1460,980).png().toFile(`${dir}/${side}-preview.png`);
 }
},30000);


test("native 800-DPI artwork retains single-pixel detail instead of using an enlarged screen preview",async()=>{
 const width=2224,height=2224;
 const raw=Buffer.alloc(width*height*3);
 for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
  const i=(y*width+x)*3;raw[i]=x%2?255:0;raw[i+1]=y%2?255:0;raw[i+2]=127;
 }
 const source=await sharp(raw,{raw:{width,height,channels:3}}).png().toBuffer();
 const output=await renderPostcard("front",[{label:"F1",input:source,crop:{x:0,y:0,width,height}}],undefined,[],v2);
 const s=v2.paidSlots[0];
 const extracted=await sharp(output).extract({left:Math.round(s.x*800),top:Math.round(s.y*800),width,height}).removeAlpha().raw().toBuffer();
 expect(extracted.equals(raw)).toBe(true);
},30000);
