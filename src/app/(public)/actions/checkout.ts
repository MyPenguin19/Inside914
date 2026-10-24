"use server";
import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";


import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";
import type { ContactErrors } from "@/lib/checkout/contact";
import { fakeStripe } from "@/lib/dev/fake-stripe";
import { isDevTestModeActive, isTestStripeId } from "@/lib/dev/test-mode";
import {
  checkoutGate,
  completeReservation,
  getBookingByHoldToken,
  recordConsent,
  saveContact,
  startPayment,
  type ConfirmOutcome,
} from "@/lib/checkout/service";
import { getStripe } from "@/lib/checkout/stripe";
import { processOutboxForBooking } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

const holdToken = async () => (await cookies()).get(HOLD_COOKIE)?.value;

export type ContactFormState = { errors?: ContactErrors; message?: string; values?: Record<string, string>; done?: boolean };

// Details form (useActionState). Keeps what was typed on error; continues to payment on success.
export async function submitContact(_prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  const values = Object.fromEntries(
    ["businessName", "contactName", "email", "phone", "website", "category"].map((k) => [k, String(form.get(k) ?? "")]),
  );
  let result;
  try {
    result = await saveContact(createAdminClient(), await holdToken(), values);
  } catch (error) {
    console.error("submitContact failed", error instanceof Error ? error.message : "unknown");
    return { values, message: "error" };
  }
  if (!result.ok) return result.reason === "invalid" ? { values, errors: result.errors } : { values, message: result.reason };
  redirect("/book/payment");
}

export type BeginPaymentResult =
  | { ok: true; clientSecret: string; status: string }
  | { ok: false; reason: string };

export async function beginPayment(): Promise<BeginPaymentResult> {
  try {
    const result = await startPayment(createAdminClient(), getStripe(), await holdToken());
    return result.ok ? { ok: true, clientSecret: result.clientSecret, status: result.status } : result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("beginPayment failed", message.includes("STRIPE_SECRET_KEY") ? "stripe_not_configured" : "error");
    return { ok: false, reason: message.includes("STRIPE_SECRET_KEY") ? "payments_unavailable" : "error" };
  }
}

export async function giveConsent(input: { accepted: boolean; termsVersion: string; displayedConsent: string }) {
  try {
    return await recordConsent(createAdminClient(), await holdToken(), input);
  } catch (error) {
    console.error("giveConsent failed", error instanceof Error ? error.message : "unknown");
    return { ok: false as const, reason: "error" };
  }
}

// After Stripe confirms the card in the browser: confirm the reservation on the server.
export async function confirmReservation(): Promise<{ outcome: ConfirmOutcome | "no_hold" | "error" }> {
  try {
    const admin = createAdminClient();
    const booking = await getBookingByHoldToken(admin, await holdToken());
    if (!booking) return { outcome: "no_hold" };
    const outcome = await completeReservation(admin, getStripe(), booking.id);
    if (outcome === "confirmed" || outcome === "already_confirmed") {
      notifyOwnerAfterResponse();
      await processOutboxForBooking(admin, booking.id).catch(() => {}); // retried later if it fails
    }
    return { outcome };
  } catch (error) {
    console.error("confirmReservation failed", error instanceof Error ? error.message : "unknown");
    return { outcome: "error" };
  }
}

// DEVELOPMENT ONLY: stands in for Stripe's card form in a TEST reservation. Re-checks the
// fail-closed guard on every call; saves no card and authorizes nothing.
export async function simulateCardSetup(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isDevTestModeActive()) return { ok: false, reason: "test_mode_unavailable" };
  try {
    const booking = await getBookingByHoldToken(createAdminClient(), await holdToken());
    const gate = checkoutGate(booking, { contact: true });
    if (gate) return { ok: false, reason: gate };
    if (!isTestStripeId(booking!.stripeSetupIntentId)) return { ok: false, reason: "real_booking" };
    return fakeStripe.simulateSuccess(booking!.stripeSetupIntentId!) ? { ok: true } : { ok: false, reason: "payment_not_started" };
  } catch (error) {
    console.error("simulateCardSetup failed", error instanceof Error ? error.message : "unknown");
    return { ok: false, reason: "error" };
  }
}
