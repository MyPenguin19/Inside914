import { randomBytes,randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll,afterAll,afterEach,expect,test,vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
vi.mock("server-only",()=>({}));
let cookieToken:string|undefined;
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>cookieToken?{value:cookieToken}:undefined})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>db}));
const {placeHold}=await import("@/lib/booking/place-hold");
const {issueAccessToken}=await import("@/lib/access/tokens");
const {invitationOffer,invitationFingerprint,invitationMessage,queueInvitation}=await import("@/lib/invitations/service");
const {queueDelivery,processDelivery}=await import("@/lib/email/delivery");
const {GET}=await import("@/app/reservation/evidence/[id]/route");
const db=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const admin=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
const anon=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
const zone=randomUUID();let edition="",slot="",user="";
const paths:string[]=[],deliveries:string[]=[],bookings:string[]=[];
function ok<R extends {data:unknown;error:unknown}>(r:R):NonNullable<R["data"]>{expect(r.error).toBeNull();return r.data as NonNullable<R["data"]>;}
beforeAll(async()=>{
 const email=`evidence-${randomUUID()}@example.com`,password=randomBytes(24).toString("hex");user=ok(await db.auth.admin.createUser({email,password,email_confirm:true})).user!.id;
 ok(await db.from("admins").insert({user_id:user}));ok(await admin.auth.signInWithPassword({email,password}));
 ok(await db.from("zones").insert({id:zone,name:"Evidence fixture",slug:`evidence-${zone}`,household_count:0}));
 edition=ok(await admin.rpc("admin_create_square_campaign",{p:{zone_id:zone,name:"Evidence fixture",issue_month:"2098-01-01",target_quantity:5000,reservation_deadline:"2097-12-15T23:59:00Z",artwork_due_at:"2097-12-20T23:59:00Z",mailing_window_start:"2098-01-11",mailing_window_end:"2098-01-15",layout_template:"amazingmail-9x6-v2",unit_price_cents:100,double_price_cents:null}}));
 ok(await admin.rpc("admin_set_campaign_status",{p_id:edition,p_action:"open"}));slot=ok(await db.from("slots").select("id").eq("edition_id",edition).eq("label","F1").single()).id;
});
afterEach(async()=>{
 cookieToken=undefined;for(const id of bookings)ok(await db.from("operational_alerts").delete().like("href",`%${id}`));bookings.length=0;
 ok(await db.from("bookings").delete().eq("edition_id",edition));ok(await db.from("mailing_evidence").delete().eq("edition_id",edition));ok(await db.from("advertiser_invitations").delete().eq("edition_id",edition));
 if(paths.length)ok(await db.storage.from("mailing-evidence").remove(paths.splice(0)));if(deliveries.length)ok(await db.from("email_deliveries").delete().in("id",deliveries.splice(0)));
});
afterAll(async()=>{deleteLocalCampaignFixtures([edition]);ok(await db.from("zones").delete().eq("id",zone));ok(await db.from("admin_events").delete().eq("admin_user_id",user));await admin.auth.signOut();ok(await db.auth.admin.deleteUser(user));});
async function confirmed(){const held=await placeHold(db,{slotIds:[slot]});if(!held.ok)throw new Error(held.reason);bookings.push(held.bookingId);
 ok(await db.from("booking_artwork").insert({booking_id:held.bookingId,storage_path:`${held.bookingId}/fixture.png`,status:"ready",content_type:"image/png",width_px:1000,height_px:1000,byte_size:10000,crop_x:0,crop_y:0,crop_width:1000,crop_height:1000,zoom:1}));
 ok(await db.from("bookings").update({status:"reserved",confirmed_at:new Date().toISOString(),reference:`IN914-${randomBytes(3).toString("hex").toUpperCase().replace(/[01IO]/g,"Z")}`,stripe_payment_method_id:`pm_devtest_${randomUUID()}`}).eq("id",held.bookingId));return held.bookingId;}
async function evidence(file=true){const path=`${edition}/${randomUUID()}.pdf`,bytes=new TextEncoder().encode("%PDF-1.4 local evidence fixture");
 if(file){paths.push(path);ok(await db.storage.from("mailing-evidence").upload(path,bytes,{contentType:"application/pdf"}));}
 return ok(await admin.rpc("admin_add_evidence",{p_edition_id:edition,p:{kind:"printer_confirmation",title:"Local printer confirmation",storage_path:file?path:null,content_type:file?"application/pdf":null,byte_size:file?bytes.length:null,event_date:"2026-10-24",notes:"PRIVATE OWNER NOTES MUST NOT BE SHARED"}}));}
test("only explicit publication exposes current existing files; metadata alone cannot publish",async()=>{
 const booking=await confirmed(),id=await evidence();expect(ok(await db.rpc("customer_mailing_evidence",{p_booking:booking}))).toEqual([]);
 expect((await admin.rpc("admin_publish_evidence",{p_id:await evidence(false),p_publish:true})).error?.message).toBe("current_evidence_file_required");
 expect((await anon.rpc("admin_publish_evidence",{p_id:id,p_publish:true})).error).not.toBeNull();
 ok(await admin.rpc("admin_publish_evidence",{p_id:id,p_publish:true}));const rows=ok(await db.rpc("customer_mailing_evidence",{p_booking:booking}));expect(rows).toHaveLength(1);expect(rows[0]).not.toHaveProperty("notes");
 expect(ok(await db.rpc("customer_mailing_evidence",{p_booking:randomUUID()}))).toEqual([]);expect((await anon.rpc("customer_mailing_evidence",{p_booking:booking})).error).not.toBeNull();
 ok(await admin.rpc("admin_publish_evidence",{p_id:id,p_publish:false}));expect(ok(await db.rpc("customer_mailing_evidence",{p_booking:booking}))).toEqual([]);
});
test("private download requires booking access, rechecks publication, and returns a short-lived uncached link",async()=>{
 const booking=await confirmed(),id=await evidence(),request=new Request(`http://localhost/reservation/evidence/${id}`),params={params:Promise.resolve({id})};
 ok(await admin.rpc("admin_publish_evidence",{p_id:id,p_publish:true}));expect((await GET(request,params)).status).toBe(404);
 cookieToken=(await issueAccessToken(db,booking)).token;const result=await GET(request,params);expect(result.status).toBe(303);expect(result.headers.get("Cache-Control")).toContain("no-store");
 const link=new URL(result.headers.get("Location")!),jwt=link.searchParams.get("token")!;const claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());expect(claims.exp-claims.iat).toBe(60);
 ok(await admin.rpc("admin_publish_evidence",{p_id:id,p_publish:false}));expect((await GET(request,params)).status).toBe(404);
});
test("historical proof dates and deleted files cannot present current approval",async()=>{
 const booking=await confirmed(),id=await evidence();ok(await admin.rpc("admin_publish_evidence",{p_id:id,p_publish:true}));
 ok(await db.from("mailing_evidence").update({uploaded_at:"2000-01-01T00:00:00Z"}).eq("id",id));
 // A current customer artwork revision supersedes the earlier document.

 expect(ok(await db.rpc("customer_mailing_evidence",{p_booking:booking}))).toEqual([]);
 const fresh=await evidence();ok(await admin.rpc("admin_publish_evidence",{p_id:fresh,p_publish:true}));
 ok(await db.storage.from("mailing-evidence").remove(paths));expect(ok(await db.rpc("customer_mailing_evidence",{p_booking:booking}))).toEqual([]);
});
test("admin invitations preserve $1 price and do not hold inventory; occupied and expired links fail closed",async()=>{
 expect((await anon.rpc("admin_create_invitation",{p_edition:edition,p_slot:slot})).error).not.toBeNull();
 const id=ok(await admin.rpc("admin_create_invitation",{p_edition:edition,p_slot:slot,p_email:"interested@example.com",p_name:"Interested business"}));
 expect((await anon.from("advertiser_invitations").select("*")).data??[]).toEqual([]);
 const offer=await invitationOffer(db,id);expect(offer).toMatchObject({priceCents:100,editionId:edition,slotId:slot});
 expect(ok(await db.from("bookings").select("id").eq("edition_id",edition))).toEqual([]);
 await confirmed();expect(await invitationOffer(db,id)).toBeNull();expect((await admin.rpc("admin_create_invitation",{p_edition:edition,p_slot:slot})).error?.message).toBe("position_unavailable");
 ok(await db.from("advertiser_invitations").update({expires_at:new Date(0).toISOString()}).eq("id",id));expect(await invitationOffer(db,id)).toBeNull();
});
test("back-position invitations quote the back price and invalidate stale previews",async()=>{
 const back=ok(await db.from("slots").select("id").eq("edition_id",edition).eq("label","B1").single()).id;
 const id=ok(await admin.rpc("admin_create_invitation",{p_edition:edition,p_slot:back,p_email:"interested@example.com"}));
 const offer=(await invitationOffer(db,id))!;
 expect(offer).toMatchObject({priceCents:34900,slotId:back,label:"B1"});
 expect(invitationMessage(offer,null).text).toContain("$349");
 ok(await admin.rpc("admin_update_campaign",{p_id:edition,p:{back_unit_price_cents:32900}}));
 await expect(queueInvitation(db,id,invitationFingerprint(offer))).rejects.toThrow("changed");
 expect((await invitationOffer(db,id))?.priceCents).toBe(32900);
 expect(ok(await db.from("bookings").select("id").eq("edition_id",edition))).toEqual([]);
 ok(await admin.rpc("admin_update_campaign",{p_id:edition,p:{back_unit_price_cents:34900}}));
});
test("commercial invitation email stays blocked without a verified address and opt-out; preview does not queue",async()=>{
 const id=ok(await admin.rpc("admin_create_invitation",{p_edition:edition,p_slot:slot,p_email:"interested@example.com",p_name:"<Business>"}));const offer=(await invitationOffer(db,id))!;
 await expect(queueInvitation(db,id,"bad-preview")).rejects.toThrow("changed");
 await expect(queueInvitation(db,id,invitationFingerprint(offer))).rejects.toThrow("mailing address and opt-out");
 const message=invitationMessage(offer,"<Business>");expect(message.text).toContain("$1");expect(message.text).toContain("does not reserve or guarantee");expect(message.html).toContain("&lt;Business&gt;");
 expect(message.text).toContain("Inside Diagnostics LLC");
 expect(ok(await db.from("email_deliveries").select("id").eq("logical_key",`invitation:${id}`))).toEqual([]);
 expect(ok(await db.from("advertiser_invitations").select("delivery_id").eq("id",id).single()).delivery_id).toBeNull();
 expect(ok(await db.from("bookings").select("id").eq("edition_id",edition))).toEqual([]);
});

test("a price change invalidates the preview and a pause or closure cannot be bypassed by an invitation",async()=>{
 const id=ok(await admin.rpc("admin_create_invitation",{p_edition:edition,p_slot:slot,p_email:"interested@example.com"}));const offer=(await invitationOffer(db,id))!;
 ok(await admin.rpc("admin_update_campaign",{p_id:edition,p:{name:"Evidence fixture",unit_price_cents:39900,target_quantity:5000}}));
 await expect(queueInvitation(db,id,invitationFingerprint(offer))).rejects.toThrow("changed");expect((await invitationOffer(db,id))?.priceCents).toBe(39900);
 ok(await admin.rpc("admin_set_campaign_status",{p_id:edition,p_action:"pause"}));expect(await invitationOffer(db,id)).toBeNull();
 ok(await admin.rpc("admin_set_campaign_status",{p_id:edition,p_action:"resume"}));expect(await invitationOffer(db,id)).not.toBeNull();
 ok(await admin.rpc("admin_set_campaign_status",{p_id:edition,p_action:"close"}));expect(await invitationOffer(db,id)).toBeNull();
 ok(await admin.rpc("admin_set_campaign_status",{p_id:edition,p_action:"open"}));
 ok(await admin.rpc("admin_update_campaign",{p_id:edition,p:{name:"Evidence fixture",unit_price_cents:100,target_quantity:5000}}));
});

test("already queued promotional invitations cannot bypass the release blocker",async()=>{
 const key=`invitation:${randomUUID()}`;
 const id=await queueDelivery(db,key,{from:"Inside914 <no-reply@inside914.com>",to:"fixture@example.com",subject:"Fixture invitation",text:"Local fixture only",html:"<p>Local fixture only</p>"});deliveries.push(id);
 const send=vi.fn(async()=>({id:"must-not-send"}));
 expect(await processDelivery(db,id,send)).toBe("failed");expect(send).not.toHaveBeenCalled();
 const row=ok(await db.from("email_deliveries").select("last_error,retry_safe").eq("id",id).single());
 expect(row).toEqual({last_error:"promotional_email_on_hold",retry_safe:false});
});
