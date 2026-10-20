// @vitest-environment node
// Representative synthetic print samples; no database, Stripe or production access.
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import sharp from "sharp";
import {expect,test} from "vitest";
import {renderPostcard,EXPORT_SIZE} from "@/lib/print/export";
import {AMAZINGMAIL_9X6_LAYOUT as layout} from "@/lib/print/amazingmail-layout";
const output=resolve("../../outputs/inside914-prelaunch-exports");
const sample=(width:number,height:number,text:string)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e8eef2"/><text x="50%" y="45%" text-anchor="middle" font-family="sans-serif" font-size="45">${text}</text><text x="50%" y="58%" text-anchor="middle" font-family="sans-serif" font-size="30">SYNTHETIC TEST ONLY</text></svg>`)).png().toBuffer();
test.each([1,5,10])("exports front/back at %i/10 with unchanged geometry and blank postal area",async count=>{
 await mkdir(output,{recursive:true});
 const ad=await sample(900,900,"AD ARTWORK");
 const house=await sample(1495,1043,"PERMANENT HOUSE PANEL");
 const occupied=layout.paidSlots.slice(0,count);
 for(const side of ["front","back"] as const) {
  const positions=occupied.filter(s=>s.side===side);
  // One reserved square awaiting an upload in the 5/10 example.
  const ads=positions.filter(s=>!(count===5 && s.label==="F5")).map(s=>({label:s.label,input:ad,crop:{x:0,y:0,width:900,height:900}}));
  const png=await renderPostcard(side,ads,side==="back" ? house : undefined,positions.map(s=>s.label));
  expect(await sharp(png).metadata()).toMatchObject({...EXPORT_SIZE,density:800,format:"png"});
  if(side==="back") {
   const postal=await sharp(await sharp(png).extract({left:4160,top:2236,width:3140,height:2664}).png().toBuffer()).stats();
   expect(postal.channels.slice(0,3).every(c=>c.min===255 && c.max===255)).toBe(true);
  }
  await writeFile(resolve(output,`${count}-of-10-${side}-TEST-PREVIEW.png`),png);
  await sharp(png).resize(1095,735).toFile(resolve(output,`${count}-of-10-${side}-review.png`));
 }
},30000);
