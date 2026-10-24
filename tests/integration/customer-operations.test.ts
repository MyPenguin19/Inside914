import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, afterEach, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
vi.mock("server-only",()=>({}));
const {bookingAllowsCollection}=await import("@/lib/payments/booking-authorization");
const {createCart,ownedCart,cartMemberToken}=await import("@/lib/booking/cart");
const {hashHoldToken}=await import("@/lib/booking/hold-token");
const {issueAccessToken,hashAccessToken,resolveAccessToken}=await import("@/lib/access/tokens");
const {requestReservationRecovery,exchangeRecovery}=await import("@/lib/access/recovery");
const {decryptEnvelope}=await import("@/lib/email/envelope");
const {processDelivery}=await import("@/lib/email/delivery");
const db=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const admin=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
const anon=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
const editions:string[]=[],zones:string[]=[],slots:string[]=[],carts:string[]=[],deliveryIds:string[]=[],bookingIds:string[]=[];
let user="";
function ok<R extends {data:unknown;error:unknown}>(r:R):NonNullable<R["data"]> {expect(r.error).toBeNull();return r.data as NonNullable<R["data"]>;}
beforeAll(async()=>{
 const email=`ops-${randomUUID()}@example.com`,password=randomBytes(24).toString("hex");
 user=ok(await db.auth.admin.createUser({email,password,email_confirm:true})).user!.id;
 ok(await db.from("admins").insert({user_id:user}));ok(await admin.auth.signInWithPassword({email,password}));
 for(let i=0;i<4;i++) {
  const zone=randomUUID();zones.push(zone);ok(await db.from("zones").insert({id:zone,name:`Operations ${i}`,slug:`ops-${zone}`,household_count:0}));
  const edition=ok(await admin.rpc("admin_create_square_campaign",{p:{zone_id:zone,name:`Operations ${i}`,issue_month:"2098-01-01",target_quantity:5000,reservation_deadline:"2097-12-15T23:59:00Z",artwork_due_at:"2097-12-20T23:59:00Z",mailing_window_start:"2098-01-11",mailing_window_end:"2098-01-15",layout_template:"amazingmail-9x6-v2",unit_price_cents:i===0?100:39900,double_price_cents:null}}));
  editions.push(edition);ok(await admin.rpc("admin_set_campaign_status",{p_id:edition,p_action:"open"}));
  slots.push(ok(await db.from("slots").select("id").eq("edition_id",edition).eq("label","F1").single()).id);
 }
});
afterEach(async()=>{
 for(const id of bookingIds) {await db.from("operational_alerts").delete().like("href",`%${id}`);await db.from("admin_events").delete().eq("target_id",id);}
 ok(await db.from("bookings").delete().in("edition_id",editions));
 if(carts.length) ok(await db.from("reservation_carts").delete().in("id",carts.splice(0)));
 for(const id of deliveryIds) ok(await db.from("operational_alerts").delete().eq("logical_key",`email:${id}`));
 if(deliveryIds.length) ok(await db.from("email_deliveries").delete().in("id",deliveryIds.splice(0)));
 for(const edition of editions) ok(await db.from("operational_alerts").delete().like("href",`%${edition}%`));
 bookingIds.length=0;
});
afterAll(async()=>{deleteLocalCampaignFixtures(editions);ok(await db.from("zones").delete().in("id",zones));ok(await db.from("admin_events").delete().eq("admin_user_id",user));await admin.auth.signOut();ok(await db.auth.admin.deleteUser(user));});
async function held() {const c=await createCart(db,editions.map((editionId,i)=>({editionId,slotIds:[slots[i]],mode:"standard" as const})));carts.push(c.id);const cart=(await ownedCart(db,c.token))!;bookingIds.push(...cart.members.map(b=>b.id));return {...c,cart};}
async function confirmed() {
 const c=await held();const booking=c.cart.members.find(b=>b.editionId===editions[0])!;
 const email=`customer-${randomUUID()}@example.com`,reference=`IN914-${randomBytes(3).toString("hex").toUpperCase().replace(/[01IO]/g,"Z")}`;
 ok(await db.from("booking_contacts").insert({booking_id:booking.id,business_name:"Fixture business",contact_name:"Fixture",email,phone:"+19145551234"}));
 ok(await db.from("booking_artwork").insert(c.cart.members.map(b=>({booking_id:b.id,storage_path:`${b.id}/fixture.png`,status:"ready",content_type:"image/png",width_px:1000,height_px:1000,byte_size:10000,crop_x:0,crop_y:0,crop_width:1000,crop_height:1000,zoom:1}))));
 ok(await db.from("bookings").update({status:"reserved",reference,confirmed_at:new Date().toISOString(),stripe_customer_id:`cus_devtest_${randomUUID()}`,stripe_payment_method_id:`pm_devtest_${randomUUID()}`}).eq("id",booking.id));
 const access=await issueAccessToken(db,booking.id);return {...c,booking,email,reference,access};
}
test("four areas start with one 30-minute window and preserve each advertised price",async()=>{
 const c=await held(),times=c.cart.members.map(b=>Date.parse(b.holdExpiresAt!));
 expect(new Set(times).size).toBe(1);expect(times[0]-Date.now()).toBeGreaterThan(29*60000);expect(times[0]-Date.now()).toBeLessThanOrEqual(30*60000);
 expect(c.cart.members.find(b=>b.editionId===editions[0])?.priceCents).toBe(100);
 expect((await ownedCart(db,c.token))?.members.map(b=>b.id)).toEqual(c.cart.members.map(b=>b.id));
 expect((await db.rpc("extend_cart_hold",{p_hash:hashHoldToken(c.token)})).error?.message).toBe("extension_too_early");
 const blocked=await Promise.all([createCart(db,[{editionId:editions[0],slotIds:[slots[0]],mode:"standard"}]).catch(()=>null),createCart(db,[{editionId:editions[0],slotIds:[slots[0]],mode:"standard"}]).catch(()=>null)]);
 expect(blocked).toEqual([null,null]);
});
test("one near-expiry extension is atomic across all areas and survives refresh",async()=>{
 const c=await held();ok(await db.from("bookings").update({hold_expires_at:new Date(Date.now()+240000).toISOString()}).eq("cart_id",c.id));
 const attempts=await Promise.all([1,2].map(()=>db.rpc("extend_cart_hold",{p_hash:hashHoldToken(c.token)})));
 expect(attempts.filter(r=>!r.error)).toHaveLength(1);expect(attempts.find(r=>r.error)?.error?.message).toBe("extension_limit");
 const rows=ok(await db.from("bookings").select("hold_expires_at,hold_extensions").eq("cart_id",c.id));expect(new Set(rows.map(b=>b.hold_expires_at)).size).toBe(1);expect(rows.every(b=>b.hold_extensions===1)).toBe(true);
 expect(Date.parse(rows[0].hold_expires_at!)-Date.now()).toBeGreaterThan(18*60000);
 expect((await db.rpc("extend_cart_hold",{p_hash:hashHoldToken(cartMemberToken(c.token,editions[0]))})).error?.message).toBe("extension_limit");
});
test("expired group cannot extend or revive; new holds recheck inventory",async()=>{
 const c=await held();ok(await db.from("bookings").update({hold_expires_at:new Date(Date.now()-1000).toISOString()}).eq("cart_id",c.id));
 expect((await db.rpc("extend_cart_hold",{p_hash:hashHoldToken(c.token)})).error?.message).toBe("hold_expired");
 const next=await held();expect(next.id).not.toBe(c.id);
 expect((await db.rpc("extend_cart_hold",{p_hash:hashHoldToken(c.token)})).error).not.toBeNull();
});
test("recovery keeps working links, exchanges once, and never stores raw tokens",async()=>{
 const c=await confirmed();const id=await requestReservationRecovery(db,{email:c.email,reference:c.reference},randomUUID());expect(id).toBeTruthy();deliveryIds.push(id!);
 const delivery=ok(await db.from("email_deliveries").select("*").eq("id",id!).single());
 const payload=decryptEnvelope(delivery.payload_ciphertext,delivery.logical_key),token=payload.text.match(/recover#([A-Za-z0-9_-]{43})/)![1];
 expect(delivery.payload_ciphertext).not.toContain(token);
 expect(ok(await db.from("reservation_recoveries").select("token_hash").eq("booking_id",c.booking.id).single()).token_hash).toBe(hashAccessToken(token));
 const results=await Promise.all([exchangeRecovery(db,token),exchangeRecovery(db,token)]);expect(results.filter(Boolean)).toHaveLength(1);
 expect(await resolveAccessToken(db,results.find(Boolean)!)).toBe(c.booking.id);expect(await resolveAccessToken(db,c.access.token)).toBe(c.booking.id);
 expect(await exchangeRecovery(db,randomBytes(32).toString("base64url"))).toBeNull();
});
test("recovery mismatch, rate limits and expiry fail closed without invalidating old links",async()=>{
 const c=await confirmed(),ip=randomUUID();expect(await requestReservationRecovery(db,{email:c.email,reference:"IN914-NOMATCH"},ip)).toBeNull();
 for(let i=0;i<2;i++){const id=await requestReservationRecovery(db,{email:c.email,reference:c.reference},ip);expect(id).toBeTruthy();deliveryIds.push(id!);}
 expect(await requestReservationRecovery(db,{email:c.email,reference:c.reference},ip)).toBeNull();
 const token=randomBytes(32).toString("base64url");ok(await db.from("reservation_recoveries").insert({booking_id:c.booking.id,token_hash:hashAccessToken(token),expires_at:new Date(0).toISOString()}));
 expect(await exchangeRecovery(db,token)).toBeNull();expect(await resolveAccessToken(db,c.access.token)).toBe(c.booking.id);
});
test("requests deduplicate, require a private token, respect artwork lock and record admin review",async()=>{
 const c=await confirmed();const args={p_hash:hashAccessToken(c.access.token),p_kind:"artwork_change",p_message:"Please help replace the image."};
 const results=await Promise.all([db.rpc("submit_customer_request",args),db.rpc("submit_customer_request",args)]);const id=ok(results[0]);expect(ok(results[1])).toBe(id);
 expect((await anon.rpc("submit_customer_request",args)).error).not.toBeNull();expect((await db.rpc("submit_customer_request",{...args,p_hash:"f".repeat(64)})).error).not.toBeNull();
 expect((await anon.from("customer_requests").select("*")).data??[]).toEqual([]);
 const alert=ok(await db.from("operational_alerts").select("id").eq("logical_key",`reservation:${c.booking.id}`).single());
 ok(await admin.rpc("admin_acknowledge_alert",{p_id:alert.id}));
 ok(await admin.rpc("admin_resolve_customer_request",{p_id:id,p_status:"resolved",p_response:"We will contact you to review a replacement."}));
 expect(ok(await db.from("customer_requests").select("status,resolved_by").eq("id",id).single())).toMatchObject({status:"resolved",resolved_by:user});
 ok(await db.from("editions").update({artwork_due_at:new Date(0).toISOString()}).eq("id",c.booking.editionId));
 expect((await db.rpc("submit_customer_request",args)).error?.message).toBe("artwork_locked");
 expect((await db.rpc("submit_customer_request",{...args,p_kind:"cancellation"})).error).toBeNull();
 expect(ok(await db.from("bookings").select("status,price_cents").eq("id",c.booking.id).single())).toEqual({status:"reserved",price_cents:100});
 ok(await db.from("editions").update({artwork_due_at:"2097-12-20T23:59:00Z"}).eq("id",c.booking.editionId));
});
test("confirmed reservation and repeated deadline refresh create deduplicated actionable alerts",async()=>{
 const c=await confirmed();expect(ok(await db.from("operational_alerts").select("kind").eq("logical_key",`reservation:${c.booking.id}`))).toHaveLength(1);
 ok(await db.from("editions").update({artwork_deadline:new Date(Date.now()-60000).toISOString()}).in("id",editions));
 ok(await db.rpc("refresh_operational_alerts"));ok(await db.rpc("refresh_operational_alerts"));
 for(const edition of editions) expect(ok(await db.from("operational_alerts").select("id").like("logical_key",`deadline:${edition}:%`))).toHaveLength(1);
 expect(ok(await db.from("bookings").select("status").eq("id",c.booking.id).single()).status).toBe("reserved");
 ok(await db.from("editions").update({artwork_deadline:"2097-12-15T23:59:00Z"}).in("id",editions));
});
test("expired recovery delivery and final ambiguous attempt never resend unsafely",async()=>{
 const {queueDelivery}=await import("@/lib/email/delivery");
 for(const expired of [true,false]) {
  const id=await queueDelivery(db,`ops-fixture:${randomUUID()}`,{from:"sender@example.com",to:"fixture@example.com",subject:"fixture",text:"private",html:"private",...(expired?{expiresAt:new Date(0).toISOString()}:{})});deliveryIds.push(id);
  if(!expired) ok(await db.from("email_deliveries").update({attempts:7}).eq("id",id));
  const send=vi.fn(async()=>{throw new Error("timeout");});await processDelivery(db,id,send);
  expect(send).toHaveBeenCalledTimes(expired?0:1);
  expect(ok(await db.from("email_deliveries").select("status").eq("id",id).single()).status).toBe(expired?"failed":"investigation");
 }
});

test("failed owner messages create in-app attention without recursive outbound alerts",async()=>{
 const {queueDelivery}=await import("@/lib/email/delivery");
 const id=await queueDelivery(db,`owner-alert:${randomUUID()}`,{from:"sender@example.com",to:"owner@example.com",subject:"fixture",text:"fixture",html:"fixture"});deliveryIds.push(id);
 ok(await db.from("email_deliveries").update({status:"failed",attempts:3}).eq("id",id));ok(await db.rpc("refresh_operational_alerts"));
 expect(ok(await db.from("operational_alerts").select("kind").eq("logical_key",`email:${id}`).single()).kind).toBe("owner_email");
});

test("simultaneous recovery submissions share one token/envelope; a later request never revokes older access",async()=>{
 const c=await confirmed(),ip=randomUUID();
 const result=await Promise.all([requestReservationRecovery(db,{email:c.email,reference:c.reference},ip),requestReservationRecovery(db,{email:c.email,reference:c.reference},ip)]);
 const rows=ok(await db.from("reservation_recoveries").select("id").eq("booking_id",c.booking.id));expect(rows).toHaveLength(1);
 const first=result.find(Boolean)!;expect(first).toBeTruthy();deliveryIds.push(first);
 ok(await db.from("reservation_recoveries").update({created_at:new Date(Date.now()-61000).toISOString()}).eq("id",rows[0].id));
 const next=await requestReservationRecovery(db,{email:c.email,reference:c.reference},ip);expect(next).toBeTruthy();expect(next).not.toBe(first);deliveryIds.push(next!);
 expect(await resolveAccessToken(db,c.access.token)).toBe(c.booking.id);
});
test("one-area checkout uses the same capped window and late Stripe return cannot confirm",async()=>{
 const c=await createCart(db,[{editionId:editions[0],slotIds:[slots[0]],mode:"standard"}]);carts.push(c.id);
 const cart=(await ownedCart(db,c.token))!;bookingIds.push(...cart.members.map(b=>b.id));
 expect(Date.parse(cart.members[0].holdExpiresAt!)-Date.now()).toBeGreaterThan(29*60000);
 ok(await db.from("bookings").update({stripe_setup_intent_id:"seti_fixture",stripe_customer_id:"cus_fixture",hold_expires_at:new Date(Date.now()-1).toISOString()}).eq("cart_id",c.id));
 const result=await db.rpc("confirm_cart",{p_cart_id:c.id,p_setup_intent_id:"seti_fixture",p_payment_method_id:"pm_fixture",p_references:{}});
 expect(result.error).toBeNull();expect(result.data).toBe("hold_expired");
 expect((await db.rpc("extend_cart_hold",{p_hash:hashHoldToken(c.token)})).error).not.toBeNull();
});
test("owner jobs deduplicate, retain failed notifications and recover without recursive email",async()=>{
 const {dispatchOwnerNotifications}=await import("@/lib/operations/notifications");
 const {EmailProviderError}=await import("@/lib/email/provider");const c=await confirmed();
 const alerts=ok(await db.from("operational_alerts").select("id").eq("logical_key",`reservation:${c.booking.id}`)),ids=alerts.map(a=>a.id);
 expect(await dispatchOwnerNotifications(db,vi.fn(),ids)).toEqual({configured:false,processed:0});
 vi.stubEnv("ADMIN_NOTIFICATION_EMAIL","owner-fixture@example.com");vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS","false");
 try {
  const send=vi.fn(async()=>{throw new EmailProviderError("provider_http_429",true);});
  await Promise.all([dispatchOwnerNotifications(db,send,ids),dispatchOwnerNotifications(db,send,ids)]);
  const delivery=ok(await db.from("email_deliveries").select("id,status").eq("logical_key",`owner-alert:${ids[0]}`).single());deliveryIds.push(delivery.id);
  expect(delivery.status).toBe("failed");expect(send).toHaveBeenCalledTimes(1);
  ok(await db.from("email_deliveries").update({next_attempt_at:new Date(0).toISOString()}).eq("id",delivery.id));
  const accepted=vi.fn(async()=>({id:randomUUID()}));await dispatchOwnerNotifications(db,accepted,ids);expect(accepted).toHaveBeenCalledTimes(1);
  expect(accepted.mock.calls[0]).toEqual(send.mock.calls[0]);
  expect(ok(await db.from("bookings").select("status").eq("id",c.booking.id).single()).status).toBe("reserved");
 }finally{vi.unstubAllEnvs();}
});
test("first terminal email failure is visible without waiting for three impossible retries",async()=>{
 const {queueDelivery}=await import("@/lib/email/delivery");const id=await queueDelivery(db,`ops-fixture:${randomUUID()}`,{from:"fixture@example.com",to:"client@example.com",subject:"fixture",html:"fixture",text:"fixture"});deliveryIds.push(id);
 ok(await db.from("email_deliveries").update({status:"failed",attempts:1,retry_safe:false}).eq("id",id));ok(await db.rpc("refresh_operational_alerts"));
 expect(ok(await db.from("operational_alerts").select("id").eq("logical_key",`email:${id}`))).toHaveLength(1);
});

test("extension respects both original creation cap and the campaign deadline",async()=>{
 const c=await held();
 ok(await db.from("reservation_carts").update({created_at:new Date(Date.now()-40*60000).toISOString()}).eq("id",c.id));
 ok(await db.from("bookings").update({hold_expires_at:new Date(Date.now()+4*60000).toISOString()}).eq("cart_id",c.id));
 const expiry=ok(await db.rpc("extend_cart_hold",{p_hash:hashHoldToken(c.token)}));
 expect(Date.parse(expiry)-Date.now()).toBeLessThanOrEqual(5*60000);expect(Date.parse(expiry)-Date.now()).toBeGreaterThan(4*60000);
 // A different fresh hold is capped to the earliest campaign deadline at creation.
 const other=ok(await db.from("slots").select("id").eq("edition_id",editions[0]).eq("label","F2").single());
 const deadline=new Date(Date.now()+4*60000).toISOString();ok(await db.from("editions").update({artwork_deadline:deadline}).eq("id",editions[0]));
 try {
  const second=await createCart(db,[{editionId:editions[0],slotIds:[other.id],mode:"standard"}]);carts.push(second.id);
  const members=(await ownedCart(db,second.token))!.members;bookingIds.push(...members.map(b=>b.id));
  expect(Date.parse(members[0].holdExpiresAt!)).toBe(Date.parse(deadline));
  expect((await db.rpc("extend_cart_hold",{p_hash:hashHoldToken(second.token)})).error?.message).toBe("campaign_deadline_reached");
  expect(ok(await db.from("reservation_carts").select("hold_extensions").eq("id",second.id).single()).hold_extensions).toBe(0);
 }finally{ok(await db.from("editions").update({artwork_deadline:"2097-12-15T23:59:00Z"}).eq("id",editions[0]));}
});

test("pending cancellation blocks the existing reservation until reviewed; canceled stays blocked",async()=>{
 const c=await confirmed();expect(await bookingAllowsCollection(db,c.booking.id)).toBe(true);
 const id=ok(await db.rpc("submit_customer_request",{p_hash:hashAccessToken(c.access.token),p_kind:"cancellation",p_message:"Please cancel my reservation before collection."}));
 expect(await bookingAllowsCollection(db,c.booking.id)).toBe(false);
 ok(await admin.rpc("admin_resolve_customer_request",{p_id:id,p_status:"declined",p_response:"Fixture decision only"}));
 expect(await bookingAllowsCollection(db,c.booking.id)).toBe(true);
 ok(await admin.rpc("admin_cancel_booking",{p_booking_id:c.booking.id,p_reason:"Local fixture cancellation"}));
 expect(await bookingAllowsCollection(db,c.booking.id)).toBe(false);
 expect(ok(await db.from("bookings").select("price_cents").eq("id",c.booking.id).single()).price_cents).toBe(100);
});
