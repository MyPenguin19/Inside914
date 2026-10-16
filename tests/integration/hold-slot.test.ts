import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");

const url = process.env.SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const OPEN_EDITION = "00000000-0000-4000-8000-000000000101";
const DRAFT_EDITION = "00000000-0000-4000-8000-000000000102";

// Writes test bookings (removed after each test), so it needs the secret key in .env.local.
describe.skipIf(!secretKey)("hold_slots", () => {
  // Created in beforeAll: a skipped describe still runs its body, and supabase-js rejects an empty key.
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    admin = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    anon = createClient<Database>(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await admin.from("slots").select("id, label, edition_id").in("edition_id", [OPEN_EDITION, DRAFT_EDITION]);
    for (const s of data ?? []) ids[s.edition_id === DRAFT_EDITION ? `draft-${s.label}` : s.label] = s.id;
  });

  afterEach(async () => {
    await admin.from("bookings").delete().eq("edition_id", OPEN_EDITION);
  });

  afterAll(async () => {
    await admin?.from("bookings").delete().eq("edition_id", OPEN_EDITION);
  });

  test("10 concurrent standard holds on one slot: exactly one succeeds", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => placeHold(admin, { slotIds: [ids.B8] })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "slot_unavailable")).toHaveLength(9);
  });

  test("doubles and singles racing for overlapping slots never claim a slot twice", async () => {
    const results = await Promise.all([
      placeHold(admin, { slotIds: [ids.B7, ids.B8] }),
      placeHold(admin, { slotIds: [ids.B8] }),
      placeHold(admin, { slotIds: [ids.B7, ids.B8] }),
      placeHold(admin, { slotIds: [ids.B7] }),
    ]);
    const { data } = await admin.from("booking_slots").select("slot_id").is("released_at", null);
    const claimed = (data ?? []).map((r) => r.slot_id);
    expect(new Set(claimed).size).toBe(claimed.length); // never two claims on one slot
    expect(results.some((r) => r.ok)).toBe(true);
  });

  test("a double hold is all or nothing", async () => {
    expect((await placeHold(admin, { slotIds: [ids.F2] })).ok).toBe(true);

    expect(await placeHold(admin, { slotIds: [ids.F1, ids.F2] })).toEqual({ ok: false, reason: "slot_unavailable" });
    const { data } = await anon.from("slot_availability").select("available").eq("slot_id", ids.F1).single();
    expect(data?.available).toBe(true); // F1 was not left half-held
  });

  test("double hold prices at the edition's double rate", async () => {
    const result = await placeHold(admin, { slotIds: [ids.F3, ids.F4] });
    expect(result).toMatchObject({ ok: true, size: "double", priceCents: 90000 });
  });

  test("non-adjacent or cross-side pairs are refused", async () => {
    expect(await placeHold(admin, { slotIds: [ids.F1, ids.F4] })).toEqual({ ok: false, reason: "invalid_selection" });
    expect(await placeHold(admin, { slotIds: [ids.F1, ids.B2] })).toEqual({ ok: false, reason: "invalid_selection" });
    expect(await placeHold(admin, { slotIds: [ids.F1, ids.F3] })).toEqual({ ok: false, reason: "invalid_selection" });
  });

  test("an expired hold is released and the slot can be held again", async () => {
    expect((await placeHold(admin, { slotIds: [ids.B5, ids.B6] })).ok).toBe(true);
    await admin
      .from("bookings")
      .update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("edition_id", OPEN_EDITION)
      .eq("status", "pending");

    expect((await placeHold(admin, { slotIds: [ids.B5] })).ok).toBe(true);
    const { data } = await admin.from("bookings").select("status, size").eq("edition_id", OPEN_EDITION);
    expect(data?.map((b) => `${b.size}:${b.status}`).sort()).toEqual(["double:released", "standard:pending"]);
  });

  test("slots of unpublished editions and unknown slots can't be held", async () => {
    expect(await placeHold(admin, { slotIds: [ids["draft-F1"]] })).toEqual({ ok: false, reason: "edition_closed" });
    expect(await placeHold(admin, { slotIds: [crypto.randomUUID()] })).toEqual({ ok: false, reason: "slot_not_found" });
  });
});
