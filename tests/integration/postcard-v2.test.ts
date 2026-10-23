import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { V2_TEMPLATE, SQUARE_TEMPLATE } from "@/lib/admin/layouts";
import { placeHold } from "@/lib/booking/place-hold";
import * as artwork from "@/lib/artwork/service";
import { getBookingByHoldToken } from "@/lib/checkout/service";
import { getReservationView } from "@/lib/checkout/reservation";
const db=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const admin=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
const anon=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
const zone=randomUUID(),campaigns:string[]=[],storage:string[]=[]; let user:string;let oldSnapshot:unknown;
const ok=<T>(r:{data:T;error:unknown})=>{expect(r.error).toBeNull();return r.data;};
const sql=(query:string)=>execFileSync("python3",["scripts/local-test-db.py","-c",query],{stdio:"pipe"}).toString();
beforeAll(async()=>{
 const email=`v2-${randomUUID()}@example.com`,password=randomBytes(24).toString("hex");
 const created=await db.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();user=created.data.user!.id;
 ok(await db.from("admins").insert({user_id:user}));ok(await db.from("zones").insert({id:zone,name:`V2 ${zone}`,slug:`v2-${zone}`,household_count:5000}));
 expect((await admin.auth.signInWithPassword({email,password})).error).toBeNull();
 for(const [i,t] of [SQUARE_TEMPLATE,V2_TEMPLATE].entries()) campaigns.push(ok(await admin.rpc("admin_create_square_campaign",{p:{zone_id:zone,name:`Version ${i+1}`,issue_month:`2098-0${i+1}-01`,target_quantity:5000,reservation_deadline:"2097-12-15T23:59:00Z",artwork_due_at:"2097-12-20T23:59:00Z",mailing_window_start:"2098-01-11",mailing_window_end:"2098-01-15",layout_template:t.key,unit_price_cents:39900,double_price_cents:null}}))!);
 oldSnapshot=ok(await db.from("editions").select("*,slots(*)").eq("id",campaigns[0]).single());
 ok(await admin.rpc("admin_set_campaign_status",{p_id:campaigns[1],p_action:"open"}));
});
afterAll(async()=>{
 if(storage.length)ok(await db.storage.from("artwork").remove(storage));
 if(campaigns.length){ok(await db.from("bookings").delete().in("edition_id",campaigns));deleteLocalCampaignFixtures(campaigns);}
 ok(await db.from("zones").delete().eq("id",zone));
 if(user){ok(await db.from("admin_events").delete().eq("admin_user_id",user));await admin.auth.signOut();expect((await db.auth.admin.deleteUser(user)).error).toBeNull();}
});
test("V2 requires admin authorization and keeps exactly ten immutable, precisely stored paid slots",async()=>{
 expect((await anon.rpc("admin_create_square_campaign",{p:{}})).error).not.toBeNull();
 const slots=ok(await db.from("slots").select("*").eq("edition_id",campaigns[1]))!;expect(slots).toHaveLength(10);
 for(const s of V2_TEMPLATE.slots) expect(slots.find(x=>x.label===s.label)).toMatchObject({x_in:s.x,y_in:s.y,width_in:s.width,height_in:s.height});
 expect((await db.from("slots").update({width_in:2.5}).eq("id",slots.find(s=>s.label==="B1")!.id)).error?.message).toBe("square_inventory_is_fixed");
 expect((await db.from("slots").insert({edition_id:campaigns[1],label:"HOUSE",side:"back",x_in:5.1375,y_in:.125,width_in:3.7375,height_in:2.4825})).error).not.toBeNull();
 expect((await db.from("editions").update({layout_template:V2_TEMPLATE.key}).eq("id",campaigns[0])).error?.message).toBe("square_campaign_is_fixed");
 expect(await placeHold(db,{slotIds:["house"]})).toMatchObject({ok:false});
 expect(await placeHold(db,{slotIds:[randomUUID()]})).toMatchObject({ok:false,reason:"slot_not_found"});
 expect(sql("begin; set local role authenticated; select has_table_privilege(current_user,'private.postcard_layout_versions','select'); rollback;")).toContain("f");
});
test("V2 back accepts portrait and contained square crops, keeps source bytes and enforces checkout/readiness",async()=>{
 const slots=ok(await db.from("slots").select("id,label").eq("edition_id",campaigns[1]))!;
 for(const [label,w,h] of [["B1",917,1126],["B2",900,900],["F1",750,750]] as const) {
  const hold=await placeHold(db,{slotIds:[slots.find(s=>s.label===label)!.id]});expect(hold.ok).toBe(true);if(!hold.ok)throw Error("hold");
  expect((await placeHold(db,{slotIds:[slots.find(s=>s.label===label)!.id]})).ok).toBe(false);
  const original=await sharp({create:{width:w,height:h,channels:3,background:"red"}}).png().toBuffer();
  const ticket=await artwork.requestUpload(db,hold.token,{byteSize:original.length});if(!ticket.ok)throw Error("ticket");
  const body=new FormData();body.append("cacheControl","3600");body.append("",new Blob([new Uint8Array(original)],{type:"image/png"}));
  expect((await fetch(ticket.uploadUrl,{method:"PUT",headers:{"x-upsert":"false"},body})).ok).toBe(true);
  expect((await artwork.finalizeUpload(db,hold.token,{artworkId:ticket.artworkId})).ok).toBe(true);
  const row=ok(await db.from("booking_artwork").select("storage_path").eq("id",ticket.artworkId).single())!;storage.push(row.storage_path);
  expect((await artwork.saveLayout(db,hold.token,{artworkId:ticket.artworkId,crop:{x:0,y:0,width:w,height:h},zoom:1})).ok).toBe(true);
  expect(await getBookingByHoldToken(db,hold.token)).toMatchObject({artworkReady:true,priceCents:39900,stripeSetupIntentId:null,stripeCustomerId:null});
  const view=await getReservationView(db,hold.bookingId);expect(view?.layoutTemplate).toBe(V2_TEMPLATE.key);
  expect(view?.area).toMatchObject(label.startsWith("B")?{width:2.2925,height:2.815}:{width:2.78,height:2.78});
  const downloaded=ok(await db.storage.from("artwork").download(row.storage_path))!;expect(Buffer.from(await downloaded.arrayBuffer()).equals(original)).toBe(true);
  expect((await artwork.saveLayout(db,hold.token,{artworkId:ticket.artworkId,crop:{x:0,y:0,width:w+10,height:h},zoom:1})).ok).toBe(false);
  const ready=sql(`select private.artwork_print_resolution(a) from public.booking_artwork a where id='${ticket.artworkId}';`);
  expect(ready).toContain(label==="F1" ? "f" : "t"); // 750px is insufficient for a 2.78-inch front, not blanket 750px acceptance
 }
 expect(ok(await db.from("zone_charges").select("id").in("edition_id",campaigns))).toHaveLength(0);
 expect(ok(await admin.rpc("admin_collection_preview",{p_id:campaigns[1]}))).toMatchObject({ready:false});
 expect(ok(await db.from("editions").select("*,slots(*)").eq("id",campaigns[0]).single())).toEqual(oldSnapshot);
});
