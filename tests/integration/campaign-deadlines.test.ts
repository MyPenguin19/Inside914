import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

// REAL local database (no mocks): the Phase 6A deadline rules. A throwaway admin and a throwaway
// far-future campaign, both removed afterwards. Uses the secret key only to set up states that
// would otherwise take weeks (a passed deadline, confirmed reservations).
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const { LAYOUT_TEMPLATES } = await import("@/lib/admin/layouts");

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const TEST_ZONE = randomUUID();

describe.skipIf(!secretKey)("campaign deadlines (real database functions)", () => {
  let service: SupabaseClient<Database>;
  let admin: SupabaseClient<Database>;
  let adminId = "";
  let edition = "";
  const year = 2090 + Math.floor(Math.random() * 9);
  const future = `${year - 1}-11-01T04:59:00.000Z`;

  const slotId = async (label: string) =>
    (await service.from("slots").select("id").eq("edition_id", edition).eq("label", label).single()).data!.id;
  const setEdition = (values: Database["public"]["Tables"]["editions"]["Update"]) => service.from("editions").update(values).eq("id", edition);
  const status = (action: string) => admin.rpc("admin_set_campaign_status", { p_id: edition, p_action: action });
  async function reserve(label: string) {
    const hold = await placeHold(service, { slotIds: [await slotId(label)] });
    if (!hold.ok) throw new Error(hold.reason);
    await service.from("bookings").update({ status: "reserved", confirmed_at: new Date().toISOString(), reference: `IN914-${randomBytes(3).toString("hex").toUpperCase().replace(/[01IO]/g, "Z")}`, stripe_payment_method_id: `pm_dl_${label}` }).eq("id", hold.bookingId);
    return hold.bookingId;
  }

  beforeAll(async () => {
    service = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    const email = `inside914-deadline-${randomUUID()}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    adminId = data.user.id;
    await service.from("admins").insert({ user_id: adminId });
    admin = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    await admin.auth.signInWithPassword({ email, password });

    const zone = await service.from("zones").insert({ id: TEST_ZONE, slug: `deadline-${TEST_ZONE}`, name: "Deadline fixture", household_count: 5000 });
    if (zone.error) throw zone.error;
    const created = await admin.rpc("admin_create_campaign", {
      p: {
        name: `Deadline test ${year}`, zone_id: TEST_ZONE, issue_month: `${year}-01-01`, target_quantity: 5000, reservations_open_at: null,
        reservation_deadline: future, artwork_due_at: `${year - 1}-11-05T04:59:00.000Z`, mailing_window_start: `${year - 1}-11-10`, mailing_window_end: `${year - 1}-11-15`,
        layout_template: "provisional-2x4", unit_price_cents: 50000, double_price_cents: 90000,
      },
      p_slots: LAYOUT_TEMPLATES[0].slots,
    });
    if (created.error) throw created.error;
    edition = created.data;
    // The dedicated fixture zone keeps deadline reopening independent of the seeded campaign.
    await setEdition({ status: "open" });
  });

  afterAll(async () => {
    await service.from("bookings").delete().eq("edition_id", edition);
    await service.from("editions").delete().eq("id", edition);
    await service.from("admin_events").delete().eq("target_id", edition);
    await service.from("admin_events").delete().eq("admin_user_id", adminId);
    await service.auth.admin.deleteUser(adminId);
    await service.from("zones").delete().eq("id", TEST_ZONE);
  });

  test("before the deadline a campaign with reservations can't be canceled, and an unfilled one can't be approved", async () => {
    await reserve("F1");
    expect((await status("cancel")).error?.message).toBe("has_reservations");
    await setEdition({ status: "closed" });
    expect((await status("approve_for_print")).error?.message).toBe("not_full");
    await setEdition({ status: "open" });
  });

  test("only the daily job (service role) closes past-deadline campaigns, and it audits as the system", async () => {
    await setEdition({ artwork_deadline: new Date(Date.now() - 60_000).toISOString() });
    expect((await admin.rpc("close_past_deadline_campaigns")).error).toBeTruthy();
    const { data, error } = await service.rpc("close_past_deadline_campaigns");
    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(1);
    expect((await service.from("editions").select("status").eq("id", edition).single()).data?.status).toBe("closed");
    const { data: events } = await service.from("admin_events").select("admin_user_id, event_type, details").eq("target_id", edition).eq("event_type", "system.campaign_auto_closed");
    expect(events).toEqual([{ admin_user_id: null, event_type: "system.campaign_auto_closed", details: { reason: "deadline_passed", full: false } }]);
  });

  test("extending the deadline reopens the campaign, only to a later date, and keeps dates in order", async () => {
    const later = new Date(Date.now() + 7 * 86_400_000).toISOString();
    expect((await admin.rpc("admin_extend_deadline", { p_id: edition, p: { reservation_deadline: new Date(Date.now() - 86_400_000).toISOString() } })).error?.message).toBe("deadline_must_be_future");
    expect((await admin.rpc("admin_extend_deadline", { p_id: edition, p: { reservation_deadline: later, artwork_due_at: new Date(Date.now() + 86_400_000).toISOString() } })).error?.message).toBe("dates_out_of_order");
    const ok = await admin.rpc("admin_extend_deadline", {
      p_id: edition,
      p: { reservation_deadline: later, artwork_due_at: new Date(Date.now() + 8 * 86_400_000).toISOString(), mailing_window_start: `${year - 1}-12-10`, mailing_window_end: `${year - 1}-12-15` },
    });
    expect(ok.error).toBeNull();
    const { data: row } = await service.from("editions").select("status, artwork_deadline").eq("id", edition).single();
    expect(row?.status).toBe("open");
    expect(Date.parse(row!.artwork_deadline)).toBe(Date.parse(later));
  });

  test("after a missed deadline, cancel cancels every reservation and emails only confirmed customers, once", async () => {
    const confirmed = await reserve("F2");
    const pending = await placeHold(service, { slotIds: [await slotId("F3")] });
    if (!pending.ok) throw new Error(pending.reason);
    await setEdition({ artwork_deadline: new Date(Date.now() - 60_000).toISOString(), status: "closed" });

    const results = await Promise.all([1, 2].map(() => status("cancel")));
    expect(results.map((r) => r.data).sort()).toEqual(["already", "done"]);
    const { data: bookings } = await service.from("bookings").select("id, status").eq("edition_id", edition);
    expect(new Set(bookings?.map((b) => b.status))).toEqual(new Set(["cancelled"]));
    const { data: outbox } = await service.from("email_outbox").select("booking_id, kind").in("booking_id", bookings!.map((b) => b.id));
    expect(outbox?.map((o) => o.kind)).toEqual(["campaign_cancelled_not_full", "campaign_cancelled_not_full"]); // F1 and F2, not the F3 hold
    expect(outbox?.some((o) => o.booking_id === pending.bookingId)).toBe(false);
    expect(outbox?.some((o) => o.booking_id === confirmed)).toBe(true);
    expect((await service.from("slot_availability").select("occupancy").eq("edition_id", edition).neq("occupancy", "closed")).data ?? []).toEqual([]);
  });

  test("a full campaign can't be canceled for not filling", async () => {
    await service.from("bookings").delete().eq("edition_id", edition);
    await setEdition({ status: "open", artwork_deadline: new Date(Date.now() + 86_400_000).toISOString() });
    const all = (await service.from("slots").select("id, label").eq("edition_id", edition)).data!;
    await service.from("slots").update({ blocked_at: new Date().toISOString(), blocked_reason: "test" }).eq("edition_id", edition).neq("label", "F1");
    await reserve("F1"); // the only sellable space: the campaign is full
    await setEdition({ artwork_deadline: new Date(Date.now() - 60_000).toISOString(), status: "closed" });
    expect((await status("cancel")).error?.message).toBe("campaign_is_full");
    await service.from("slots").update({ blocked_at: null, blocked_reason: null }).in("id", all.map((s) => s.id));
  });
});
