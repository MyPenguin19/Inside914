import "server-only";
import { assertCheckoutReleased } from "@/lib/checkout/release";
import { acceptsCrop } from "@/lib/print/layouts";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { hashHoldToken } from "@/lib/booking/hold-token";
import { isFakeStripe } from "@/lib/dev/fake-stripe";
import { isTestStripeId } from "@/lib/dev/test-mode";
import type { Database } from "@/lib/supabase/database.types";
import { parseContact, type ContactErrors } from "./contact";
import type { StripeClient } from "./stripe";
import { TERMS_VERSION, consentText } from "./terms";

// Checkout steps after artwork: contact details -> SetupIntent (save card, $0) -> consent ->
// confirmation. Customer-facing steps are authorized by the hold token; prices always come from
// the booking row the server created, never from the browser. Nothing here can charge a card.

type Admin = SupabaseClient<Database>;

export type CheckoutBooking = {
  id: string;
  cartId?: string | null;
  categoryId?: string | null;
  productModel?: string;
  sharedArtwork?: string | null;
  editionId: string;
  status: string;
  size: import("@/lib/booking/products").BookingSize;
  priceCents: number;
  frontPriceCents?: number | null;
  backPriceCents?: number | null;
  pricingMode: "launch" | "test";
  holdExpiresAt: string | null;
  holdExtensions: number;
  stripeCustomerId: string | null;
  stripeSetupIntentId: string | null;
  reference: string | null;
  contact: Database["public"]["Tables"]["booking_contacts"]["Row"] | null;
  artworkReady: boolean;
};

type Row = Database["public"]["Tables"]["bookings"]["Row"] & {
  booking_contacts: Database["public"]["Tables"]["booking_contacts"]["Row"] | null;
  editions: { layout_template: string | null; product_model: string } | null;
  booking_artwork: Database["public"]["Tables"]["booking_artwork"]["Row"] | null;
};

function toCheckoutBooking(row: Row): CheckoutBooking {
  return {
    id: row.id,
    cartId: row.cart_id,
    categoryId: row.category_id,
    productModel: row.editions?.product_model,
    sharedArtwork: row.booking_artwork?.shared_source_id ? JSON.stringify([row.booking_artwork.shared_source_id,row.booking_artwork.crop_x,row.booking_artwork.crop_y,row.booking_artwork.crop_width,row.booking_artwork.crop_height,row.booking_artwork.zoom,row.booking_artwork.width_px,row.booking_artwork.height_px,row.booking_artwork.byte_size]) : null,
    editionId: row.edition_id,
    status: row.status,
    size: row.size as import("@/lib/booking/products").BookingSize,
    priceCents: row.price_cents,
    frontPriceCents: row.front_price_cents,
    backPriceCents: row.back_price_cents,
    pricingMode: row.pricing_mode === "test" ? "test" : "launch",
    holdExpiresAt: row.hold_expires_at,
    holdExtensions:row.hold_extensions,
    stripeCustomerId: row.stripe_customer_id,
    stripeSetupIntentId: row.stripe_setup_intent_id,
    reference: row.reference,
    contact: row.booking_contacts,
    artworkReady: row.booking_artwork?.status === "ready" && row.booking_artwork.crop_width !== null &&
      (row.editions?.product_model !== "square_v1" || (
        row.booking_artwork.crop_height !== null && row.booking_artwork.crop_x !== null && row.booking_artwork.crop_y !== null &&
        row.booking_artwork.width_px !== null && row.booking_artwork.height_px !== null && row.booking_artwork.zoom !== null &&
        row.booking_artwork.crop_width > 0 && row.booking_artwork.crop_height > 0 &&
        row.booking_artwork.crop_x >= 0 && row.booking_artwork.crop_y >= 0 &&
        row.booking_artwork.crop_x + row.booking_artwork.crop_width <= row.booking_artwork.width_px &&
        row.booking_artwork.crop_y + row.booking_artwork.crop_height <= row.booking_artwork.height_px &&
        acceptsCrop(row.editions?.layout_template, { width: row.booking_artwork.crop_width, height: row.booking_artwork.crop_height }))),
  };
}

const COLUMNS = "*, editions(product_model, layout_template), booking_contacts(*), booking_artwork(*)";

export async function getBookingByHoldToken(admin: Admin, token: string | undefined) {
  if (!token) return null;
  const { data, error } = await admin.from("bookings").select(COLUMNS).eq("hold_token_hash", hashHoldToken(token)).returns<Row[]>().maybeSingle();
  if (error) throw new Error(`Could not load booking: ${error.message}`);
  return data ? toCheckoutBooking(data) : null;
}

export async function getBookingById(admin: Admin, id: string) {
  const { data, error } = await admin.from("bookings").select(COLUMNS).eq("id", id).returns<Row[]>().maybeSingle();
  if (error) throw new Error(`Could not load booking: ${error.message}`);
  return data ? toCheckoutBooking(data) : null;
}

// Caller must authorize access to this cart before displaying its members.
export async function getBookingsByCartId(admin: Admin, cartId: string) {
  const { data, error } = await admin.from("bookings").select(COLUMNS)
    .eq("cart_id", cartId).order("id").returns<Row[]>();
  if (error) throw new Error(`Could not load cart bookings: ${error.message}`);
  return (data ?? []).map(toCheckoutBooking);
}

export type GateFailure = "no_hold" | "hold_expired" | "already_confirmed" | "artwork_missing" | "contact_missing";

// Can this booking still go through checkout?
export function checkoutGate(booking: CheckoutBooking | null, needs: { contact?: boolean } = {}): GateFailure | null {
  if (!booking) return "no_hold";
  if (booking.status === "reserved") return "already_confirmed";
  if (booking.status !== "pending" || !booking.holdExpiresAt || Date.parse(booking.holdExpiresAt) <= Date.now()) return "hold_expired";
  if (!booking.artworkReady) return "artwork_missing";
  if (needs.contact && !booking.contact) return "contact_missing";
  return null;
}

// Test (simulated-card) bookings and real ones never mix: real Stripe refuses a booking that
// already has dev-test ids, and the dev fake refuses one with real Stripe ids.
export function stripeModeConflict(booking: CheckoutBooking, stripe: StripeClient): "test_booking" | "real_booking" | null {
  const ids = [booking.stripeCustomerId, booking.stripeSetupIntentId].filter(Boolean);
  if (!isFakeStripe(stripe) && ids.some(isTestStripeId)) return "test_booking";
  if (isFakeStripe(stripe) && ids.some((id) => !isTestStripeId(id))) return "real_booking";
  return null;
}

// Step 1: business and contact details (validated + normalized on the server).
export async function saveContact(admin: Admin, token: string | undefined, raw: Record<string, unknown>) {
  const booking = await getBookingByHoldToken(admin, token);
  if (booking?.cartId) return { ok: false as const, reason: "use_cart" as const };
  const gate = checkoutGate(booking);
  if (gate) return { ok: false as const, reason: gate };

  const parsed = parseContact(raw);
  if (!parsed.ok) return { ok: false as const, reason: "invalid" as const, errors: parsed.errors satisfies ContactErrors };

  const c = parsed.contact;
  const { error } = await admin.from("booking_contacts").upsert({
    booking_id: booking!.id,
    business_name: c.businessName,
    contact_name: c.contactName,
    email: c.email,
    phone: c.phone,
    website: c.website,
    category: c.category,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not save contact: ${error.message}`);
  return { ok: true as const };
}

const REUSABLE = new Set(["requires_payment_method", "requires_confirmation", "requires_action", "processing"]);

// Step 2: a Stripe Customer and a SetupIntent for FUTURE off-session use. Saves a card; charges $0.
export async function startPayment(admin: Admin, stripe: StripeClient, token: string | undefined) {
  assertCheckoutReleased();
  const booking = await getBookingByHoldToken(admin, token);
  if (booking?.cartId) return { ok: false as const, reason: "use_cart" as const };
  const gate = checkoutGate(booking, { contact: true });
  if (gate) return { ok: false as const, reason: gate };
  const b = booking!;
  const contact = b.contact!;
  const conflict = stripeModeConflict(b, stripe);
  if (conflict) return { ok: false as const, reason: conflict };

  let customerId = b.stripeCustomerId;
  if (customerId) {
    await stripe.customers.update(customerId, { email: contact.email, name: contact.business_name });
  } else {
    const customer = await stripe.customers.create(
      { email: contact.email, name: contact.business_name, metadata: { booking_id: b.id } },
      { idempotencyKey: `inside914-customer-${b.id}` },
    );
    customerId = customer.id;
    const { error } = await admin.from("bookings").update({ stripe_customer_id: customerId }).eq("id", b.id);
    if (error) throw new Error(`Could not save customer: ${error.message}`);
  }

  if (b.stripeSetupIntentId) {
    const existing = await stripe.setupIntents.retrieve(b.stripeSetupIntentId);
    if (REUSABLE.has(existing.status) || existing.status === "succeeded") {
      return { ok: true as const, clientSecret: existing.client_secret!, setupIntentId: existing.id, status: existing.status };
    }
  }

  const intent = await stripe.setupIntents.create(
    {
      customer: customerId,
      usage: "off_session",
      allowed_payment_method_types: ["card"], // cards only (API 2026-09-30 name)
      metadata: { booking_id: b.id, edition_id: b.editionId, amount_cents: String(b.priceCents), size: b.size, pricing_mode: b.pricingMode },
    },
    { idempotencyKey: `inside914-seti-${b.id}-${b.stripeSetupIntentId ?? "first"}` },
  );
  const { error } = await admin.from("bookings").update({ stripe_setup_intent_id: intent.id }).eq("id", b.id);
  if (error) throw new Error(`Could not save SetupIntent: ${error.message}`);
  return { ok: true as const, clientSecret: intent.client_secret!, setupIntentId: intent.id, status: intent.status };
}

const ConsentInput = z.object({ accepted: z.literal(true), termsVersion: z.string(), displayedConsent: z.string().max(10000).optional() });

// Step 3: record the customer's explicit consent, for the amount the SERVER computed.
export async function recordConsent(admin: Admin, token: string | undefined, raw: unknown) {
  assertCheckoutReleased();
  const input = ConsentInput.safeParse(raw);
  if (!input.success) return { ok: false as const, reason: "consent_required" as const };
  if (input.data.termsVersion !== TERMS_VERSION) return { ok: false as const, reason: "terms_changed" as const };

  const booking = await getBookingByHoldToken(admin, token);
  if (booking?.cartId) return { ok: false as const, reason: "use_cart" as const };
  const gate = checkoutGate(booking, { contact: true });
  if (gate) return { ok: false as const, reason: gate };
  if (!booking!.stripeSetupIntentId) return { ok: false as const, reason: "payment_not_started" as const };

  if (input.data.displayedConsent !== consentText(booking!.priceCents)) return { ok: false as const, reason: "terms_changed" as const };
  const { error } = await admin.from("payment_consents").upsert(
    {
      booking_id: booking!.id,
      edition_id: booking!.editionId,
      stripe_setup_intent_id: booking!.stripeSetupIntentId,
      amount_cents: booking!.priceCents,
      pricing_mode: booking!.pricingMode,
      currency: "usd",
      terms_version: TERMS_VERSION,
      consent_text: consentText(booking!.priceCents),
    },
    { onConflict: "booking_id,stripe_setup_intent_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Could not record consent: ${error.message}`);
  const saved = await admin.from("payment_consents").select("terms_version,consent_text,amount_cents")
    .eq("booking_id", booking!.id).eq("stripe_setup_intent_id", booking!.stripeSetupIntentId!).single();
  if (saved.error) throw new Error("Could not verify recorded consent");
  // An older acceptance is immutable, even if it uses the same SetupIntent.
  if (saved.data.terms_version !== TERMS_VERSION || saved.data.consent_text !== input.data.displayedConsent || saved.data.amount_cents !== booking!.priceCents) {
    return { ok: false as const, reason: "terms_changed" as const };
  }
  return { ok: true as const };
}

export type ConfirmOutcome =
  | "confirmed"
  | "already_confirmed"
  | "hold_expired"
  | "not_pending"
  | "inventory_lost"
  | "edition_closed"
  | "artwork_missing"
  | "contact_missing"
  | "consent_missing"
  | "wrong_setup_intent"
  | "setup_not_succeeded"
  | "setup_mismatch"
  | "test_booking"
  | "real_booking";

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newReference() {
  return `IN914-${Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("")}`;
}

// Outcomes where the card was saved but no reservation exists: remove the card from Stripe.
const RELEASE_CARD: ConfirmOutcome[] = ["hold_expired", "not_pending", "inventory_lost", "edition_closed"];

// Step 4: confirm the reservation. Re-checks the SetupIntent with Stripe (never trusting the
// browser), then runs the all-or-nothing confirm_booking(). Safe to call repeatedly and
// concurrently (from the browser and from the webhook).
export async function completeReservation(admin: Admin, stripe: StripeClient, bookingId: string): Promise<ConfirmOutcome> {
  assertCheckoutReleased();
  const booking = await getBookingById(admin, bookingId);
  if (booking?.cartId) return (await import("@/lib/booking/cart")).completeCart(admin, stripe, booking.cartId);
  if (!booking?.stripeSetupIntentId) return "not_pending";
  if (booking.status === "reserved") return "already_confirmed";
  const conflict = stripeModeConflict(booking, stripe);
  if (conflict) return conflict;

  const intent = await stripe.setupIntents.retrieve(booking.stripeSetupIntentId);
  if (intent.status !== "succeeded") return "setup_not_succeeded";
  const customer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
  const paymentMethod = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (intent.metadata?.booking_id !== booking.id || customer !== booking.stripeCustomerId || !paymentMethod) {
    return "setup_mismatch";
  }

  let outcome: ConfirmOutcome | null = null;
  for (let attempt = 0; attempt < 3 && !outcome; attempt++) {
    const { data, error } = await admin.rpc("confirm_booking", {
      p_booking_id: booking.id,
      p_setup_intent_id: intent.id,
      p_payment_method_id: paymentMethod,
      p_reference: newReference(),
    });
    if (error?.code === "23505" && error.message.includes("reference")) continue; // reference collision
    if (error) throw new Error(`confirm_booking failed: ${error.message}`);
    outcome = data as ConfirmOutcome;
  }
  if (!outcome) throw new Error("confirm_booking: could not allocate a reference");

  if (RELEASE_CARD.includes(outcome)) {
    await stripe.paymentMethods.detach(paymentMethod).catch(() => {});
  }
  return outcome;
}
