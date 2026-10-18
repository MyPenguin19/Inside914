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
});
