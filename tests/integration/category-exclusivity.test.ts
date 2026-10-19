import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Database, Json } from "@/lib/supabase/database.types";
import { localLayoutFixture } from "./local-layout-fixture";

// Only fresh UUID fixtures are cleaned up. No shared catalog, Stripe calls or emails.
// These slot rectangles test claims, NOT postcard geometry or printer approval.
type Client = SupabaseClient<Database>;
type Campaign = { id: string; zone: string; slots: string[] };
const campaigns: Campaign[] = [];
const cartIds = new Set<string>();
const users: string[] = [];
const layout = `test-approved-${randomUUID()}`;
const hash = () => randomBytes(32).toString("hex");
let db: Client, anon: Client, admin: Client, customer: Client;

function ok<T>(result: { data: T; error: unknown }): T {
  expect(result.error).toBeNull();
  return result.data;
}
async function signedIn(isAdmin: boolean) {
  const email = `category-test-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const user = created.data.user!;
  users.push(user.id);
  if (isAdmin) ok(await db.from("admins").insert({ user_id: user.id }));
  const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
  return client;
}
async function campaign(enabled = true, open = true, zone?: string): Promise<Campaign> {
  const c = { id: randomUUID(), zone: zone ?? randomUUID(), slots: [randomUUID(), randomUUID(), randomUUID()] };
  campaigns.push(c);
  if (!zone) ok(await db.from("zones").insert({ id: c.zone, slug: `category-test-${c.zone}`, name: `Category test ${c.zone}`, household_count: 0 }));
  ok(await db.from("editions").insert({
    id: c.id, zone_id: c.zone, issue_month: zone ? "2098-02-01" : "2098-01-01",
    artwork_deadline: "2097-12-15T23:59:00Z", status: "draft", layout_template: layout,
    unit_price_cents: 50000, double_unit_price_cents: 90000,
  }));
  ok(await db.from("slots").insert(c.slots.map((id, i) => ({
    id, edition_id: c.id, side: "front", label: `F${i + 1}`, x_in: i * 2, y_in: 0, width_in: 2, height_in: 2,
  }))));
  if (enabled) expect(ok(await admin.rpc("admin_enable_campaign_categories", { p_edition_id: c.id }))).toBe("done");
  if (open) ok(await db.from("editions").update({ status: "open" }).eq("id", c.id));
  return c;
}
function selection(cs: Campaign[], slot = 0) {
  return cs.map(c => ({ edition_id: c.id, slot_ids: [c.slots[slot]], mode: "standard", token_hash: hash() }));
}
async function hold(cs: Campaign[], category = "plumbing", slot = 0, client = db) {
  const result = await client.rpc("hold_category_cart", {
    p_category_id: category, p_token_hash: hash(), p_pricing_mode: "test", p_items: selection(cs, slot),
  });
  if (result.data) cartIds.add(result.data);
  return result;
}
async function bookings(cart: string) {
  return ok(await db.from("bookings").select("*").eq("cart_id", cart).order("id"))!;
}
async function occupancy(c: Campaign, category = "plumbing") {
  return ok(await anon.from("category_availability").select("*").eq("edition_id", c.id).eq("category_id", category).maybeSingle());
}

beforeAll(async () => {
  db = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  anon = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  localLayoutFixture(layout);
  admin = await signedIn(true);
  customer = await signedIn(false);
});
afterEach(async () => {
  if (!campaigns.length) return;
  const ids = campaigns.map(c => c.id);
  const members = ok(await db.from("bookings").select("cart_id").in("edition_id", ids))!;
  for (const b of members) if (b.cart_id) cartIds.add(b.cart_id);
  ok(await db.from("bookings").delete().in("edition_id", ids));
  if (cartIds.size) ok(await db.from("reservation_carts").delete().in("id", [...cartIds]));
  ok(await db.from("editions").delete().in("id", ids));
  ok(await db.from("zones").delete().in("id", [...new Set(campaigns.map(c => c.zone))]));
  ok(await db.from("admin_events").delete().eq("admin_user_id", users[0]));
  campaigns.length = 0;
  cartIds.clear();
});
afterAll(async () => {
  await admin?.auth.signOut();
  await customer?.auth.signOut();
  for (const id of users) expect((await db.auth.admin.deleteUser(id)).error).toBeNull();
  localLayoutFixture(layout, true);
});

test("canonical catalog is readable but clients cannot edit it or acquire claims", async () => {
  const rows = ok(await anon.from("advertising_categories").select("*"))!;
  expect(rows).toHaveLength(12);
  expect(rows.map(r => r.id)).toEqual(expect.arrayContaining(["plumbing", "hvac", "real-estate", "pet-care", "pest-control"]));
  for (const client of [anon, customer, admin]) {
    expect((await client.from("advertising_categories").insert({ id: "not-allowed", name: "Not allowed" })).error).not.toBeNull();
    expect((await client.rpc("hold_category_cart", { p_category_id: "plumbing", p_token_hash: hash(), p_items: [], p_pricing_mode: "test" })).error?.code).toBe("42501");
  }
});

test("only admins enable unused drafts; the change is audited and cannot be switched off", async () => {
  const c = await campaign(false, false);
  expect((await anon.rpc("admin_enable_campaign_categories", { p_edition_id: c.id })).error).not.toBeNull();
  expect((await customer.rpc("admin_enable_campaign_categories", { p_edition_id: c.id })).error).not.toBeNull();
  expect(ok(await admin.rpc("admin_enable_campaign_categories", { p_edition_id: c.id }))).toBe("done");
  expect(ok(await admin.rpc("admin_enable_campaign_categories", { p_edition_id: c.id }))).toBe("already");
  expect(ok(await admin.from("admin_events").select("id").eq("target_id", c.id).eq("event_type", "campaign.categories_enabled"))).toHaveLength(1);
  expect((await db.from("editions").update({ category_exclusivity: false }).eq("id", c.id)).error?.code).toBe("CAT01");
  const open = await campaign(false);
  expect((await admin.rpc("admin_enable_campaign_categories", { p_edition_id: open.id })).error?.code).toBe("CAT01");
  const used = await campaign(false, false);
  ok(await db.from("bookings").insert({ edition_id: used.id, size: "standard", price_cents: 50000, hold_token_hash: hash(), hold_expires_at: "2099-01-01" }));
  expect((await admin.rpc("admin_enable_campaign_categories", { p_edition_id: used.id })).error?.code).toBe("CAT01");
});

test("one category can reserve four areas atomically without an advertiser account", async () => {
  const cs: Campaign[] = [];
  for (let i = 0; i < 4; i++) cs.push(await campaign());
  const members = await bookings(ok(await hold(cs))!);
  expect(members).toHaveLength(4);
  expect(members.every(b => b.category_id === "plumbing" && b.status === "pending")).toBe(true);
  expect(new Set(members.map(b => b.edition_id)).size).toBe(4);
  expect(ok(await db.from("advertiser_bookings").select("booking_id").in("booking_id", members.map(b => b.id)))).toEqual([]);
  for (const c of cs) expect((await occupancy(c))?.occupancy).toBe("held");
});

test("simultaneous same-category requests for different slots cannot duplicate a claim", async () => {
  const c = await campaign();
  const results = await Promise.all([hold([c], "plumbing", 0), hold([c], "plumbing", 1)]);
  expect(results.filter(r => !r.error)).toHaveLength(1);
  expect(results.find(r => r.error)?.error?.code).toBe("CAT05");
  expect(ok(await db.from("bookings").select("id").eq("edition_id", c.id))).toHaveLength(1);
});

test("reverse-order multi-area requests serialize without deadlock or partial claims", async () => {
  const a = await campaign(), b = await campaign();
  const results = await Promise.all([hold([a, b], "hvac", 0), hold([b, a], "hvac", 1)]);
  expect(results.filter(r => !r.error)).toHaveLength(1);
  expect(results.find(r => r.error)?.error?.code).toBe("CAT05");
  expect(ok(await db.from("bookings").select("id").in("edition_id", [a.id, b.id]))).toHaveLength(2);
});

test("different categories racing for one slot cannot oversell inventory", async () => {
  const c = await campaign();
  const results = await Promise.all([hold([c], "plumbing"), hold([c], "hvac")]);
  expect(results.filter(r => !r.error)).toHaveLength(1);
  expect(results.find(r => r.error)?.error?.code).toBe("INS03");
  expect(ok(await db.from("bookings").select("id").eq("edition_id", c.id))).toHaveLength(1);
});

test("the database index rejects direct duplicate writes independently of the hold RPC", async () => {
  const c = await campaign();
  const first = (await bookings(ok(await hold([c]))!))[0];
  const duplicate = await db.from("bookings").insert({ edition_id: c.id, category_id: first.category_id, size: "standard", price_cents: 50000, hold_token_hash: hash(), hold_expires_at: "2099-01-01" });
  expect(duplicate.error?.code).toBe("23505");
  expect(duplicate.error?.message).toContain("bookings_one_active_category");
});

test("a conflict in one area rolls back every new hold and reservation cart", async () => {
  const a = await campaign(), b = await campaign();
  ok(await hold([b], "hvac"));
  const before = ok(await db.from("reservation_carts").select("id"))!.map(r => r.id).sort();
  expect((await hold([a, b], "plumbing")).error?.code).toBe("INS03");
  expect(ok(await db.from("bookings").select("id").eq("edition_id", a.id))).toEqual([]);
  expect(ok(await db.from("reservation_carts").select("id"))!.map(r => r.id).sort()).toEqual(before);
  expect((await hold([a, b], "hvac", 1)).error?.code).toBe("CAT05");
  expect((await occupancy(a, "hvac"))?.occupancy).toBe("available");
});

test("expired categories can be claimed on another slot and release the old slot", async () => {
  const c = await campaign();
  const first = (await bookings(ok(await hold([c]))!))[0];
  ok(await db.from("bookings").update({ hold_expires_at: "2000-01-01" }).eq("id", first.id));
  expect((await occupancy(c))?.occupancy).toBe("available");
  ok(await hold([c], "plumbing", 1));
  expect(ok(await db.from("bookings").select("status").eq("id", first.id).single())!.status).toBe("released");
  expect(ok(await db.from("booking_slots").select("released_at").eq("booking_id", first.id).single())!.released_at).not.toBeNull();
  ok(await hold([c], "hvac", 0));
});

test("canceling one zone frees only its category; ended bookings cannot reclaim it", async () => {
  const a = await campaign(), b = await campaign();
  const members = await bookings(ok(await hold([a, b]))!);
  const first = members.find(m => m.edition_id === a.id)!;
  expect(ok(await admin.rpc("admin_cancel_booking", { p_booking_id: first.id, p_reason: "Synthetic test cancellation" }))).toBe("done");
  expect((await occupancy(a))?.occupancy).toBe("available");
  expect((await occupancy(b))?.occupancy).toBe("held");
  ok(await hold([a]));
  expect((await db.from("bookings").update({ status: "pending" }).eq("id", first.id)).error?.code).toBe("CAT02");
});

test("legacy hold paths cannot bypass enabled campaigns; legacy campaigns still work", async () => {
  const c = await campaign();
  const missing = await db.rpc("hold_cart", { p_token_hash: hash(), p_items: selection([c]), p_pricing_mode: "test" });
  if (missing.data) cartIds.add(missing.data);
  expect(missing.error?.code).toBe("CAT03");
  expect(ok(await db.from("bookings").select("id").eq("edition_id", c.id))).toEqual([]);
  const legacy = await campaign(false);
  const old = ok(await db.rpc("hold_cart", { p_token_hash: hash(), p_items: selection([legacy]), p_pricing_mode: "test" }))!;
  cartIds.add(old);
  expect((await bookings(old))[0].category_id).toBeNull();
  expect((await hold([legacy], "plumbing", 1)).error?.code).toBe("CAT03");
});

test("only normalized catalog IDs and distinct areas are accepted", async () => {
  const c = await campaign();
  for (const category of ["Plumbing", " plumbing ", "anything-custom"]) expect((await hold([c], category)).error?.code).toBe("CAT04");
  expect((await hold([c, c])).error).not.toBeNull();
  const other = await campaign(true, true, c.zone);
  expect((await hold([c, other])).error?.code).toBe("INS04");
  expect(ok(await db.from("bookings").select("id").in("edition_id", [c.id, other.id]))).toEqual([]);
});

test("availability exposes no advertiser details or private draft campaigns", async () => {
  const draft = await campaign(true, false);
  expect(await occupancy(draft)).toBeNull();
  const c = await campaign();
  ok(await hold([c]));
  const row = await occupancy(c);
  expect(Object.keys(row!).sort()).toEqual(["category_id", "category_name", "edition_id", "occupancy", "zone_id"]);
  expect((await anon.from("bookings").select("id")).error).not.toBeNull();
  expect(ok(await customer.from("bookings").select("id").eq("edition_id", c.id))).toEqual([]);
  ok(await db.from("editions").update({ reservations_paused_at: new Date().toISOString() }).eq("id", c.id));
  expect((await occupancy(c))?.occupancy).toBe("closed");
});

test("confirmation preserves category claims and category identity cannot change afterward", async () => {
  const c = await campaign();
  const cart = ok(await hold([c]))!;
  const member = (await bookings(cart))[0];
  const setup = `seti_category_${randomUUID()}`;
  ok(await db.from("bookings").update({ stripe_setup_intent_id: setup, stripe_customer_id: "cus_category_test" }).eq("id", member.id));
  const args = { p_cart_id: cart, p_setup_intent_id: setup, p_payment_method_id: "pm_category_test", p_references: { [member.id]: "IN914-CATGRY" } as Json };
  expect(ok(await db.rpc("confirm_cart", args))).toBe("artwork_missing");
  ok(await db.from("booking_artwork").insert({ booking_id: member.id, storage_path: `${member.id}/${randomUUID()}`, status: "ready", crop_x: 0, crop_y: 0, crop_width: 1000, crop_height: 1000, width_px: 1000, height_px: 1000, content_type: "image/png", byte_size: 10000, zoom: 1 }));
  ok(await db.from("booking_contacts").insert({ booking_id: member.id, business_name: "Category fixture", contact_name: "Test", email: "category@example.com", phone: "+19145550123" }));
  expect(ok(await db.rpc("confirm_cart", args))).toBe("consent_missing");
  ok(await db.from("payment_consents").insert({ booking_id: member.id, edition_id: c.id, stripe_setup_intent_id: setup, amount_cents: member.price_cents, pricing_mode: member.pricing_mode, terms_version: "category-fixture" }));
  expect(ok(await db.rpc("confirm_cart", args))).toBe("confirmed");
  expect((await occupancy(c))?.occupancy).toBe("reserved");
  for (const category_id of [null, "hvac"]) expect((await db.from("bookings").update({ category_id }).eq("id", member.id)).error?.code).toBe("CAT02");
  expect((await hold([c], "plumbing", 1)).error?.code).toBe("CAT05");
  expect(ok(await db.rpc("confirm_cart", args))).toBe("already_confirmed");
});
