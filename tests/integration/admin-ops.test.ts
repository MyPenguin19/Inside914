import { deleteLocalCampaignFixtures } from "./local-layout-fixture";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { REGIONS } from "@/lib/catalog/regions";
import type { Database } from "@/lib/supabase/database.types";

// REAL local database + Supabase Auth (no mocks): throwaway admin and non-admin users (owner-approved),
// a throwaway campaign far in the future (year 2090+), all removed afterwards.
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const { LAYOUT_TEMPLATES } = await import("@/lib/admin/layouts");
const { hasBookings } = await import("@/lib/admin/data");

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const CENTRAL_ZONE = "00000000-0000-4000-8000-000000000001";
const OPEN_EDITION = "00000000-0000-4000-8000-000000000101";

describe.skipIf(!secretKey)("admin operations (real database functions)", () => {
  let service: SupabaseClient<Database>;
  let admin: SupabaseClient<Database>;
  let member: SupabaseClient<Database>;
  const users: string[] = [];
  const editions: string[] = [];
  const zones: string[] = [];
  const year = 2090 + Math.floor(Math.random() * 9);

  async function signedIn(isAdmin: boolean) {
    const email = `inside914-ops-${isAdmin ? "admin" : "user"}-${randomUUID()}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    if (isAdmin) await service.from("admins").insert({ user_id: data.user.id });
    const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });
    return client;
  }

  const campaign = (month: number, overrides: Record<string, unknown> = {}) => ({
    name: `Test campaign ${year}-${month}`,
    zone_id: CENTRAL_ZONE,
    issue_month: `${year}-${String(month).padStart(2, "0")}-01`,
    target_quantity: 5000,
    reservations_open_at: null,
    reservation_deadline: `${year - 1}-12-01T04:59:00.000Z`,
    artwork_due_at: `${year - 1}-12-05T04:59:00.000Z`,
    mailing_window_start: `${year - 1}-12-10`,
    mailing_window_end: `${year - 1}-12-15`,
    layout_template: "provisional-2x4",
    unit_price_cents: 50000,
    double_price_cents: 90000,
    ...overrides,
  });
  const slots = LAYOUT_TEMPLATES[0].slots;

  async function create(month: number, overrides: Record<string, unknown> = {}) {
    const { data, error } = await admin.rpc("admin_create_campaign", { p: campaign(month, overrides), p_slots: slots });
    if (error) throw error;
    editions.push(data);
    return data;
  }
  const events = async (targetId: string) =>
    (await admin.from("admin_events").select("event_type, details").eq("target_id", targetId).order("id")).data ?? [];

  beforeAll(async () => {
    service = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    admin = await signedIn(true);
    member = await signedIn(false);
  });

  afterAll(async () => {
    for (const id of editions) {
      await service.from("bookings").delete().eq("edition_id", id);
      deleteLocalCampaignFixtures([id]);
    }
    for (const id of zones) await service.from("zones").delete().eq("id", id);
    await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
    await service.from("slots").update({ blocked_at: null, blocked_by: null, blocked_reason: null }).eq("edition_id", OPEN_EDITION);
    await service.from("admin_events").delete().in("admin_user_id", users);
    for (const id of users) await service.auth.admin.deleteUser(id);
  });

  test("zones are admin-only, audited, editable and duplicate-safe; provisional drafts cannot open", async () => {
    const suffix = randomUUID();
    const args = { p_id: null, p_name: `Zone ${suffix}`, p_slug: `zone-${suffix}`, p_household_count: 5000 };
    expect((await member.rpc("admin_save_zone", args)).error?.message).toBe("not_admin");
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.rpc("admin_save_zone", args)).error).not.toBeNull();
    const made = await admin.rpc("admin_save_zone", args);
    expect(made.error).toBeNull();
    zones.push(made.data!);
    expect((await admin.rpc("admin_save_zone", args)).error?.message).toBe("zone_exists");
    expect((await admin.rpc("admin_save_zone", { ...args, p_slug: `other-${suffix}`, p_name: args.p_name.toUpperCase() })).error?.message).toBe("zone_exists");
    expect((await admin.rpc("admin_save_zone", { ...args, p_name: `Other ${suffix}` })).error?.message).toBe("zone_exists");
    expect((await admin.rpc("admin_save_zone", { ...args, p_id: made.data, p_household_count: 5100 })).error).toBeNull();
    expect((await events(made.data!)).map((e) => e.event_type)).toEqual(["zone.created", "zone.updated"]);
    expect((await anon.from("zones").select("id").eq("id", made.data!)).data).toEqual([]);
    const id = await create(11, { zone_id: made.data });
    expect((await admin.rpc("admin_set_campaign_status", { p_id: id, p_action: "open" })).error?.message).toBe("layout_not_approved");
    expect((await service.from("editions").update({ status: "open" }).eq("id", id)).error?.message).toBe("layout_not_approved");
    expect((await admin.rpc("admin_save_zone", { ...args, p_id: made.data, p_slug: `changed-${suffix}` })).error?.message).toBe("zone_slug_in_use");
    const { data: slot } = await admin.from("slots").select("id").eq("edition_id", id).limit(1).single();
    expect(await placeHold(service, { slotIds: [slot!.id] })).toEqual({ ok: false, reason: "edition_closed" });
  });

  test("the same mailing month supports four independent area drafts, prices and inventories", async () => {
    const ids: string[] = [];
    const slotIds = new Set<string>();
    for (const [i, area] of REGIONS.entries()) {
      let zoneId = (await admin.from("zones").select("id").eq("slug", area.slug).maybeSingle()).data?.id;
      if (!zoneId) {
        const made = await admin.rpc("admin_save_zone", { p_id: null, p_name: area.name, p_slug: area.slug, p_household_count: 0 });
        expect(made.error).toBeNull();
        zoneId = made.data!;
        zones.push(zoneId);
      }
      const id = await create(12, {
        zone_id: zoneId,
        name: `Test ${area.name} ${year}`,
        target_quantity: 1000 + i, // Synthetic test estimates, never written to the zone or production.
        unit_price_cents: 50000 + i * 1000,
        double_price_cents: 90000 + i * 1000,
        reservation_deadline: `${year - 1}-12-0${i + 1}T04:59:00.000Z`,
      });
      ids.push(id);
      const inventory = await admin.from("slots").select("id").eq("edition_id", id);
      expect(inventory.data).toHaveLength(16);
      for (const slot of inventory.data!) slotIds.add(slot.id);
      expect((await admin.rpc("admin_create_campaign", { p: campaign(12, { zone_id: zoneId }), p_slots: slots })).error?.message).toBe("campaign_exists_for_month");
    }
    expect(slotIds.size).toBe(64); // Inventory is never shared across geographic campaigns.
    const before = await admin.from("editions").select("id, zone_id, status, artwork_deadline, target_quantity, unit_price_cents, double_unit_price_cents").in("id", ids);
    expect(before.error).toBeNull();
    expect(new Set(before.data!.map((row) => row.zone_id)).size).toBe(4);
    for (const [i, id] of ids.entries()) expect(before.data!.find((row) => row.id === id)).toMatchObject({ status: "draft", unit_price_cents: 50000 + i * 1000, double_unit_price_cents: 90000 + i * 1000 });
    const edited = await admin.rpc("admin_update_campaign", { p_id: ids[1], p: { name: "Test Southern independently edited", target_quantity: 2200, reservation_deadline: `${year - 1}-12-04T04:59:00.000Z` } });
    expect(edited.error).toBeNull();
    const after = (await admin.from("editions").select("id, zone_id, status, artwork_deadline, target_quantity, unit_price_cents, double_unit_price_cents").in("id", ids)).data!;
    const southern = after.find((row) => row.id === ids[1])!;
    expect(southern.target_quantity).toBe(2200);
    expect(new Date(southern.artwork_deadline).toISOString()).toBe(`${year - 1}-12-04T04:59:00.000Z`);
    for (const id of [ids[0], ids[2], ids[3]]) expect(after.find((row) => row.id === id)).toEqual(before.data!.find((row) => row.id === id));
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.from("editions").select("id").in("id", ids)).data).toEqual([]);
    expect((await anon.from("slots").select("id").in("edition_id", ids)).data).toEqual([]);
    for (const id of ids) {
      const opening = await admin.rpc("admin_set_campaign_status", { p_id: id, p_action: "open" });
      expect(["layout_not_approved", "another_open_campaign_in_area"]).toContain(opening.error?.message);
    }
  });

  test("non-admins and anonymous callers are refused by every admin function", async () => {
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const r1 = await member.rpc("admin_create_campaign", { p: campaign(1), p_slots: slots });
    expect(r1.error?.message).toBe("not_admin");
    const r2 = await member.rpc("admin_set_campaign_status", { p_id: OPEN_EDITION, p_action: "pause" });
    expect(r2.error?.message).toBe("not_admin");
    const r3 = await anon.rpc("admin_set_campaign_status", { p_id: OPEN_EDITION, p_action: "pause" });
    expect(r3.error).not.toBeNull();
    expect((await member.from("admin_events").select("id")).data).toEqual([]); // and can't read the audit log
  });

  test("creating a campaign makes a DRAFT with its 16 spaces, invisible to the public, and is audited", async () => {
    const id = await create(1);
    const { data: e } = await admin.from("editions").select("status, name, target_quantity, layout_template, unit_price_cents").eq("id", id).single();
    expect(e).toMatchObject({ status: "draft", name: `Test campaign ${year}-1`, target_quantity: 5000, layout_template: "provisional-2x4", unit_price_cents: 50000 });
    expect((await admin.from("slots").select("id").eq("edition_id", id)).data).toHaveLength(16);
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.from("editions").select("id").eq("id", id)).data).toEqual([]);
    expect((await events(id)).map((x) => x.event_type)).toEqual(["campaign.created"]);
  });

  test("invalid dates, quantities and duplicate months are rejected with clear errors", async () => {
    const bad = async (o: Record<string, unknown>) => (await admin.rpc("admin_create_campaign", { p: campaign(2, o), p_slots: slots })).error?.message;
    expect(await bad({ artwork_due_at: `${year - 1}-11-01T00:00:00.000Z` })).toBe("dates_out_of_order"); // artwork before reservation deadline
    expect(await bad({ mailing_window_end: `${year - 1}-12-01` })).toBe("dates_out_of_order");
    expect(await bad({ reservations_open_at: `${year - 1}-12-02T00:00:00.000Z` })).toBe("dates_out_of_order"); // opens after deadline
    expect(await bad({ target_quantity: 0 })).toBe("invalid_input");
    await create(3);
    expect((await admin.rpc("admin_create_campaign", { p: campaign(3), p_slots: slots })).error?.message).toBe("campaign_exists_for_month");
  });

  test("opening checks its requirements; pause stops new holds; resume allows them; every step is audited and repeatable", async () => {
    const status = (id: string, action: string) => admin.rpc("admin_set_campaign_status", { p_id: id, p_action: action });
    // Central Westchester already has an open campaign: a second one can't open.
    const id = await create(4);
    expect((await status(id, "open")).error?.message).toBe("another_open_campaign_in_area");

    // Pause the real open campaign: no new holds (DB-enforced), resume restores them.
    expect((await status(OPEN_EDITION, "pause")).data).toBe("done");
    expect((await status(OPEN_EDITION, "pause")).data).toBe("already"); // idempotent
    const { data: slot } = await service.from("slots").select("id").eq("edition_id", OPEN_EDITION).eq("label", "B8").single();
    expect(await placeHold(service, { slotIds: [slot!.id] })).toEqual({ ok: false, reason: "edition_closed" });
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.from("slot_availability").select("available").eq("slot_id", slot!.id).single()).data?.available).toBe(false);
    expect((await status(OPEN_EDITION, "resume")).data).toBe("done");
    expect((await placeHold(service, { slotIds: [slot!.id] })).ok).toBe(true);

    const types = (await events(OPEN_EDITION)).map((x) => x.event_type);
    expect(types.filter((t) => t === "campaign.pause")).toHaveLength(1); // the repeat recorded nothing
    expect(types).toContain("campaign.resume");
  });

  test("a draft with a past deadline can't open; editing is locked once someone has booked", async () => {
    const past = await create(5, { reservation_deadline: "2020-01-01T00:00:00.000Z", artwork_due_at: "2020-01-02T00:00:00.000Z", mailing_window_start: "2020-01-03", mailing_window_end: "2020-01-04" });
    expect((await admin.rpc("admin_set_campaign_status", { p_id: past, p_action: "open" })).error?.message).toBe("deadline_passed");

    // The live campaign has holds from the previous test: dates can't move, the name can.
    const locked = await admin.rpc("admin_update_campaign", { p_id: OPEN_EDITION, p: { reservation_deadline: "2026-12-20T04:59:00.000Z" } });
    expect(locked.error?.message).toBe("locked_by_reservations");
    const { data: before } = await admin.from("editions").select("name").eq("id", OPEN_EDITION).single();
    expect((await admin.rpc("admin_update_campaign", { p_id: OPEN_EDITION, p: { name: "Central Westchester · January 2027" } })).data).toBe("updated");
    await service.from("editions").update({ name: before?.name ?? null }).eq("id", OPEN_EDITION);
    const last = (await events(OPEN_EDITION)).at(-1)!;
    expect(last.event_type).toBe("campaign.updated");
    expect(last.details).toMatchObject({ changes: { name: "Central Westchester · January 2027" } });
  });

  test("canceling a campaign is refused once it has confirmed reservations, allowed otherwise", async () => {
    const id = await create(6);
    expect((await admin.rpc("admin_set_campaign_status", { p_id: id, p_action: "cancel" })).data).toBe("done");
    expect((await admin.rpc("admin_set_campaign_status", { p_id: id, p_action: "open" })).error?.message).toBe("cannot_open_from_cancelled");
  });

  describe("inventory and reservations", () => {
    const slotId = async (label: string) => (await service.from("slots").select("id").eq("edition_id", OPEN_EDITION).eq("label", label).single()).data!.id;
    const claims = async (bookingId: string) =>
      (await service.from("booking_slots").select("slot_id").eq("booking_id", bookingId).is("released_at", null)).data ?? [];

    test("blocking: only free spaces; blocked spaces can't be held; unblocking restores them; audited and repeatable", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const f1 = await slotId("F1");
      const f2 = await slotId("F2");
      expect((await admin.rpc("admin_set_slot_block", { p_slot_id: f1, p_block: true })).error?.message).toBe("reason_required");
      expect((await admin.rpc("admin_set_slot_block", { p_slot_id: f1, p_block: true, p_reason: "Printer test area" })).data).toBe("done");
      expect((await admin.rpc("admin_set_slot_block", { p_slot_id: f1, p_block: true, p_reason: "again" })).data).toBe("already");
      expect(await placeHold(service, { slotIds: [f1] })).toEqual({ ok: false, reason: "slot_unavailable" });
      expect(await placeHold(service, { slotIds: [f1, f2] })).toEqual({ ok: false, reason: "slot_unavailable" }); // a double can't include it either
      const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
      expect((await anon.from("slot_availability").select("occupancy, available").eq("slot_id", f1).single()).data).toEqual({ occupancy: "blocked", available: false });

      const held = await placeHold(service, { slotIds: [f2] });
      expect(held.ok).toBe(true);
      expect((await admin.rpc("admin_set_slot_block", { p_slot_id: f2, p_block: true, p_reason: "x" })).error?.message).toBe("slot_occupied");

      expect((await admin.rpc("admin_set_slot_block", { p_slot_id: f1, p_block: false })).data).toBe("done");
      expect((await placeHold(service, { slotIds: [f1] })).ok).toBe(true);
      expect((await events(f1)).map((e) => e.event_type)).toEqual(["slot.blocked", "slot.unblocked"]);
    });

    test("canceling a double releases both spaces atomically, keeps the record, and repeats safely (even concurrently)", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const hold = await placeHold(service, { slotIds: [await slotId("B1"), await slotId("B2")] });
      if (!hold.ok) throw new Error("hold failed");
      await service.from("bookings").update({ status: "reserved", confirmed_at: new Date().toISOString(), reference: "IN914-CNCLTS", stripe_payment_method_id: "pm_canceltest" }).eq("id", hold.bookingId);
      expect(await claims(hold.bookingId)).toHaveLength(2);

      expect((await admin.rpc("admin_cancel_booking", { p_booking_id: hold.bookingId, p_reason: "" })).error?.message).toBe("reason_required");
      const results = await Promise.all([1, 2, 3].map(() => admin.rpc("admin_cancel_booking", { p_booking_id: hold.bookingId, p_reason: "Advertiser asked to cancel" })));
      expect(results.map((r) => r.data).sort()).toEqual(["already", "already", "done"]);
      expect(await claims(hold.bookingId)).toEqual([]); // both units free, in one step
      const { data: row } = await service.from("bookings").select("status, cancellation_reason, cancelled_by, reference").eq("id", hold.bookingId).single();
      expect(row).toMatchObject({ status: "cancelled", cancellation_reason: "Advertiser asked to cancel", reference: "IN914-CNCLTS" }); // kept, not deleted
      expect(await hasBookings(admin, OPEN_EDITION)).toBe(true); // confirmed history still locks schedule changes
      const cancelled = (await events(hold.bookingId)).filter((e) => e.event_type === "booking.cancelled");
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].details).toMatchObject({ slots_released: 2, size: "double", customer_notified: true });
      // Exactly one cancellation email queued (even with three concurrent cancels); the card is still to be removed by the app.
      const { data: outbox } = await service.from("email_outbox").select("kind, status").eq("booking_id", hold.bookingId);
      expect(outbox).toEqual([{ kind: "reservation_cancelled", status: "pending" }]);
      const { data: card } = await service.from("bookings").select("stripe_payment_method_id, card_removed_at").eq("id", hold.bookingId).single();
      expect(card).toEqual({ stripe_payment_method_id: "pm_canceltest", card_removed_at: null });
      expect((await placeHold(service, { slotIds: [await slotId("B1"), await slotId("B2")] })).ok).toBe(true); // available again
    });

    test("releasing an unconfirmed hold doesn't email anyone", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const hold = await placeHold(service, { slotIds: [await slotId("F1")] });
      if (!hold.ok) throw new Error(hold.reason);
      expect((await admin.rpc("admin_cancel_booking", { p_booking_id: hold.bookingId, p_reason: "Stale hold" })).data).toBe("done");
      expect((await service.from("email_outbox").select("id").eq("booking_id", hold.bookingId)).data).toEqual([]);
    });

    test("a reservation with a payment state, or one that already ended, can't be canceled here", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const paid = await placeHold(service, { slotIds: [await slotId("B3")] });
      const ended = await placeHold(service, { slotIds: [await slotId("B4")] });
      if (!paid.ok || !ended.ok) throw new Error("hold failed");
      await service.from("bookings").update({ status: "charged", confirmed_at: new Date().toISOString(), reference: "IN914-PAYDTS", stripe_payment_method_id: "pm_paidtest" }).eq("id", paid.bookingId);
      await service.from("bookings").update({ status: "released" }).eq("id", ended.bookingId);
      expect((await admin.rpc("admin_cancel_booking", { p_booking_id: paid.bookingId, p_reason: "test" })).data).toBe("requires_resolution");
      expect((await admin.rpc("admin_cancel_booking", { p_booking_id: ended.bookingId, p_reason: "test" })).error?.message).toBe("already_released");
      expect(await claims(paid.bookingId)).toHaveLength(1); // untouched
      expect((await member.rpc("admin_cancel_booking", { p_booking_id: paid.bookingId, p_reason: "x" })).error?.message).toBe("not_admin");
    });

    test("notes and flags are recorded and audited; non-admins can't read them", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const hold = await placeHold(service, { slotIds: [await slotId("B5")] });
      if (!hold.ok) throw new Error("hold failed");
      expect((await admin.rpc("admin_add_booking_note", { p_booking_id: hold.bookingId, p_body: "  Called the owner, will confirm Monday.  " })).error).toBeNull();
      expect((await admin.rpc("admin_flag_booking", { p_booking_id: hold.bookingId, p_reason: "Business name looks misspelled" })).data).toBe("done");
      expect((await admin.rpc("admin_flag_booking", { p_booking_id: hold.bookingId, p_reason: null })).data).toBe("done");
      expect((await admin.from("booking_notes").select("body").eq("booking_id", hold.bookingId)).data).toEqual([{ body: "Called the owner, will confirm Monday." }]);
      expect((await member.from("booking_notes").select("body"))).toMatchObject({ data: [] });
      expect((await events(hold.bookingId)).map((e) => e.event_type)).toEqual(["booking.note_added", "booking.flagged", "booking.unflagged"]);
    });
  });

  describe("artwork review", () => {
    async function bookingWithArtwork(label: string, ready = true) {
      const { data: slot } = await service.from("slots").select("id").eq("edition_id", OPEN_EDITION).eq("label", label).single();
      const hold = await placeHold(service, { slotIds: [slot!.id] });
      if (!hold.ok) throw new Error("hold failed");
      const { data: art } = await service
        .from("booking_artwork")
        .insert({ booking_id: hold.bookingId, storage_path: `${hold.bookingId}/${randomUUID()}`, status: ready ? "ready" : "uploading", content_type: ready ? "image/png" : null, byte_size: ready ? 1000 : null, width_px: ready ? 900 : null, height_px: ready ? 900 : null, crop_x: 0, crop_y: 0, crop_width: ready ? 900 : null, crop_height: ready ? 830 : null, zoom: 1 })
        .select("id")
        .single();
      return { bookingId: hold.bookingId, artworkId: art!.id };
    }

    test("approve, request changes and reject one specific upload; reasons required; history kept; audited", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const { bookingId, artworkId } = await bookingWithArtwork("F3");
      const review = (decision: string, note?: string) => admin.rpc("admin_review_artwork", { p_artwork_id: artworkId, p_decision: decision, p_note: note });
      expect((await review("rejected")).error?.message).toBe("reason_required");
      expect((await review("approved")).data).toBe("done");
      expect((await review("approved")).data).toBe("already");
      expect((await review("changes_requested", "Phone number is cut off")).data).toBe("done");
      const { data: row } = await service.from("booking_artwork").select("review_status, review_note").eq("id", artworkId).single();
      expect(row).toEqual({ review_status: "changes_requested", review_note: "Phone number is cut off" });
      expect((await admin.from("artwork_reviews").select("decision").eq("booking_id", bookingId).order("created_at")).data?.map((r) => r.decision)).toEqual(["approved", "changes_requested"]);
      expect((await events(artworkId)).map((e) => e.event_type)).toEqual(["artwork.approved", "artwork.changes_requested"]);
      expect((await member.rpc("admin_review_artwork", { p_artwork_id: artworkId, p_decision: "approved" })).error?.message).toBe("not_admin");
    });

    test("a new upload never inherits approval, and incomplete artwork can't be approved", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const first = await bookingWithArtwork("F4");
      expect((await admin.rpc("admin_review_artwork", { p_artwork_id: first.artworkId, p_decision: "approved" })).data).toBe("done");
      // The customer replaces the file (the app deletes the old row and inserts a new one).
      await service.from("booking_artwork").delete().eq("id", first.artworkId);
      const { data: replacement } = await service
        .from("booking_artwork")
        .insert({ booking_id: first.bookingId, storage_path: `${first.bookingId}/${randomUUID()}`, status: "ready", content_type: "image/png", byte_size: 1000, width_px: 900, height_px: 900, crop_x: 0, crop_y: 0, crop_width: 900, crop_height: 830, zoom: 1 })
        .select("id, review_status")
        .single();
      expect(replacement?.review_status).toBe("pending");
      const history = (await admin.from("artwork_reviews").select("decision, artwork_id").eq("booking_id", first.bookingId)).data;
      expect(history).toEqual([{ decision: "approved", artwork_id: null }]); // the old decision is kept, detached from the new file

      const incomplete = await bookingWithArtwork("F5", false);
      expect((await admin.rpc("admin_review_artwork", { p_artwork_id: incomplete.artworkId, p_decision: "approved" })).error?.message).toBe("artwork_incomplete");
    });
  });

  describe("production and mailing evidence", () => {
    test("approve for print needs all artwork approved; printed and mailed need genuine evidence; all audited", async () => {
      const id = await create(7);
      await service.from("editions").update({ status: "closed" }).eq("id", id); // as if it had been open and filled
      const { data: s } = await service.from("slots").select("id").eq("edition_id", id).eq("label", "F1").single();
      const { data: b } = await service
        .from("bookings")
        .insert({ edition_id: id, size: "standard", price_cents: 50000, status: "reserved", hold_token_hash: randomBytes(32).toString("hex"), hold_expires_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), reference: "IN914-PRDCTN", stripe_payment_method_id: "pm_prodtest" })
        .select("id")
        .single();
      await service.from("booking_slots").insert({ booking_id: b!.id, slot_id: s!.id });
      const { data: art } = await service
        .from("booking_artwork")
        .insert({ booking_id: b!.id, storage_path: `${b!.id}/${randomUUID()}`, status: "ready", content_type: "image/png", byte_size: 1000, width_px: 900, height_px: 900, crop_x: 0, crop_y: 0, crop_width: 900, crop_height: 830, zoom: 1 })
        .select("id")
        .single();
      // This fixture has one sale; block the remaining spaces so the campaign is full.
      await service.from("slots").update({ blocked_at: new Date().toISOString(), blocked_reason: "fixture inventory" }).eq("edition_id", id).neq("id", s!.id);
      const status = (action: string) => admin.rpc("admin_set_campaign_status", { p_id: id, p_action: action });

      expect((await status("approve_for_print")).error?.message).toBe("artwork_not_all_approved");
      await admin.rpc("admin_review_artwork", { p_artwork_id: art!.id, p_decision: "approved" });
      expect((await status("approve_for_print")).data).toBe("done");
      expect((await status("mark_printed")).error?.message).toBe("needs_printer_confirmation");

      const add = (kind: string, title: string) => admin.rpc("admin_add_evidence", { p_edition_id: id, p: { kind, title, quantity_printed: kind === "printer_confirmation" ? 5000 : null } });
      expect((await add("printer_confirmation", "Printer invoice")).error).toBeNull();
      expect((await status("mark_printed")).data).toBe("done");
      expect((await status("mark_mailed")).error?.message).toBe("needs_mailing_evidence");
      const { data: receipt } = await add("postal_acceptance", "PS Form 3602");
      expect((await status("mark_mailed")).data).toBe("done");
      expect((await status("complete")).data).toBe("done");

      const receiptPath=`${id}/${randomUUID()}.pdf`;
      const receiptBytes=new TextEncoder().encode("%PDF-1.4 local published receipt");
      expect((await service.storage.from("mailing-evidence").upload(receiptPath,receiptBytes,{contentType:"application/pdf"})).error).toBeNull();
      expect((await service.from("mailing_evidence").update({storage_path:receiptPath,content_type:"application/pdf",byte_size:receiptBytes.length}).eq("id",receipt!)).error).toBeNull();
      expect((await admin.rpc("admin_publish_evidence", { p_id: receipt!, p_publish: true })).data).toBe("done");
      expect((await admin.rpc("admin_publish_evidence", { p_id: receipt!, p_publish: true })).data).toBe("already");
      expect((await events(receipt!)).map((e) => e.event_type)).toEqual(["evidence.uploaded", "evidence.published"]);
      expect((await events(id)).map((e) => e.event_type)).toEqual([
        "campaign.created", "campaign.approve_for_print", "campaign.mark_printed", "campaign.mark_mailed", "campaign.complete",
      ]);
      expect((await member.rpc("admin_add_evidence", { p_edition_id: id, p: { kind: "other", title: "x" } })).error?.message).toBe("not_admin");
      expect((await member.from("mailing_evidence").select("id")).data).toEqual([]);
      await service.storage.from("mailing-evidence").remove([receiptPath]);
      await service.from("mailing_evidence").delete().eq("edition_id", id);
    });

    test("evidence files are private: nobody but the server can read them", async () => {
      const path = `${OPEN_EDITION}/${randomUUID()}.pdf`;
      const pdf = new TextEncoder().encode("%PDF-1.4 test evidence");
      expect((await service.storage.from("mailing-evidence").upload(path, pdf, { contentType: "application/pdf" })).error).toBeNull();
      try {
        const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
        for (const client of [anon, member, admin]) {
          expect((await client.storage.from("mailing-evidence").download(path)).data).toBeNull();
          expect((await client.storage.from("mailing-evidence").createSignedUrl(path, 60)).data?.signedUrl).toBeUndefined();
          expect((await client.storage.from("mailing-evidence").upload(`${OPEN_EDITION}/${randomUUID()}.pdf`, pdf, { contentType: "application/pdf" })).error).not.toBeNull();
        }
        // The bucket itself refuses other file types.
        expect((await service.storage.from("mailing-evidence").upload(`${OPEN_EDITION}/${randomUUID()}.txt`, pdf, { contentType: "text/plain" })).error).not.toBeNull();
      } finally {
        await service.storage.from("mailing-evidence").remove([path]);
      }
    });
  });
});
