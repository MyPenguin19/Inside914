import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localLayoutFixture } from "./local-layout-fixture";
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const { releaseHold } = await import("@/lib/booking/held-booking");
const { toAdminBooking } = await import("@/lib/admin/data");
const { paymentReadinessDetail } = await import("@/lib/admin/metrics");
const key = `test-approved-${randomUUID()}`;
const zoneIds: string[] = [];
const editions: string[] = [];
const slots: { id: string; side: "front" | "back"; edition_id: string }[] = [];
let db: SupabaseClient<Database>;
const ids = (side?: string, edition = editions[0]) => slots.filter(s => s.edition_id === edition && (!side || s.side === side)).map(s => s.id);
const full = (side?: string, edition = editions[0]) => placeHold(db, { slotIds: ids(side, edition), mode: side ? "full_side" : "both_sides" });

describe("exclusive postcard products on isolated temporary campaigns", () => {
  beforeAll(async () => {
    db = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    localLayoutFixture(key);
    for (let n = 0; n < 4; n++) {
      const zone = randomUUID(); zoneIds.push(zone);
      expect((await db.from("zones").insert({ id: zone, name: `Full side test ${zone}`, slug: `full-side-${zone}`, household_count: 0 })).error).toBeNull();
      const edition = randomUUID(); editions.push(edition);
      expect((await db.from("editions").insert({ id: edition, zone_id: zone, issue_month: "2098-01-01", status: "open", artwork_deadline: "2097-12-15T23:59:00Z", unit_price_cents: 50000, double_unit_price_cents: 90000, layout_template: key })).error).toBeNull();
      const rows = (["front", "back"] as const).flatMap(side => Array.from({ length: 8 }, (_, i) => ({ id: randomUUID(), edition_id: edition, side, label: `${side === "front" ? "F" : "B"}${i + 1}`, x_in: (i % 2) * 3.25, y_in: Math.floor(i / 2) * 3, width_in: 3.25, height_in: 3 })));
      expect((await db.from("slots").insert(rows)).error).toBeNull(); slots.push(...rows);
    }
  });
  afterEach(async () => { await db.from("bookings").delete().in("edition_id", editions); });
  afterAll(async () => {
    await db.from("editions").delete().in("id", editions);
    await db.from("zones").delete().in("id", zoneIds);
    localLayoutFixture(key, true);
  });
  test("four areas price independently at $1,600/$2,900, in launch and test modes", async () => {
    for (const mode of ["launch", "test"]) {
      process.env.INSIDE914_PRICING_MODE = mode;
      try {
        for (const edition of editions) {
          const front = await full("front", edition);
          expect(front).toMatchObject({ ok: true, size: "full_side", priceCents: 160000 });
          if (!front.ok) throw new Error("hold failed");
          await releaseHold(db, front.token);
          const both = await full(undefined, edition);
          expect(both).toMatchObject({ ok: true, size: "both_sides", priceCents: 290000 });
          if (both.ok) await releaseHold(db, both.token);
        }
      } finally { process.env.INSIDE914_PRICING_MODE = "test"; }
    }
  });
  test("two advertisers can hold opposite sides; neither side can overlap standard/double/both", async () => {
    const results = await Promise.all([full("front"), full("back")]);
    expect(results.every(r => r.ok)).toBe(true);
    expect(await full()).toMatchObject({ ok: false, reason: "slot_unavailable" });
    expect(await placeHold(db, { slotIds: [ids("front")[0]] })).toMatchObject({ ok: false, reason: "slot_unavailable" });
    expect(await placeHold(db, { slotIds: ids("back").slice(0, 2) })).toMatchObject({ ok: false, reason: "slot_unavailable" });
  });
  test("a standard hold prevents full-side and both-sides without partially claiming the rest", async () => {
    expect((await placeHold(db, { slotIds: [ids("front")[0]] })).ok).toBe(true);
    expect(await full("front")).toMatchObject({ ok: false, reason: "slot_unavailable" });
    expect(await full()).toMatchObject({ ok: false, reason: "slot_unavailable" });
    const { data } = await db.from("booking_slots").select("slot_id").in("slot_id", ids()).is("released_at", null);
    expect(data).toHaveLength(1);
    expect((await full("back")).ok).toBe(true);
  });
  test("racing all product sizes never double-books or leaves partial claims", async () => {
    const results = await Promise.all([full(), full("front"), full("back"), full(), placeHold(db, { slotIds: ids("front").slice(0, 2) }), placeHold(db, { slotIds: [ids("back")[0]] })]);
    expect(results.some(r => r.ok)).toBe(true);
    expect(results.filter(r => !r.ok).every(r => !r.ok && r.reason === "slot_unavailable")).toBe(true);
    const { data } = await db.from("booking_slots").select("slot_id, booking_id").in("slot_id", ids()).is("released_at", null);
    expect(new Set(data!.map(c => c.slot_id)).size).toBe(data!.length);
    for (const result of results) if (result.ok) expect(data!.filter(c => c.booking_id === result.bookingId)).toHaveLength(result.size === "both_sides" ? 16 : result.size === "full_side" ? 8 : result.size === "double" ? 2 : 1);
  });
  test("rejects partial, mixed-side, cross-area, duplicate and anonymous requests", async () => {
    for (const selection of [ids("front").slice(1), [...ids("front"), ids("back")[0]], [...ids("front"), ...ids("back", editions[1])], [...ids("front"), ids("front")[0]]]) {
      expect(await placeHold(db, { slotIds: selection, mode: "full_side" })).toMatchObject({ ok: false, reason: "invalid_selection" });
    }
    expect(await placeHold(db, { slotIds: ids("front"), mode: "both_sides" })).toMatchObject({ ok: false, reason: "invalid_selection" });
    const anon = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    expect((await anon.rpc("hold_postcard", { p_slot_ids: ids(), p_size: "both_sides", p_token_hash: "a".repeat(64), p_pricing_mode: "launch" })).error).not.toBeNull();
  });
  test("blocked inventory and draft campaigns cannot be reserved", async () => {
    await db.from("slots").update({ blocked_at: new Date().toISOString(), blocked_reason: "Test" }).eq("id", ids("front")[0]);
    try {
      expect(await full("front")).toMatchObject({ ok: false, reason: "slot_unavailable" });
      expect(await full()).toMatchObject({ ok: false, reason: "slot_unavailable" });
    } finally { await db.from("slots").update({ blocked_at: null, blocked_reason: null }).eq("id", ids("front")[0]); }
    await db.from("editions").update({ status: "draft" }).eq("id", editions[0]);
    try { expect(await full()).toMatchObject({ ok: false, reason: "edition_closed" }); }
    finally { await db.from("editions").update({ status: "open" }).eq("id", editions[0]); }
  });
  test("expiry, explicit release and cancellation free every claimed space", async () => {
    for (const action of ["expiry", "release", "cancelled"]) {
      const held = await full(); if (!held.ok) throw new Error(held.reason);
      if (action === "expiry") await db.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", held.bookingId);
      else if (action === "release") await releaseHold(db, held.token);
      else await db.from("bookings").update({ status: "cancelled" }).eq("id", held.bookingId);
      const next = await full(); expect(next.ok).toBe(true);
      if (next.ok) await releaseHold(db, next.token);
    }
  });
  test("confirmation and admin readiness use the complete claimed inventory and exact consent", async () => {
    for (const side of ["front", undefined]) {
      const held = await full(side); if (!held.ok) throw new Error(held.reason);
      const intent = `seti_local_${randomUUID()}`;
      await db.from("bookings").update({ stripe_setup_intent_id: intent }).eq("id", held.bookingId);
      await db.from("booking_contacts").insert({ booking_id: held.bookingId, business_name: "Test", contact_name: "Test", email: "test@example.com", phone: "+19145550123" });
      await db.from("booking_artwork").insert({ booking_id: held.bookingId, storage_path: `test/${randomUUID()}`, status: "ready", content_type: "image/png", width_px: 1950, height_px: 3600, byte_size: 1000, crop_x: 0, crop_y: 0, crop_width: 1950, crop_height: 3600, zoom: 1 });
      const consent = { booking_id: held.bookingId, edition_id: editions[0], stripe_setup_intent_id: intent, amount_cents: held.priceCents, pricing_mode: "test", terms_version: "test" };
      expect((await db.from("payment_consents").insert(consent)).error).toBeNull();
      const args = { p_booking_id: held.bookingId, p_setup_intent_id: intent, p_payment_method_id: "pm_local", p_reference: side ? "IN914-ABC234" : "IN914-DEF567" };
      const confirmed = await db.rpc("confirm_booking", args);
      expect(confirmed.error).toBeNull();
      expect(confirmed.data).toBe("confirmed");
      const { data } = await db.from("bookings").select("*, booking_slots(slot_id, released_at), booking_contacts(*), booking_artwork(*)").eq("id", held.bookingId).single();
      const admin = toAdminBooking(data!);
      expect(paymentReadinessDetail(admin, { amountCents: held.priceCents }).ready).toBe(true);
      expect(admin.claimedSlotCount).toBe(side ? 8 : 16);
      // Missing even one claim must fail readiness and confirmation.
      await db.from("bookings").update({ status: "pending", hold_expires_at: new Date(Date.now() + 60000).toISOString() }).eq("id", held.bookingId);
      await db.from("booking_slots").update({ released_at: new Date().toISOString() }).eq("booking_id", held.bookingId).eq("slot_id", ids(side)[0]);
      expect((await db.rpc("confirm_booking", args)).data).toBe("inventory_lost");
      await releaseHold(db, held.token);
    }
  });
});
