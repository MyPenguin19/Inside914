import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";
import { completeReservation, getBookingByHoldToken } from "@/lib/checkout/service";
import { getStripe } from "@/lib/checkout/stripe";
import { processOutboxForBooking } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe's return_url after a redirect-based card check (e.g. some bank verifications).
// Confirms on the server (the same idempotent path as the in-page flow), then redirects.
export async function GET(request: Request) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  try {
    const admin = createAdminClient();
    const booking = await getBookingByHoldToken(admin, (await cookies()).get(HOLD_COOKIE)?.value);
    if (!booking) return go("/book/payment?outcome=no_hold");
    const outcome = await completeReservation(admin, getStripe(), booking.id);
    if (outcome === "confirmed" || outcome === "already_confirmed") {
      notifyOwnerAfterResponse();
      await processOutboxForBooking(admin, booking.id).catch(() => {});
      return go("/book/confirmed");
    }
    return go(`/book/payment?outcome=${outcome}`);
  } catch {
    return go("/book/payment?outcome=error");
  }
}
