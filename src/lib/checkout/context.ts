import "server-only";
import { cookies } from "next/headers";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReservationView, type ReservationView } from "./reservation";
import { checkoutGate, getBookingByHoldToken, type CheckoutBooking, type GateFailure } from "./service";

// What the checkout pages need about the visitor's booking (found through the hold cookie).
export type CheckoutContext =
  | { kind: "blocked"; reason: GateFailure | "error"; editionId?: string }
  | { kind: "ok"; booking: CheckoutBooking; view: ReservationView };

export async function loadCheckoutContext(needs: { contact?: boolean; allowConfirmed?: boolean } = {}): Promise<CheckoutContext> {
  // Outside the try: during prerendering Next signals "render per request" through cookies().
  const token = (await cookies()).get(HOLD_COOKIE)?.value;
  try {
    const admin = createAdminClient();
    const booking = await getBookingByHoldToken(admin, token);
    const gate = checkoutGate(booking, needs);
    if (gate && !(gate === "already_confirmed" && needs.allowConfirmed)) {
      return { kind: "blocked", reason: gate, editionId: booking?.editionId };
    }
    const view = await getReservationView(admin, booking!.id);
    if (!view) return { kind: "blocked", reason: "no_hold" };
    return { kind: "ok", booking: booking!, view };
  } catch (error) {
    console.error("loadCheckoutContext failed", error instanceof Error ? error.message : "unknown");
    return { kind: "blocked", reason: "error" };
  }
}
