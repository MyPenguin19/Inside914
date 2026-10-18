import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

// REAL dev database + Supabase Auth (no mocks): throwaway admin and non-admin users (owner-approved),
// a throwaway campaign far in the future (year 2090+), all removed afterwards.
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const { LAYOUT_TEMPLATES } = await import("@/lib/admin/layouts");

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
      await service.from("editions").delete().eq("id", id);
    }
    await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
    await service.from("slots").update({ blocked_at: null, blocked_by: null, blocked_reason: null }).eq("edition_id", OPEN_EDITION);
    await service.from("admin_events").delete().in("admin_user_id", users);
    for (const id of users) await service.auth.admin.deleteUser(id);
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
      const cancelled = (await events(hold.bookingId)).filter((e) => e.event_type === "booking.cancelled");
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].details).toMatchObject({ slots_released: 2, size: "double" });
      expect((await placeHold(service, { slotIds: [await slotId("B1"), await slotId("B2")] })).ok).toBe(true); // available again
    });

    test("a reservation with a payment state, or one that already ended, can't be canceled here", async () => {
      await service.from("bookings").delete().eq("edition_id", OPEN_EDITION);
      const paid = await placeHold(service, { slotIds: [await slotId("B3")] });
      const ended = await placeHold(service, { slotIds: [await slotId("B4")] });
      if (!paid.ok || !ended.ok) throw new Error("hold failed");
      await service.from("bookings").update({ status: "charged", confirmed_at: new Date().toISOString(), reference: "IN914-PAYDTS", stripe_payment_method_id: "pm_paidtest" }).eq("id", paid.bookingId);
      await service.from("bookings").update({ status: "released" }).eq("id", ended.bookingId);
      expect((await admin.rpc("admin_cancel_booking", { p_booking_id: paid.bookingId, p_reason: "test" })).error?.message).toBe("payment_state_needs_resolution");
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
});
