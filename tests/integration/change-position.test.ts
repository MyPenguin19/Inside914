import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, afterEach, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
vi.mock("server-only", () => ({}));
const { createCart, ownedCart } = await import("@/lib/booking/cart");
const { changePosition } = await import("@/lib/booking/change-position");
const { hashHoldToken } = await import("@/lib/booking/hold-token");
const db = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const admin = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const anon = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const editions: string[] = [], zones: string[] = [], carts: string[] = [];
const slots: Record<string, string>[] = [];
let user = "";
function ok<R extends { data: unknown; error: unknown }>(r: R): NonNullable<R["data"]> { expect(r.error).toBeNull(); return r.data as NonNullable<R["data"]>; }
beforeAll(async () => {
  const email = `change-position-${randomUUID()}@example.com`, password = randomBytes(24).toString("hex");
  user = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user!.id;
  ok(await db.from("admins").insert({ user_id: user }));
  ok(await admin.auth.signInWithPassword({ email, password }));
  for (let i = 0; i < 2; i++) {
    const zone = randomUUID(); zones.push(zone);
    ok(await db.from("zones").insert({ id: zone, name: `Change position ${i}`, slug: `change-${zone}`, household_count: 0 }));
    const edition = ok(await admin.rpc("admin_create_square_campaign", { p: {
      zone_id: zone, name: `Change position ${i}`, issue_month: "2098-01-01", target_quantity: 5000,
      reservation_deadline: "2097-12-15T23:59:00Z", artwork_due_at: "2097-12-20T23:59:00Z",
      mailing_window_start: "2098-01-11", mailing_window_end: "2098-01-15",
      layout_template: i === 0 ? "amazingmail-9x6-ten-square-draft" : "amazingmail-9x6-v2",
      unit_price_cents: i === 0 ? 100 : 39900, back_unit_price_cents: i === 0 ? 75 : 34900, double_price_cents: null,
    } }));
    editions.push(edition);
    ok(await admin.rpc("admin_set_campaign_status", { p_id: edition, p_action: "open" }));
    slots.push(Object.fromEntries(ok(await db.from("slots").select("id,label").eq("edition_id", edition)).map(s => [s.label, s.id])));
  }
});
afterEach(async () => {
  ok(await db.from("bookings").delete().in("edition_id", editions));
  if (carts.length) ok(await db.from("reservation_carts").delete().in("id", carts.splice(0)));
  ok(await db.from("editions").update({ status: "open", reservations_paused_at: null, artwork_deadline: "2097-12-15T23:59:00Z" }).in("id", editions));
  ok(await db.from("slots").update({ blocked_at: null }).in("edition_id", editions));
});
afterAll(async () => {
  deleteLocalCampaignFixtures(editions);
  ok(await db.from("zones").delete().in("id", zones));
  ok(await db.from("admin_events").delete().eq("admin_user_id", user));
  await admin.auth.signOut(); ok(await db.auth.admin.deleteUser(user));
});
async function held(label = "F1", indices = [0, 1]) {
  const c = await createCart(db, indices.map(i => ({ editionId: editions[i], slotIds: [slots[i][label]], mode: "standard" })));
  carts.push(c.id);
  return { ...c, members: (await ownedCart(db, c.token))!.members };
}
async function claim(bookingId: string) {
  return ok(await db.from("booking_slots").select("slot_id").eq("booking_id", bookingId).is("released_at", null).single()).slot_id;
}
function args(c: Awaited<ReturnType<typeof held>>, target = "B2", i = 0, current = "F1") {
  return { p_cart_hash: hashHoldToken(c.token), p_booking_id: c.members.find(b => b.editionId === editions[i])!.id, p_expected_slot: slots[i][current], p_slot_id: slots[i][target] };
}
test("moves either layout front/back in place; updates tier price and retains timer, artwork, contact and other areas", async () => {
  const c = await held();
  ok(await db.from("booking_artwork").insert(c.members.map(b => ({ booking_id: b.id, storage_path: `${b.id}/fixture.png`, status: "ready", content_type: "image/png", width_px: 1000, height_px: 1000, byte_size: 10000, crop_x: 0, crop_y: 0, crop_width: 1000, crop_height: 1000, zoom: 1 }))));
  ok(await db.from("booking_contacts").insert(c.members.map(b => ({ booking_id: b.id, business_name: "Fixture", contact_name: "Fixture", email: "fixture@example.com", phone: "+19145551234" }))));
  const before = ok(await db.from("bookings").select("*").eq("cart_id", c.id).order("id"));
  const art = ok(await db.from("booking_artwork").select("*").in("booking_id", c.members.map(b => b.id)).order("booking_id"));
  const contact = ok(await db.from("booking_contacts").select("*").in("booking_id", c.members.map(b => b.id)).order("booking_id"));
  for (const i of [0, 1]) {
    const a = args(c, "B2", i);
    expect(await changePosition(db, c.token, { bookingId: a.p_booking_id, currentSlotId: a.p_expected_slot, slotId: a.p_slot_id })).toMatchObject({ ok: true });
    expect(await claim(a.p_booking_id)).toBe(slots[i].B2);
    expect(ok(await db.from("slot_availability").select("available").eq("slot_id", slots[i].F1).single()).available).toBe(true);
    const other = c.members.find(b => b.editionId !== editions[i])!;
    expect(await claim(other.id)).toBe(i === 0 ? slots[1].F1 : slots[0].B2);
  }
  expect(ok(await db.from("bookings").select("*").eq("cart_id", c.id).order("id"))).toEqual(before.map(b => ({...b, price_side:"back", price_cents:b.back_price_cents})));
  expect(ok(await db.from("booking_artwork").select("*").in("booking_id", c.members.map(b => b.id)).order("booking_id"))).toEqual(art);
  expect(ok(await db.from("booking_contacts").select("*").in("booking_id", c.members.map(b => b.id)).order("booking_id"))).toEqual(contact);
  expect(ok(await db.rpc("change_cart_position", args(c, "F1", 0, "B2")))).toBe("changed");
});
test("requires service role, owning cart token, valid IDs and the same campaign", async () => {
  const c = await held(), other = await held("F2"), a = args(c);
  for (const client of [anon, admin]) expect((await client.rpc("change_cart_position", a)).error).not.toBeNull();
  expect((await db.rpc("change_cart_position", { ...a, p_cart_hash: hashHoldToken(other.token) })).error?.message).toBe("hold_unavailable");
  expect((await db.rpc("change_cart_position", { ...a, p_slot_id: slots[1].B2 })).error?.message).toBe("invalid_selection");
  expect((await db.rpc("change_cart_position", { ...a, p_slot_id: randomUUID() })).error?.message).toBe("invalid_selection");
  expect(await changePosition(db, other.token, { bookingId: a.p_booking_id, currentSlotId: a.p_expected_slot, slotId: a.p_slot_id })).toMatchObject({ ok: false });
  expect(await changePosition(db, c.token, { bookingId: "bad" })).toMatchObject({ ok: false });
  expect(await claim(a.p_booking_id)).toBe(a.p_expected_slot);
});
test("unavailable or blocked targets leave the current space held", async () => {
  const c = await held(), other = await held("B2"), a = args(c);
  expect((await db.rpc("change_cart_position", a)).error?.code).toBe("INS03");
  expect(await claim(a.p_booking_id)).toBe(slots[0].F1);
  expect(await claim(other.members.find(b => b.editionId === editions[0])!.id)).toBe(slots[0].B2);
  ok(await db.from("slots").update({ blocked_at: new Date().toISOString() }).eq("id", slots[0].B3));
  expect((await db.rpc("change_cart_position", args(c, "B3"))).error?.code).toBe("INS03");
  expect(await claim(a.p_booking_id)).toBe(slots[0].F1);
});
test("expired target holds can be reclaimed without extending the changing hold", async () => {
  const c = await held(), other = await held("B2"), a = args(c);
  ok(await db.from("bookings").update({ hold_expires_at: new Date(0).toISOString() }).eq("cart_id", other.id));
  expect(ok(await db.rpc("change_cart_position", a))).toBe("changed");
  expect(await claim(a.p_booking_id)).toBe(slots[0].B2);
  expect((await ownedCart(db, c.token))!.members.map(b => b.holdExpiresAt)).toEqual(c.members.map(b => b.holdExpiresAt));
});
test("closed, paused and expired campaigns cannot accept changes", async () => {
  const c = await held(), a = args(c);
  for (const patch of [{ status: "closed" }, { reservations_paused_at: new Date().toISOString() }, { artwork_deadline: new Date(0).toISOString() }]) {
    ok(await db.from("editions").update(patch).eq("id", editions[0]));
    expect((await db.rpc("change_cart_position", a)).error?.message).toBe("edition_closed");
    expect(await claim(a.p_booking_id)).toBe(slots[0].F1);
    ok(await db.from("editions").update({ status: "open", reservations_paused_at: null, artwork_deadline: "2097-12-15T23:59:00Z" }).eq("id", editions[0]));
  }
});
test("expired, released and confirmed bookings cannot be moved or revived", async () => {
  const c = await held(), a = args(c);
  ok(await db.from("booking_artwork").insert(c.members.map(b => ({ booking_id: b.id, storage_path: `${b.id}/fixture.png`, status: "ready", content_type: "image/png", width_px: 1000, height_px: 1000, byte_size: 10000, crop_x: 0, crop_y: 0, crop_width: 1000, crop_height: 1000, zoom: 1 }))));
  ok(await db.from("bookings").update({ hold_expires_at: new Date(0).toISOString() }).eq("id", a.p_booking_id));
  expect((await db.rpc("change_cart_position", a)).error?.message).toBe("hold_unavailable");
  ok(await db.from("bookings").update({ hold_expires_at: null, status: "reserved", confirmed_at: new Date().toISOString(),
    reference: `IN914-${randomBytes(3).toString("hex").toUpperCase().replace(/[01IO]/g, "Z")}`, stripe_payment_method_id: `pm_devtest_${randomUUID()}` }).eq("id", a.p_booking_id));
  expect((await db.rpc("change_cart_position", a)).error?.message).toBe("hold_unavailable");
  expect(await claim(a.p_booking_id)).toBe(slots[0].F1);
  const second = c.members.find(b => b.editionId === editions[1])!;
  ok(await db.from("bookings").update({ status: "released" }).eq("id", second.id));
  expect((await db.rpc("change_cart_position", args(c, "B2", 1))).error?.message).toBe("hold_unavailable");
});
test("competing changes have one winner; loser and stale tabs retain a valid single claim", async () => {
  const first = await held(), second = await held("F2");
  const a = args(first), b = args(second, "B2", 0, "F2");
  const results = await Promise.all([a, b].map(input => db.rpc("change_cart_position", input)));
  expect(results.filter(r => !r.error)).toHaveLength(1);
  expect(results.find(r => r.error)?.error?.code).toBe("INS03");
  for (const [index, input] of [a, b].entries()) expect(await claim(input.p_booking_id)).toBe(results[index].error ? input.p_expected_slot : input.p_slot_id);
  const c = args(first, "B3", 1), d = args(first, "B4", 1);
  const sameBooking = await Promise.all([c, d].map(input => db.rpc("change_cart_position", input)));
  expect(sameBooking.filter(r => !r.error)).toHaveLength(1);
  expect(sameBooking.find(r => r.error)?.error?.message).toBe("position_changed");
  const winner = sameBooking[0].error ? d : c;
  expect(await claim(winner.p_booking_id)).toBe(winner.p_slot_id);
  expect(ok(await db.rpc("change_cart_position", { ...winner, p_expected_slot: winner.p_slot_id }))).toBe("unchanged");
});


test("both tiers are authoritative; existing holds keep their frozen prices after admin changes", async () => {
 const c=await held("F1",[1]), b=c.members[0];
 expect(b.priceCents).toBe(39900);
 const back=await held("B1",[1]); expect(back.members[0].priceCents).toBe(34900);
 const slotPrice=ok(await db.from("slot_availability").select("unit_price_cents").eq("slot_id",slots[1].B1).single());
 expect(slotPrice.unit_price_cents).toBe(34900);
 for(const [slot,price] of [[slots[1].F2,34900],[slots[1].B2,39900]] as const) {
  expect((await db.rpc("hold_slots",{p_slot_ids:[slot],p_token_hash:randomBytes(32).toString("hex"),p_pricing_mode:"launch",p_unit_price_cents:price,p_double_price_cents:null})).error?.code).toBe("INS05");
 }
 expect((await db.from("bookings").update({price_cents:1}).eq("id",b.id)).error?.message).toBe("agreed_price_is_immutable");
 expect((await db.from("bookings").update({back_price_cents:1}).eq("id",b.id)).error?.message).toBe("agreed_price_is_immutable");
 try {
  ok(await admin.rpc("admin_update_campaign",{p_id:editions[1],p:{unit_price_cents:44900,back_unit_price_cents:29900}}));
  expect((await ownedCart(db,c.token))!.members[0].priceCents).toBe(39900);
  ok(await db.rpc("change_cart_position",args(c,"B2",1)));
  expect((await ownedCart(db,c.token))!.members[0].priceCents).toBe(34900);
  ok(await db.rpc("change_cart_position",args(c,"F1",1,"B2")));
  expect((await ownedCart(db,c.token))!.members[0].priceCents).toBe(39900);
  const fresh=await held("B2",[1]); expect(fresh.members[0].priceCents).toBe(29900);
 } finally {ok(await admin.rpc("admin_update_campaign",{p_id:editions[1],p:{unit_price_cents:39900,back_unit_price_cents:34900}}));}
});

test("a mixed cart uses each selected side, and payment authorization freezes side changes atomically", async () => {
 const c=await held("F1",[1]), a=args(c,"B2",1);
 ok(await db.from("bookings").update({stripe_customer_id:"cus_devtest_pricing"}).eq("id",a.p_booking_id));
 expect((await db.rpc("change_cart_position",a)).error?.message).toBe("price_change_requires_new_hold");
 expect(await claim(a.p_booking_id)).toBe(slots[1].F1);
 expect((await ownedCart(db,c.token))!.members[0].priceCents).toBe(39900);
 // Moving within the same side keeps its authorized price.
 expect(ok(await db.rpc("change_cart_position",args(c,"F2",1)))).toBe("changed");
 const mixed=await createCart(db,[{editionId:editions[0],slotIds:[slots[0].F1],mode:"standard"},{editionId:editions[1],slotIds:[slots[1].B1],mode:"standard"}]);
 carts.push(mixed.id);
 expect((await ownedCart(db,mixed.token))!.members.reduce((sum,b)=>sum+b.priceCents,0)).toBe(35000);
});
