import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { makeImage } from "../fixtures/images";

// REAL Stripe TEST MODE + real Supabase. Skipped unless STRIPE_SECRET_KEY (sk_test_) and
// SUPABASE_SECRET_KEY are in .env.local. Uses Stripe's published test payment methods.
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const checkout = await import("@/lib/checkout/service");
const { getStripe } = await import("@/lib/checkout/stripe");
const { TERMS_VERSION } = await import("@/lib/checkout/terms");

const EDITION = "00000000-0000-4000-8000-000000000101";
const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
const enabled = !!process.env.SUPABASE_SECRET_KEY && /^(sk|rk)_test_/.test(stripeKey);

describe.skipIf(!enabled)("Stripe test mode: saved cards, no charges", () => {
  let admin: SupabaseClient<Database>;
  const slotIds: Record<string, string> = {};
  const customers: string[] = [];

  beforeAll(async () => {
    // These tests must exercise Stripe even when local fake-card mode is normally enabled.
    vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS", "false");
    admin = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const { data } = await admin.from("slots").select("id, label").eq("edition_id", EDITION);
    for (const s of data ?? []) slotIds[s.label] = s.id;
  });

  afterEach(async () => {
    for (const id of customers.splice(0)) await getStripe().customers.del(id).catch(() => {});
    const { data } = await admin.from("booking_artwork").select("storage_path");
    if (data?.length) await admin.storage.from("artwork").remove(data.map((r) => r.storage_path));
    await admin.from("bookings").delete().eq("edition_id", EDITION);
  });

  async function readyForCard(labels: string[]) {
    const hold = await placeHold(admin, { slotIds: labels.map((l) => slotIds[l]) });
    if (!hold.ok) throw new Error(hold.reason);
    const path = `${hold.bookingId}/${randomUUID()}`;
    await admin.storage.from("artwork").upload(path, await makeImage("png", 900, 900), { contentType: "image/png" });
    await admin.from("booking_artwork").insert({
      booking_id: hold.bookingId, storage_path: path, status: "ready", content_type: "image/png", byte_size: 1000,
      width_px: 900, height_px: 900, crop_x: 0, crop_y: 0, crop_width: 900, crop_height: 830, zoom: 1,
    });
    await checkout.saveContact(admin, hold.token, {
      businessName: "Stripe Test Co", contactName: "Test Person", email: "stripe-test@example.com", phone: "9145550123", website: "", category: "",
    });
    const started = await checkout.startPayment(admin, getStripe(), hold.token);
    if (!started.ok) throw new Error(started.reason);
    const booking = await checkout.getBookingById(admin, hold.bookingId);
    customers.push(booking!.stripeCustomerId!);
    await checkout.recordConsent(admin, hold.token, { accepted: true, termsVersion: TERMS_VERSION });
    return { ...hold, setupIntentId: started.setupIntentId, customerId: booking!.stripeCustomerId! };
  }

  test("a saved Visa confirms the $1 (test price) reservation, and nothing is charged", async () => {
    const stripe = getStripe();
    const ctx = await readyForCard(["F1"]);
    const intent = await stripe.setupIntents.retrieve(ctx.setupIntentId);
    expect(intent).toMatchObject({ usage: "off_session", metadata: { amount_cents: "100", pricing_mode: "test", booking_id: ctx.bookingId } });

    await stripe.setupIntents.confirm(ctx.setupIntentId, { payment_method: "pm_card_visa" });
    expect(await checkout.completeReservation(admin, stripe, ctx.bookingId)).toBe("confirmed");

    // Read-only checks with a full client: the app's client can't even list payments.
    const full = new Stripe(stripeKey);
    const payments = await full.paymentIntents.list({ customer: ctx.customerId, limit: 5 });
    const subscriptions = await full.subscriptions.list({ customer: ctx.customerId, limit: 5 });
    const cards = await stripe.paymentMethods.list({ customer: ctx.customerId, type: "card" });
    expect(payments.data).toEqual([]);
    expect(subscriptions.data).toEqual([]);
    expect(cards.data).toHaveLength(1);
  });

  test("a $2 (test price) double reservation is authorized as one SetupIntent", async () => {
    const ctx = await readyForCard(["F3", "F4"]);
    const intent = await getStripe().setupIntents.retrieve(ctx.setupIntentId);
    expect(intent.metadata).toMatchObject({ amount_cents: "200", size: "double", pricing_mode: "test" });
  });

  test("a declined card can't be saved, so the reservation isn't confirmed", async () => {
    const stripe = getStripe();
    const ctx = await readyForCard(["F5"]);
    await expect(stripe.setupIntents.confirm(ctx.setupIntentId, { payment_method: "pm_card_chargeDeclined" })).rejects.toThrow();
    expect(await checkout.completeReservation(admin, stripe, ctx.bookingId)).toBe("setup_not_succeeded");
  });

  test("a card needing bank verification waits for it before anything is confirmed", async () => {
    const stripe = getStripe();
    const ctx = await readyForCard(["F6"]);
    const intent = await stripe.setupIntents.confirm(ctx.setupIntentId, {
      payment_method: "pm_card_authenticationRequired",
      return_url: "http://localhost:3000/book/complete",
    });
    expect(intent.status).toBe("requires_action");
    expect(await checkout.completeReservation(admin, stripe, ctx.bookingId)).toBe("setup_not_succeeded");
  });
});
