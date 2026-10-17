import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { makeImage } from "../fixtures/images";

// REAL Supabase + the development fake Stripe: a TEST reservation goes through the unchanged
// production confirmation path, stays labeled TEST, can't cross into real mode, and is never emailed.
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const checkout = await import("@/lib/checkout/service");
const { fakeStripe } = await import("@/lib/dev/fake-stripe");
const { getReservationView } = await import("@/lib/checkout/reservation");
const outbox = await import("@/lib/email/outbox");
const { TERMS_VERSION } = await import("@/lib/checkout/terms");

const EDITION = "00000000-0000-4000-8000-000000000101";
const fake = fakeStripe as unknown as import("@/lib/checkout/stripe").StripeClient;

describe.skipIf(!process.env.SUPABASE_SECRET_KEY)("development TEST reservations", () => {
  let admin: SupabaseClient<Database>;
  const slotIds: Record<string, string> = {};

  beforeAll(async () => {
    admin = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const { data } = await admin.from("slots").select("id, label").eq("edition_id", EDITION);
    for (const s of data ?? []) slotIds[s.label] = s.id;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    const { data } = await admin.from("booking_artwork").select("storage_path");
    if (data?.length) await admin.storage.from("artwork").remove(data.map((r) => r.storage_path));
    await admin.from("bookings").delete().eq("edition_id", EDITION);
  });

  async function testReservationUpToCard(label: string) {
    const hold = await placeHold(admin, { slotIds: [slotIds[label]] });
    if (!hold.ok) throw new Error(hold.reason);
    const path = `${hold.bookingId}/${randomUUID()}`;
    await admin.storage.from("artwork").upload(path, await makeImage("png", 900, 900), { contentType: "image/png" });
    await admin.from("booking_artwork").insert({
      booking_id: hold.bookingId, storage_path: path, status: "ready", content_type: "image/png", byte_size: 1000,
      width_px: 900, height_px: 900, crop_x: 0, crop_y: 0, crop_width: 900, crop_height: 830, zoom: 1,
    });
    await checkout.saveContact(admin, hold.token, {
      businessName: "Test Bakery", contactName: "Dev Tester", email: "dev@example.com", phone: "9145550199", website: "", category: "",
    });
    const started = await checkout.startPayment(admin, fake, hold.token);
    if (!started.ok) throw new Error(started.reason);
    return { ...hold, setupIntentId: started.setupIntentId };
  }

  test("the full flow completes as a TEST reservation through the normal confirmation rules", async () => {
    const ctx = await testReservationUpToCard("F1");
    // Production rule still applies: no consent, no reservation.
    fakeStripe.simulateSuccess(ctx.setupIntentId);
    expect(await checkout.completeReservation(admin, fake, ctx.bookingId)).toBe("consent_missing");

    await checkout.recordConsent(admin, ctx.token, { accepted: true, termsVersion: TERMS_VERSION });
    expect(await checkout.completeReservation(admin, fake, ctx.bookingId)).toBe("confirmed");

    const row = (await admin.from("bookings").select("*").eq("id", ctx.bookingId).single()).data!;
    expect(row.status).toBe("reserved");
    for (const id of [row.stripe_customer_id, row.stripe_setup_intent_id, row.stripe_payment_method_id]) {
      expect(id).toMatch(/^(cus|seti|pm)_devtest_/);
    }
    expect((await getReservationView(admin, ctx.bookingId))!.isTest).toBe(true);
  });

  test("a TEST reservation can't be continued or confirmed with real Stripe", async () => {
    const ctx = await testReservationUpToCard("F2");
    const realStripe = { customers: {}, setupIntents: { retrieve: vi.fn() }, paymentMethods: {} } as never;
    expect(await checkout.startPayment(admin, realStripe, ctx.token)).toEqual({ ok: false, reason: "test_booking" });
    expect(await checkout.completeReservation(admin, realStripe, ctx.bookingId)).toBe("test_booking");
  });

  test("a real-card booking can't be finished in test mode", async () => {
    const hold = await placeHold(admin, { slotIds: [slotIds.F3] });
    if (!hold.ok) throw new Error(hold.reason);
    await admin.from("bookings").update({ stripe_customer_id: "cus_RealLooking123", stripe_setup_intent_id: "seti_RealLooking123" }).eq("id", hold.bookingId);
    expect(await checkout.completeReservation(admin, fake, hold.bookingId)).toBe("real_booking");
  });

  test("TEST reservations are never emailed, even with a Resend key configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_should_never_be_used");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const send = vi.fn(async () => ({ id: "should-not-happen" }));

    const ctx = await testReservationUpToCard("F4");
    await checkout.recordConsent(admin, ctx.token, { accepted: true, termsVersion: TERMS_VERSION });
    fakeStripe.simulateSuccess(ctx.setupIntentId);
    expect(await checkout.completeReservation(admin, fake, ctx.bookingId)).toBe("confirmed");

    await outbox.processOutboxForBooking(admin, ctx.bookingId, send);
    expect(send).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("api.resend.com"))).toBe(false);
    const row = (await admin.from("email_outbox").select("status, provider_message_id").eq("booking_id", ctx.bookingId).single()).data;
    expect(row).toEqual({ status: "sent", provider_message_id: outbox.TEST_NOT_DELIVERED });
  });
});
