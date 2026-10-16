import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");

const url = process.env.SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const DRAFT_EDITION_SLOT_LABEL = "F-banner";

// Writes test reservations (removed afterwards), so it needs the secret key in .env.local.
describe.skipIf(!secretKey)("hold_slot", () => {
  // Created in beforeAll: a skipped describe still runs its body, and supabase-js rejects an empty key.
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let slotId: string;

  beforeAll(async () => {
    admin = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    anon = createClient<Database>(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await anon
      .from("slot_availability")
      .select("slot_id")
      .eq("zone_slug", "southern-westchester")
      .eq("label", "B8")
      .single();
    slotId = data!.slot_id!;
  });

  afterAll(async () => {
    if (slotId) await admin.from("reservations").delete().eq("slot_id", slotId);
  });

  test("10 concurrent holds on one slot: exactly one succeeds", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => placeHold(admin, { slotId })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "slot_unavailable")).toHaveLength(9);
  });

  test("the public catalog shows the held slot as unavailable", async () => {
    const { data } = await anon.from("slot_availability").select("available").eq("slot_id", slotId).single();
    expect(data?.available).toBe(false);
  });

  test("an expired hold is released and the slot can be held again", async () => {
    await admin
      .from("reservations")
      .update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("slot_id", slotId)
      .eq("status", "pending");

    const again = await placeHold(admin, { slotId });
    expect(again.ok).toBe(true);

    const { data } = await admin.from("reservations").select("status").eq("slot_id", slotId);
    expect(data?.map((r) => r.status).sort()).toEqual(["pending", "released"]);
  });

  test("slots of unpublished editions and unknown slots can't be held", async () => {
    const { data: draft } = await admin
      .from("slots")
      .select("id, editions!inner(status)")
      .eq("label", DRAFT_EDITION_SLOT_LABEL)
      .eq("editions.status", "draft")
      .single();
    expect(await placeHold(admin, { slotId: draft!.id })).toEqual({ ok: false, reason: "edition_closed" });
    expect(await placeHold(admin, { slotId: crypto.randomUUID() })).toEqual({ ok: false, reason: "slot_not_found" });
  });

  test("anon can neither call hold_slot nor read reservations", async () => {
    const rpc = await anon.rpc("hold_slot", { p_slot_id: slotId, p_token_hash: "0".repeat(64) });
    expect(rpc.error).not.toBeNull();

    const { data } = await anon.from("reservations").select("id");
    expect(data ?? []).toEqual([]);
  });
});
