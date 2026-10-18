import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

// REAL dev database and REAL Supabase Auth: creates two throwaway users (approved by the owner),
// one admin and one not, and deletes them afterwards. No mocks.
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const data = await import("@/lib/admin/data");
const { campaignStats } = await import("@/lib/admin/metrics");

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const EDITION = "00000000-0000-4000-8000-000000000101";

describe.skipIf(!secretKey)("admin access and data (real Supabase Auth + RLS)", () => {
  let service: SupabaseClient<Database>;
  let asAdmin: SupabaseClient<Database>;
  let asUser: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  const userIds: string[] = [];
  const slotIds: Record<string, string> = {};

  async function signedIn(admin: boolean) {
    const email = `inside914-test-${admin ? "admin" : "user"}-${randomUUID()}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const { data: created, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userIds.push(created.user.id);
    if (admin) await service.from("admins").insert({ user_id: created.user.id });
    const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return client;
  }

  beforeAll(async () => {
    service = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const { data: slots } = await service.from("slots").select("id, label").eq("edition_id", EDITION);
    for (const s of slots ?? []) slotIds[s.label] = s.id;
    asAdmin = await signedIn(true);
    asUser = await signedIn(false);
  });

  afterAll(async () => {
    await service?.from("bookings").delete().eq("edition_id", EDITION);
    for (const id of userIds) await service.auth.admin.deleteUser(id); // admins row cascades
  });

  test("a signed-in non-admin sees no bookings, contacts, consents or admin rows", async () => {
    const hold = await placeHold(service, { slotIds: [slotIds.F1] });
    expect(hold.ok).toBe(true);
    for (const table of ["bookings", "booking_contacts", "payment_consents", "booking_artwork", "email_outbox"] as const) {
      const { data: rows } = await asUser.from(table).select("*").limit(5);
      expect(rows ?? [], table).toEqual([]);
    }
    expect((await asUser.from("admins").select("user_id")).data).toEqual([]);
    expect((await anon.from("bookings").select("id").limit(1)).error).not.toBeNull();
  });

  test("an admin reads real bookings through RLS (no secret key involved)", async () => {
    const { data: rows, error } = await asAdmin.from("bookings").select("id").eq("edition_id", EDITION);
    expect(error).toBeNull();
    expect(rows!.length).toBeGreaterThan(0);
    expect((await asAdmin.from("admins").select("user_id")).data).toHaveLength(1); // only its own row
  });

  test("dashboard counts match the database: a confirmed double is 2 units, 1 reservation, its stored amount", async () => {
    await service.from("bookings").delete().eq("edition_id", EDITION);
    const double = await placeHold(service, { slotIds: [slotIds.B1, slotIds.B2] });
    const held = await placeHold(service, { slotIds: [slotIds.B3] });
    const expired = await placeHold(service, { slotIds: [slotIds.B4] });
    if (!double.ok || !held.ok || !expired.ok) throw new Error("holds failed");
    await service
      .from("bookings")
      .update({ status: "reserved", confirmed_at: new Date().toISOString(), reference: "IN914-ADMNTS", stripe_payment_method_id: "pm_admintest" })
      .eq("id", double.bookingId);
    await service.from("booking_contacts").insert({ booking_id: double.bookingId, business_name: "Admin Test Co", contact_name: "Pat", email: "admin-test-co@example.com", phone: "+19145550100" });
    await service.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", expired.bookingId);

    const edition = (await data.listEditions(asAdmin)).find((e) => e.id === EDITION)!;
    const [slots, bookings] = await Promise.all([data.listSlots(asAdmin, [EDITION]), data.listEditionBookings(asAdmin, [EDITION])]);
    const stats = campaignStats(edition, slots, bookings, Date.now());
    expect(stats).toMatchObject({
      reservedUnits: 2,
      reservations: 1,
      heldUnits: 1, // the expired hold does not count
      availableUnits: slots.length - 3,
      advertisers: 1,
      reservedValueCents: double.priceCents, // what the booking stores ($2 in test pricing)
      paymentMethodsReady: 1,
    });

    // Search, filter and pagination run in the database.
    const found = await data.searchBookings(asAdmin, { filter: "confirmed", q: "admin test", page: 1 });
    expect(found.rows.map((b) => b.id)).toEqual([double.bookingId]);
    expect(found.total).toBe(1);
    expect((await data.searchBookings(asAdmin, { filter: "confirmed", q: "no-such-business", page: 1 })).total).toBe(0);
    expect((await data.searchBookings(asAdmin, { filter: "pending", page: 1 })).rows).toEqual([]); // holds without details aren't advertisers
    // The non-admin's client gets nothing from the same loaders.
    expect((await data.searchBookings(asUser, { filter: "all", page: 1 })).total).toBe(0);
    expect(await data.listEditionBookings(asUser, [EDITION])).toEqual([]);
  });

  test("private artwork can't be read or signed without the server key", async () => {
    const { data: objects } = await service.storage.from("artwork").list("", { limit: 1 });
    const path = objects?.[0] ? objects[0].name : "nothing/here.png";
    for (const client of [anon, asUser, asAdmin]) {
      expect((await client.storage.from("artwork").createSignedUrl(path, 60)).data?.signedUrl).toBeUndefined();
      expect((await client.storage.from("artwork").download(path)).data).toBeNull();
    }
  });
});
