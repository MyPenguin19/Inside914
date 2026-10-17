import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const { getEditionCatalog, getBookableEditions } = await import("@/lib/catalog/queries");

const url = process.env.SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const OPEN_EDITION = "00000000-0000-4000-8000-000000000101";

// REAL dev database (no mocks). Writes test bookings and removes them after each test.
describe.skipIf(!secretKey)("public occupancy and hold rate limit", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  const ids: Record<string, string> = {};
  const occupancy = async (label: string) =>
    (await anon.from("slot_availability").select("occupancy, available").eq("slot_id", ids[label]).single()).data;

  beforeAll(async () => {
    admin = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    anon = createClient<Database>(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await admin.from("slots").select("id, label").eq("edition_id", OPEN_EDITION);
    for (const s of data ?? []) ids[s.label] = s.id;
  });

  afterEach(async () => {
    await admin.from("bookings").delete().eq("edition_id", OPEN_EDITION);
  });

  afterAll(async () => {
    await admin?.from("bookings").delete().eq("edition_id", OPEN_EDITION);
  });

  test("a held space reads 'held' to the public; a released or expired hold reads 'available' again", async () => {
    expect(await occupancy("B3")).toEqual({ occupancy: "available", available: true });

    const hold = await placeHold(admin, { slotIds: [ids.B3] });
    expect(hold.ok).toBe(true);
    expect(await occupancy("B3")).toEqual({ occupancy: "held", available: false });

    // Expired (nobody released it yet): free again, exactly like hold_slots() treats it.
    await admin.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", hold.ok ? hold.bookingId : "");
    expect(await occupancy("B3")).toEqual({ occupancy: "available", available: true });

    const again = await placeHold(admin, { slotIds: [ids.B3] }); // the expired hold doesn't block
    expect(again.ok).toBe(true);
    await admin.from("bookings").update({ status: "released" }).eq("id", again.ok ? again.bookingId : "");
    expect(await occupancy("B3")).toEqual({ occupancy: "available", available: true });
  });

  test("a confirmed booking reads 'reserved'", async () => {
    const hold = await placeHold(admin, { slotIds: [ids.B4] });
    if (!hold.ok) throw new Error("hold failed");
    await admin
      .from("bookings")
      .update({ status: "reserved", confirmed_at: new Date().toISOString(), reference: "IN914-TESTRS", stripe_payment_method_id: "pm_occupancytest" })
      .eq("id", hold.bookingId);
    expect(await occupancy("B4")).toEqual({ occupancy: "reserved", available: false });
  });

  test("the public view exposes no booking, contact or payment details", async () => {
    const { data } = await anon.from("slot_availability").select("*").eq("edition_id", OPEN_EDITION).limit(1).single();
    expect(Object.keys(data ?? {}).sort()).toEqual(
      ["artwork_deadline", "available", "edition_id", "height_in", "household_count", "issue_month", "label", "occupancy", "side", "slot_id", "unit_price_cents", "width_in", "x_in", "y_in", "zone_name", "zone_slug"].sort(),
    );
    const { error } = await anon.from("bookings").select("id").limit(1);
    expect(error).not.toBeNull(); // anon cannot read bookings at all
  });

  test("catalog counts match the database: holding one space lowers the open count by one", async () => {
    const before = (await getBookableEditions()).find((e) => e.id === OPEN_EDITION)!;
    expect((await placeHold(admin, { slotIds: [ids.F7] })).ok).toBe(true);
    const after = (await getBookableEditions()).find((e) => e.id === OPEN_EDITION)!;
    expect(after.availableUnits).toBe(before.availableUnits - 1);
    expect(after.totalUnits).toBe(before.totalUnits);

    const catalog = await getEditionCatalog(OPEN_EDITION);
    expect(catalog!.slots.find((s) => s.label === "F7")).toMatchObject({ available: false, occupancy: "held" });
  });

  test("hold attempts: refused once over the limit, per visitor; anon cannot call it", async () => {
    const visitor = randomBytes(32).toString("hex");
    const other = randomBytes(32).toString("hex");
    const attempt = (hash: string) => admin.rpc("note_hold_attempt", { p_visitor_hash: hash, p_max: 3, p_window_seconds: 60 });

    const results = await Promise.all(Array.from({ length: 5 }, () => attempt(visitor)));
    expect(results.map((r) => r.data).filter(Boolean)).toHaveLength(3); // parallel requests can't slip past
    expect((await attempt(other)).data).toBe(true); // other visitors aren't affected

    expect((await anon.rpc("note_hold_attempt", { p_visitor_hash: other, p_max: 1000, p_window_seconds: 60 })).error).not.toBeNull();
    expect((await attempt("not-a-hash")).error).not.toBeNull();
  });
});
