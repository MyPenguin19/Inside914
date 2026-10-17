import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { makeImage } from "../fixtures/images";

// REAL Supabase (dev project: database, Storage, RLS, confirm_booking()) with a FAKE Stripe client
// and a FAKE email sender, so every database rule is exercised without network calls to Stripe or
// Resend. Real Stripe test-mode behavior is in stripe.test.ts.
vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const checkout = await import("@/lib/checkout/service");
const { handleStripeEvent } = await import("@/lib/checkout/webhook");
const outbox = await import("@/lib/email/outbox");
const tokens = await import("@/lib/access/tokens");
const { TERMS_VERSION } = await import("@/lib/checkout/terms");

const url = process.env.SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const EDITION = "00000000-0000-4000-8000-000000000101";

const CONTACT = {
  businessName: "Luigi's Pizzeria",
  contactName: "Ana Ruiz",
  email: "Ana@Example.com",
  phone: "914-555-0123",
  website: "",
  category: "",
};

type StripeClient = import("@/lib/checkout/stripe").StripeClient;

function fakeStripe() {
  let n = 0;
  const intents = new Map<string, { id: string; status: string; client_secret: string; metadata: Record<string, string>; customer: string; payment_method: string | null }>();
  const fake = {
    customers: { create: vi.fn(async () => ({ id: `cus_fake${++n}` })), update: vi.fn(async () => ({})) },
    setupIntents: {
      create: vi.fn(async (p: { metadata: Record<string, string>; customer: string }) => {
        const id = `seti_fake${++n}${randomUUID().slice(0, 6)}`;
        intents.set(id, { id, status: "requires_payment_method", client_secret: `${id}_secret`, metadata: p.metadata, customer: p.customer, payment_method: null });
        return intents.get(id)!;
      }),
      retrieve: vi.fn(async (id: string) => intents.get(id)!),
    },
    paymentMethods: { detach: vi.fn(async () => ({})) },
    succeed(id: string) {
      Object.assign(intents.get(id)!, { status: "succeeded", payment_method: "pm_fakecard" });
    },
    intent: (id: string) => intents.get(id)!,
  };
  // Implements only the Stripe calls checkout makes.
  return fake as unknown as StripeClient & typeof fake;
}

describe.skipIf(!secretKey)("checkout and confirmation (real Supabase, fake Stripe)", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  const slotIds: Record<string, string> = {};

  beforeAll(async () => {
    admin = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    anon = createClient<Database>(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await admin.from("slots").select("id, label").eq("edition_id", EDITION);
    for (const s of data ?? []) slotIds[s.label] = s.id;
  });

  afterEach(async () => {
    const { data } = await admin.from("booking_artwork").select("storage_path");
    if (data?.length) await admin.storage.from("artwork").remove(data.map((r) => r.storage_path));
    await admin.from("bookings").delete().eq("edition_id", EDITION);
    await admin.from("stripe_events").delete().like("id", "evt_inttest_%");
  });

  // A hold with ready artwork; optionally with contact, a SetupIntent and consent.
  async function prepare(labels: string[], steps: { contact?: boolean; payment?: boolean; consent?: boolean } = {}) {
    const hold = await placeHold(admin, { slotIds: labels.map((l) => slotIds[l]) });
    if (!hold.ok) throw new Error(`hold failed: ${hold.reason}`);
    const path = `${hold.bookingId}/${randomUUID()}`;
    await admin.storage.from("artwork").upload(path, await makeImage("png", 900, 900), { contentType: "image/png" });
    await admin.from("booking_artwork").insert({
      booking_id: hold.bookingId, storage_path: path, status: "ready", content_type: "image/png", byte_size: 1000,
      width_px: 900, height_px: 900, crop_x: 0, crop_y: 0, crop_width: 900, crop_height: 830, zoom: 1,
    });
    const stripe = fakeStripe();
    let setupIntentId: string | null = null;
    if (steps.contact !== false) expect(await checkout.saveContact(admin, hold.token, CONTACT)).toEqual({ ok: true });
    if (steps.payment !== false && steps.contact !== false) {
      const started = await checkout.startPayment(admin, stripe, hold.token);
      if (!started.ok) throw new Error(`startPayment: ${started.reason}`);
      setupIntentId = started.setupIntentId;
      if (steps.consent !== false) {
        expect(await checkout.recordConsent(admin, hold.token, { accepted: true, termsVersion: TERMS_VERSION })).toEqual({ ok: true });
      }
    }
    return { token: hold.token, bookingId: hold.bookingId, stripe, setupIntentId };
  }

  const bookingRow = async (id: string) => (await admin.from("bookings").select("*").eq("id", id).single()).data!;
  const liveClaims = async (id: string) =>
    (await admin.from("booking_slots").select("slot_id").eq("booking_id", id).is("released_at", null)).data ?? [];

  describe("customer details", () => {
    test("valid details are stored normalized; invalid ones are rejected and not stored", async () => {
      const { token, bookingId } = await prepare(["B1"], { contact: false });
      const bad = await checkout.saveContact(admin, token, { ...CONTACT, email: "nope", phone: "12" });
      expect(bad).toMatchObject({ ok: false, reason: "invalid", errors: { email: expect.any(String), phone: expect.any(String) } });
      expect((await admin.from("booking_contacts").select("*").eq("booking_id", bookingId)).data).toEqual([]);

      expect(await checkout.saveContact(admin, token, CONTACT)).toEqual({ ok: true });
      const { data } = await admin.from("booking_contacts").select("email, phone").eq("booking_id", bookingId).single();
      expect(data).toEqual({ email: "ana@example.com", phone: "+19145550123" });
    });

    test("an expired hold can't continue checkout", async () => {
      const { token, bookingId } = await prepare(["B2"], { contact: false });
      await admin.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", bookingId);
      expect(await checkout.saveContact(admin, token, CONTACT)).toEqual({ ok: false, reason: "hold_expired" });
    });
  });

  describe("server-side pricing and consent", () => {
    test("consent records the booking's own TEST price: $1 standard, $2 double, marked as test", async () => {
      const standard = await prepare(["F1"]);
      const double = await prepare(["F3", "F4"]);
      const amount = async (id: string) =>
        (await admin.from("payment_consents").select("amount_cents, terms_version, edition_id, pricing_mode").eq("booking_id", id).single()).data;
      expect(await amount(standard.bookingId)).toEqual({ amount_cents: 100, terms_version: TERMS_VERSION, edition_id: EDITION, pricing_mode: "test" });
      expect(await amount(double.bookingId)).toMatchObject({ amount_cents: 200, pricing_mode: "test" });
      expect(double.stripe.intent(double.setupIntentId!).metadata).toMatchObject({ amount_cents: "200", size: "double", pricing_mode: "test" });
      expect(await bookingRow(standard.bookingId)).toMatchObject({ price_cents: 100, pricing_mode: "test" });
    });

    test("consent must be an explicit true for the current terms", async () => {
      const { token } = await prepare(["F5"], { consent: false });
      expect(await checkout.recordConsent(admin, token, { accepted: false, termsVersion: TERMS_VERSION })).toEqual({ ok: false, reason: "consent_required" });
      expect(await checkout.recordConsent(admin, token, { accepted: "yes", termsVersion: TERMS_VERSION })).toEqual({ ok: false, reason: "consent_required" });
      expect(await checkout.recordConsent(admin, token, { accepted: true, termsVersion: "old" })).toEqual({ ok: false, reason: "terms_changed" });
    });

    test("starting payment again reuses the same Stripe customer and SetupIntent", async () => {
      const { token, stripe, setupIntentId } = await prepare(["F6"]);
      const again = await checkout.startPayment(admin, stripe, token);
      expect(again).toMatchObject({ ok: true, setupIntentId });
      expect(stripe.customers.create).toHaveBeenCalledTimes(1);
      expect(stripe.setupIntents.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("confirming the reservation", () => {
    test("standard: confirmed once Stripe says the card is saved; slot stays taken", async () => {
      const { bookingId, stripe, setupIntentId } = await prepare(["B3"]);
      expect(await checkout.completeReservation(admin, stripe, bookingId)).toBe("setup_not_succeeded");

      stripe.succeed(setupIntentId!);
      expect(await checkout.completeReservation(admin, stripe, bookingId)).toBe("confirmed");
      const row = await bookingRow(bookingId);
      expect(row).toMatchObject({ status: "reserved", stripe_payment_method_id: "pm_fakecard", hold_expires_at: null });
      expect(row.reference).toMatch(/^IN914-[A-HJ-NP-Z2-9]{6}$/);
      expect(await liveClaims(bookingId)).toHaveLength(1);
      const { data } = await anon.from("slot_availability").select("available").eq("slot_id", slotIds.B3).single();
      expect(data?.available).toBe(false);
    });

    test("double: both units are confirmed together as one $2 (test price) reservation", async () => {
      const { bookingId, stripe, setupIntentId } = await prepare(["B5", "B6"]);
      stripe.succeed(setupIntentId!);
      expect(await checkout.completeReservation(admin, stripe, bookingId)).toBe("confirmed");
      expect(await bookingRow(bookingId)).toMatchObject({ status: "reserved", size: "double", price_cents: 200, pricing_mode: "test" });
      expect(await liveClaims(bookingId)).toHaveLength(2);
    });

    test("simultaneous confirmations: exactly one confirms, the rest are no-ops, one email queued", async () => {
      const { bookingId, stripe, setupIntentId } = await prepare(["B7"]);
      stripe.succeed(setupIntentId!);
      const results = await Promise.all(Array.from({ length: 6 }, () => checkout.completeReservation(admin, stripe, bookingId)));
      expect(results.filter((r) => r === "confirmed")).toHaveLength(1);
      expect(results.filter((r) => r === "already_confirmed")).toHaveLength(5);
      expect((await admin.from("email_outbox").select("id").eq("booking_id", bookingId)).data).toHaveLength(1);
    });

    test("an expired hold is never confirmed: it's released and the card is removed", async () => {
      const { bookingId, stripe, setupIntentId } = await prepare(["B8"]);
      stripe.succeed(setupIntentId!);
      await admin.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", bookingId);

      expect(await checkout.completeReservation(admin, stripe, bookingId)).toBe("hold_expired");
      expect((await bookingRow(bookingId)).status).toBe("released");
      expect(await liveClaims(bookingId)).toHaveLength(0);
      expect(stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_fakecard");
    });

    test("no consent, or a SetupIntent that isn't this booking's, can't confirm", async () => {
      const noConsent = await prepare(["F7"], { consent: false });
      noConsent.stripe.succeed(noConsent.setupIntentId!);
      expect(await checkout.completeReservation(admin, noConsent.stripe, noConsent.bookingId)).toBe("consent_missing");

      const other = await prepare(["F8"]);
      other.stripe.succeed(other.setupIntentId!);
      other.stripe.intent(other.setupIntentId!).metadata.booking_id = noConsent.bookingId;
      expect(await checkout.completeReservation(admin, other.stripe, other.bookingId)).toBe("setup_mismatch");
      expect((await bookingRow(other.bookingId)).status).toBe("pending");
    });

    test("duplicate webhook deliveries are processed once", async () => {
      const { bookingId, stripe, setupIntentId } = await prepare(["F2"]);
      stripe.succeed(setupIntentId!);
      const event = {
        id: `evt_inttest_${randomUUID().replaceAll("-", "")}`,
        type: "setup_intent.succeeded",
        data: { object: { id: setupIntentId, metadata: { booking_id: bookingId } } },
      } as never;
      const send = vi.fn(async () => ({ id: "email_1" }));
      expect(await handleStripeEvent(admin, stripe, event, send)).toBe("handled");
      expect(await handleStripeEvent(admin, stripe, event, send)).toBe("duplicate");
      expect((await bookingRow(bookingId)).status).toBe("reserved");
      expect(send).toHaveBeenCalledTimes(1);
    });

    const setupEvent = (type: string, setupIntentId: string, bookingId: string, created: number) =>
      ({ id: `evt_inttest_${randomUUID().replaceAll("-", "")}`, type, created, data: { object: { id: setupIntentId, metadata: { booking_id: bookingId } } } }) as never;
    const setupStatus = async (id: string) =>
      (await admin.from("bookings").select("stripe_setup_status, status").eq("id", id).single()).data;

    test("setup_failed and canceled are recorded; nothing is confirmed or charged", async () => {
      const failed = await prepare(["B1"]);
      const now = Math.floor(Date.now() / 1000);
      expect(await handleStripeEvent(admin, failed.stripe, setupEvent("setup_intent.setup_failed", failed.setupIntentId!, failed.bookingId, now))).toBe("handled");
      expect(await setupStatus(failed.bookingId)).toEqual({ stripe_setup_status: "failed", status: "pending" });

      const canceled = await prepare(["B2"]);
      await handleStripeEvent(admin, canceled.stripe, setupEvent("setup_intent.canceled", canceled.setupIntentId!, canceled.bookingId, now));
      expect(await setupStatus(canceled.bookingId)).toEqual({ stripe_setup_status: "canceled", status: "pending" });
    });

    test("out-of-order delivery: an older failure can't overwrite a newer success", async () => {
      const { bookingId, stripe, setupIntentId } = await prepare(["B3"]);
      stripe.succeed(setupIntentId!);
      const now = Math.floor(Date.now() / 1000);
      await handleStripeEvent(admin, stripe, setupEvent("setup_intent.succeeded", setupIntentId!, bookingId, now));
      await handleStripeEvent(admin, stripe, setupEvent("setup_intent.setup_failed", setupIntentId!, bookingId, now - 60));
      expect(await setupStatus(bookingId)).toEqual({ stripe_setup_status: "succeeded", status: "reserved" });
    });

    test("an event naming another booking's SetupIntent changes nothing", async () => {
      const mine = await prepare(["B4"]);
      const other = await prepare(["B5"]);
      const now = Math.floor(Date.now() / 1000);
      // Valid-looking event that pairs my booking id with someone else's SetupIntent.
      await handleStripeEvent(admin, mine.stripe, setupEvent("setup_intent.setup_failed", other.setupIntentId!, mine.bookingId, now));
      expect(await setupStatus(mine.bookingId)).toEqual({ stripe_setup_status: null, status: "pending" });
      other.stripe.succeed(other.setupIntentId!);
      await handleStripeEvent(admin, mine.stripe, setupEvent("setup_intent.succeeded", other.setupIntentId!, mine.bookingId, now));
      expect((await setupStatus(mine.bookingId))?.status).toBe("pending"); // completeReservation rejects the mismatch
    });

    test("a malformed booking id in metadata is ignored, not retried forever", async () => {
      const { stripe, setupIntentId } = await prepare(["B6"]);
      expect(await handleStripeEvent(admin, stripe, setupEvent("setup_intent.setup_failed", setupIntentId!, "not-a-uuid", 1))).toBe("ignored");
    });
  });

  describe("confirmation email outbox", () => {
    async function confirmed(label: string) {
      const ctx = await prepare([label]);
      ctx.stripe.succeed(ctx.setupIntentId!);
      expect(await checkout.completeReservation(admin, ctx.stripe, ctx.bookingId)).toBe("confirmed");
      const { data } = await admin.from("email_outbox").select("id").eq("booking_id", ctx.bookingId).single();
      return { ...ctx, outboxId: data!.id };
    }

    test("a failed send is retried later, its link revoked, and success is never repeated", async () => {
      const { bookingId, outboxId } = await confirmed("B4");
      const failing = vi.fn(async () => Promise.reject(new Error("resend_503")));
      expect(await outbox.processOutboxRow(admin, outboxId, failing)).toBe("failed");
      let row = (await admin.from("email_outbox").select("*").eq("id", outboxId).single()).data!;
      expect(row).toMatchObject({ status: "failed", attempts: 1, last_error: "resend_503" });
      expect(Date.parse(row.next_attempt_at)).toBeGreaterThan(Date.now());
      const issued = (await admin.from("booking_access_tokens").select("revoked_at").eq("booking_id", bookingId)).data!;
      expect(issued.every((t) => t.revoked_at)).toBe(true);
      expect((await admin.from("bookings").select("status").eq("id", bookingId).single()).data!.status).toBe("reserved");

      // Not due yet: skipped.
      const working = vi.fn(async () => ({ id: "email_ok" }));
      expect(await outbox.processOutboxRow(admin, outboxId, working)).toBe("skipped");

      await admin.from("email_outbox").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", outboxId);
      expect(await outbox.processOutboxRow(admin, outboxId, working)).toBe("sent");
      row = (await admin.from("email_outbox").select("*").eq("id", outboxId).single()).data!;
      expect(row).toMatchObject({ status: "sent", attempts: 2, provider_message_id: "email_ok" });

      const message = (working.mock.calls[0] as unknown[])[0] as { to: string; text: string };
      expect(message.to).toBe("ana@example.com");
      expect(message.text).toMatch(/\/r\/[A-Za-z0-9_-]{43}/);
      expect(message.text).not.toMatch(/\b(cus|seti|pm)_/);

      expect(await outbox.processOutboxRow(admin, outboxId, working)).toBe("skipped");
      expect(working).toHaveBeenCalledTimes(1);
    });

    test("two workers processing at once send only one email", async () => {
      const { outboxId } = await confirmed("B2");
      const slow = vi.fn(() => new Promise<{ id: string }>((r) => setTimeout(() => r({ id: "email_x" }), 200)));
      const results = await Promise.all([outbox.processOutboxRow(admin, outboxId, slow), outbox.processOutboxRow(admin, outboxId, slow)]);
      expect(results.sort()).toEqual(["sent", "skipped"]);
      expect(slow).toHaveBeenCalledTimes(1);
    });
  });

  describe("account-free reservation links", () => {
    test("open only their own reservation, and stop working when expired, revoked or rotated", async () => {
      const a = await prepare(["F1"], { contact: false });
      const b = await prepare(["F2"], { contact: false });
      const tokenA = await tokens.issueAccessToken(admin, a.bookingId);
      expect(await tokens.resolveAccessToken(admin, tokenA.token)).toBe(a.bookingId);
      expect(await tokens.resolveAccessToken(admin, tokenA.token)).not.toBe(b.bookingId);
      expect(await tokens.resolveAccessToken(admin, "x".repeat(43))).toBeNull();
      expect(await tokens.resolveAccessToken(admin, undefined)).toBeNull();

      const expired = await tokens.issueAccessToken(admin, a.bookingId, -1);
      expect(await tokens.resolveAccessToken(admin, expired.token)).toBeNull();

      await tokens.revokeAccessToken(admin, tokenA.id);
      expect(await tokens.resolveAccessToken(admin, tokenA.token)).toBeNull();

      const first = await tokens.issueAccessToken(admin, b.bookingId);
      const rotated = await tokens.rotateAccessToken(admin, b.bookingId);
      expect(await tokens.resolveAccessToken(admin, first.token)).toBeNull();
      expect(await tokens.resolveAccessToken(admin, rotated.token)).toBe(b.bookingId);
    });
  });

  test("the public can't read any checkout data or confirm bookings", async () => {
    await prepare(["F6"]);
    for (const table of ["booking_contacts", "payment_consents", "booking_access_tokens", "email_outbox", "stripe_events"] as const) {
      const { data } = await anon.from(table).select("*");
      expect(data ?? [], table).toEqual([]);
    }
    const { error } = await anon.rpc("confirm_booking", {
      p_booking_id: randomUUID(), p_setup_intent_id: "seti_x", p_payment_method_id: "pm_x", p_reference: "IN914-AAAAAA",
    });
    expect(error).not.toBeNull();
  });
});
