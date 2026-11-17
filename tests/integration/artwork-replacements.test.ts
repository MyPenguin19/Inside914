import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { POSTCARD_LAYOUT_V2 } from "@/lib/print/layouts";
import { AMAZINGMAIL_9X6_LAYOUT } from "@/lib/print/amazingmail-layout";
import { saveHouseArtwork, loadHouseArtwork } from "@/lib/print/house-artwork";
import { placeHold } from "@/lib/booking/place-hold";
import { hashHoldToken } from "@/lib/booking/hold-token";
import * as artwork from "@/lib/artwork/service";
import { cleanupAbandonedArtwork } from "@/lib/artwork/cleanup";
import { makeImage } from "../fixtures/images";
import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
vi.mock("server-only", () => ({}));
const url = process.env.SUPABASE_URL!;
const db = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const admin = createClient<Database>(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const anon = createClient<Database>(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const ok = <T>(r: { data: T; error: unknown }) => { expect(r.error).toBeNull(); return r.data; };
const zone = randomUUID();
let user: string, campaign: string, slot: string;
let previousHouse: Database["public"]["Tables"]["house_artwork"]["Row"] | null;
const houseIds: string[] = [];
const base = async () => ok(await db.from("house_artwork").select("updated_at").maybeSingle())?.updated_at ?? null;
const stage = async (token: string, bytes: Buffer) => {
  const ticket = await artwork.requestUpload(db, token, { byteSize: bytes.length });
  if (!ticket.ok) throw Error(ticket.reason);
  const body = new FormData(); body.append("", new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  expect((await fetch(ticket.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body })).ok).toBe(true);
  const ready = await artwork.finalizeUpload(db, token, { artworkId: ticket.artworkId });
  if (!ready.ok) throw Error(ready.reason);
  return ready.artwork;
};
const hold = async () => { const h = await placeHold(db, { slotIds: [slot] }); if (!h.ok) throw Error(h.reason); return h; };
const save = (token: string, image: artwork.ArtworkView) => artwork.saveLayout(db, token, { artworkId: image.id, crop: { x: 0, y: 0, width: image.width, height: image.height }, zoom: 1 });
const active = async (bookingId: string) => ok(await db.from("booking_artwork").select("*").eq("booking_id", bookingId).maybeSingle());

beforeAll(async () => {
  const email = `editor-${randomUUID()}@example.com`, password = randomBytes(24).toString("hex");
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull(); user = created.data.user!.id;
  ok(await db.from("admins").insert({ user_id: user }));
  expect((await admin.auth.signInWithPassword({ email, password })).error).toBeNull();
  ok(await db.from("zones").insert({ id: zone, name: `Editor ${zone}`, slug: `editor-${zone}`, household_count: 0 }));
  campaign = ok(await admin.rpc("admin_create_square_campaign", { p: {
    zone_id: zone, name: "Artwork replacement fixture", issue_month: "2098-01-01", target_quantity: 5000,
    reservation_deadline: "2097-12-16T04:59:00Z", artwork_due_at: "2097-12-21T04:59:00Z",
    mailing_window_start: "2098-01-11", mailing_window_end: "2098-01-15", layout_template: POSTCARD_LAYOUT_V2.key,
    unit_price_cents: 100, double_price_cents: null,
  } }))!;
  ok(await admin.rpc("admin_set_campaign_status", { p_id: campaign, p_action: "open" }));
  slot = ok(await db.from("slots").select("id").eq("edition_id", campaign).eq("label", "B1").single())!.id;
  previousHouse = ok(await db.from("house_artwork").select("*").maybeSingle());
});
afterEach(async () => {
  vi.restoreAllMocks();
  const ids = ok(await db.from("bookings").select("id").eq("edition_id", campaign))!.map(b => b.id);
  if (ids.length) {
    ok(await db.from("bookings").delete().in("id", ids));
    const uploads = ok(await db.from("artwork_uploads").select("storage_path").in("booking_id", ids))!;
    if (uploads.length) ok(await db.storage.from("artwork").remove(uploads.map(u => u.storage_path)));
    ok(await db.from("artwork_uploads").delete().in("booking_id", ids));
  }
});
afterAll(async () => {
  if (previousHouse) ok(await db.from("house_artwork").upsert(previousHouse));
  else ok(await db.from("house_artwork").delete().eq("updated_by", user));
  for (const id of houseIds) {
    const row = ok(await db.from("artwork_uploads").select("*").eq("id", id).maybeSingle());
    if (!row) continue;
    ok(await db.storage.from("house-artwork").remove([row.storage_path]));
    if (row.original_path) ok(await db.storage.from("house-artwork-originals").remove([row.original_path]));
    ok(await db.from("artwork_uploads").delete().eq("id", id));
  }
  deleteLocalCampaignFixtures([campaign]);
  ok(await db.from("zones").delete().eq("id", zone));
  ok(await db.from("admin_events").delete().eq("admin_user_id", user));
  await admin.auth.signOut(); expect((await db.auth.admin.deleteUser(user)).error).toBeNull();
});

test("upload and failure preserve the saved artwork; Save activates and retains exact original bytes", async () => {
  const h = await hold(), original = await makeImage("png", 1000, 1200);
  const first = await stage(h.token, original); expect(await active(h.bookingId)).toBeNull();
  expect(await save(h.token, first)).toEqual({ ok: true });
  const before = await active(h.bookingId);
  const failed = await artwork.requestUpload(db, h.token, { byteSize: 400 });
  if (!failed.ok) throw Error("ticket");
  expect(await artwork.finalizeUpload(db, h.token, { artworkId: failed.artworkId })).toEqual({ ok: false, reason: "upload_missing" });
  expect(await active(h.bookingId)).toEqual(before);
  const replacement = await stage(h.token, await makeImage("png", 1400, 900));
  expect(await active(h.bookingId)).toEqual(before);
  expect(await save(h.token, replacement)).toEqual({ ok: true });
  expect(await save(h.token, replacement)).toEqual({ ok: true }); // safe retry after a lost response
  const old = ok(await db.storage.from("artwork").download(before!.storage_path))!;
  expect(Buffer.from(await old.arrayBuffer()).equals(original)).toBe(true);
  expect(ok(await db.from("artwork_uploads").select("status").eq("id", first.id).single())!.status).toBe("retained");
  expect((await artwork.getArtwork(db, h.bookingId))?.id).toBe(replacement.id);
});

test("concurrent replacements cannot silently overwrite a more recent save", async () => {
  const h = await hold(), bytes = await makeImage("png", 900, 900);
  const [a,b] = await Promise.all([stage(h.token, bytes), stage(h.token, bytes)]);
  const result = await Promise.all([save(h.token,a), save(h.token,b)]);
  expect(result.filter(r=>r.ok)).toHaveLength(1);
  expect(result.find(r=>!r.ok)).toEqual({ok:false,reason:"artwork_changed"});
});

test("both service and database reject a V2 crop without explicit approval; Fit needs none", async () => {
  const h=await hold(), image=await stage(h.token,await makeImage("png",1000,1000));
  const crop={x:100,y:100,width:700,height:800};
  const input={artworkId:image.id,crop,zoom:1.2};
  expect(await artwork.saveLayout(db,h.token,input)).toEqual({ok:false,reason:"crop_approval_required"});
  expect((await db.rpc("save_staged_artwork",{p_token_hash:hashHoldToken(h.token),p_upload_id:image.id,p_crop:crop,p_zoom:1.2})).error?.code).toBe("ART02");
  expect(await artwork.saveLayout(db,h.token,{...input,cropApproved:true})).toEqual({ok:true});
  expect(await save(h.token,image)).toEqual({ok:true});
  expect(await active(h.bookingId)).toMatchObject({crop_x:0,crop_y:0,crop_width:1000,crop_height:1000});
});

test("expiry during a replacement prevents commit and retains the previous source and accepted price", async () => {
  const h=await hold(), first=await stage(h.token,await makeImage("png",900,900));
  expect(await save(h.token,first)).toEqual({ok:true}); const before=await active(h.bookingId);
  const next=await stage(h.token,await makeImage("png",1200,900));
  ok(await db.from("bookings").update({hold_expires_at:new Date(Date.now()-1000).toISOString()}).eq("id",h.bookingId));
  expect(await save(h.token,next)).toEqual({ok:false,reason:"hold_expired"});
  expect((await db.rpc("save_staged_artwork",{p_token_hash:hashHoldToken(h.token),p_upload_id:next.id,p_crop:{x:0,y:0,width:1200,height:900},p_zoom:1})).error?.code).toBe("INS06");
  expect(await active(h.bookingId)).toEqual(before);
  expect(ok(await db.from("bookings").select("price_cents,stripe_setup_intent_id,stripe_customer_id").eq("id",h.bookingId).single())).toMatchObject({price_cents:h.priceCents,stripe_setup_intent_id:null,stripe_customer_id:null});
});

test("cleanup removes only old never-saved stages, keeps retained and current originals, and cannot race activation", async () => {
  const h=await hold(), first=await stage(h.token,await makeImage("png",900,900));
  expect(await save(h.token,first)).toEqual({ok:true});
  const old=await stage(h.token,await makeImage("png",1000,1000)), recent=await stage(h.token,await makeImage("png",1100,1100));
  ok(await db.from("artwork_uploads").update({created_at:"2020-01-01T00:00:00Z"}).in("id",[first.id,old.id]));
  const claimed=ok(await db.rpc("claim_abandoned_artwork"))!;
  expect(claimed.map(u=>u.id)).toContain(old.id); expect(claimed.map(u=>u.id)).not.toContain(first.id);
  expect((await save(h.token,old)).ok).toBe(false);
  const result=await cleanupAbandonedArtwork(db); expect(result.removed).toBeGreaterThan(0);
  expect((await db.from("artwork_uploads").select("id").eq("id",old.id).maybeSingle()).data).toBeNull();
  for(const image of [first,recent]) expect((await fetch(image.viewUrl)).status).toBe(200);
});

async function saveHouse(bytes:Buffer, stamp:string|null, layout=POSTCARD_LAYOUT_V2) {
  const crop={x:0,y:0,width:1500,height:Math.round(1500*layout.housePanel.height/layout.housePanel.width)};
  const before=ok(await db.from("artwork_uploads").select("id").eq("bucket","house-artwork"))!.map(r=>r.id);
  try { return await saveHouseArtwork(db,admin,bytes,crop,layout,stamp); }
  finally { for(const r of ok(await db.from("artwork_uploads").select("id").eq("bucket","house-artwork"))!) if(!before.includes(r.id))houseIds.push(r.id); }
}

test("house save retains untouched source plus verified derivative, and the renderer loads the new version", async () => {
  const bytes=await makeImage("jpeg",2000,1600);
  const result=await saveHouse(bytes,await base());
  expect(result).toMatchObject({ok:true,width:2990,height:1986});
  const row=ok(await db.from("artwork_uploads").select("*").eq("id",houseIds.at(-1)!).single())!;
  expect(row.status).toBe("retained");
  const original=ok(await db.storage.from("house-artwork-originals").download(row.original_path!))!;
  expect(Buffer.from(await original.arrayBuffer()).equals(bytes)).toBe(true);
  const derivative=ok(await db.storage.from("house-artwork").download(row.storage_path))!;
  expect((await loadHouseArtwork(admin))?.equals(Buffer.from(await derivative.arrayBuffer()))).toBe(true);
});

test("house save preserves V1 derivative compatibility without changing any campaign layout", async () => {
  const result=await saveHouse(await makeImage("png",2000,1600),await base(),AMAZINGMAIL_9X6_LAYOUT);
  expect(result).toMatchObject({ok:true,width:2990,height:2086});
  expect(await loadHouseArtwork(admin)).toBeDefined();
  expect(ok(await db.from("editions").select("layout_template").eq("id",campaign).single())!.layout_template).toBe(POSTCARD_LAYOUT_V2.key);
});

test("too-small source is rejected; interrupted house upload preserves the active file and original", async () => {
  const before=ok(await db.from("house_artwork").select("*").single());
  await expect(saveHouse(await makeImage("png",495,619),await base())).rejects.toThrow(/valid house crop/);
  const from=db.storage.from.bind(db.storage);
  vi.spyOn(db.storage,"from").mockImplementation(bucket=>{
    const client=from(bucket);
    if(bucket==="house-artwork") vi.spyOn(client,"upload").mockResolvedValue({data:null,error:{message:"Fixture upload failed",name:"StorageError"} as never});
    return client;
  });
  await expect(saveHouse(await makeImage("png",2000,1600),await base())).rejects.toThrow(/saved image is unchanged/);
  expect(ok(await db.from("house_artwork").select("*").single())).toEqual(before);
});

test("a failed read-back or stale Settings save cannot replace the active house file", async () => {
  const before=ok(await db.from("house_artwork").select("*").single())!;
  const from=db.storage.from.bind(db.storage);
  const spy=vi.spyOn(db.storage,"from").mockImplementation(bucket=>{
    const client=from(bucket);
    if(bucket==="house-artwork") vi.spyOn(client,"download").mockResolvedValue({data:null,error:{message:"Fixture unavailable",name:"StorageError"} as never});
    return client;
  });
  await expect(saveHouse(await makeImage("png",2000,1600),before.updated_at)).rejects.toThrow(/Could not verify/);
  expect(ok(await db.from("house_artwork").select("*").single())).toEqual(before);
  spy.mockRestore();
  await expect(saveHouse(await makeImage("png",2000,1600),"2000-01-01T00:00:00Z")).rejects.toThrow(/changed in another window/);
  expect(ok(await db.from("house_artwork").select("*").single())).toEqual(before);
});

test("anonymous visitors cannot read sources, list upload metadata, activate files or run cleanup", async () => {
  expect((await anon.from("artwork_uploads").select("*")).error).not.toBeNull();
  expect((await anon.rpc("claim_abandoned_artwork")).error).not.toBeNull();
  expect((await anon.rpc("admin_activate_house_artwork",{p_upload_id:houseIds[0]})).error).not.toBeNull();
  expect((await anon.storage.from("house-artwork-originals").list("house")).data??[]).toEqual([]);
  const row=ok(await db.from("artwork_uploads").select("original_path").eq("id",houseIds[0]).single())!;
  expect((await anon.storage.from("house-artwork-originals").download(row.original_path!)).data).toBeNull();
});

test("cleanup retries failed Storage removals without losing its record", async () => {
  const h=await hold(), image=await stage(h.token,await makeImage("png",900,900));
  ok(await db.from("artwork_uploads").update({created_at:"2020-01-01T00:00:00Z"}).eq("id",image.id));
  const from=db.storage.from.bind(db.storage);
  const spy=vi.spyOn(db.storage,"from").mockImplementation(bucket=>{
    const client=from(bucket);
    vi.spyOn(client,"remove").mockResolvedValue({data:null,error:{message:"Fixture unavailable",name:"StorageError"} as never});
    return client;
  });
  expect((await cleanupAbandonedArtwork(db)).removed).toBe(0);
  expect(ok(await db.from("artwork_uploads").select("status").eq("id",image.id).single())!.status).toBe("deleting");
  expect((await fetch(image.viewUrl)).ok).toBe(true);
  spy.mockRestore();expect((await cleanupAbandonedArtwork(db)).removed).toBe(1);
  expect((await db.from("artwork_uploads").select("id").eq("id",image.id).maybeSingle()).data).toBeNull();
});

test("a signed-in non-admin cannot read retained sources or activate a house version", async () => {
  const email=`viewer-${randomUUID()}@example.com`,password=randomBytes(24).toString("hex");
  const created=await db.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();
  const viewer=createClient<Database>(url,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  try {
    expect((await viewer.auth.signInWithPassword({email,password})).error).toBeNull();
    expect(ok(await viewer.from("artwork_uploads").select("id"))).toEqual([]);
    expect((await viewer.rpc("admin_activate_house_artwork",{p_upload_id:houseIds[0]})).error).not.toBeNull();
    expect((await viewer.rpc("claim_abandoned_artwork")).error).not.toBeNull();
    expect((await viewer.storage.from("house-artwork-originals").list("house")).data??[]).toEqual([]);
  } finally {await viewer.auth.signOut();expect((await db.auth.admin.deleteUser(created.data.user!.id)).error).toBeNull();}
});
