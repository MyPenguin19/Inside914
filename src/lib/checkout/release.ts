import { CHECKOUT_CLOSED_MESSAGE } from "./messages";
import { devTestMode } from "@/lib/dev/test-mode";
import { RESERVATION_POLICY } from "@/lib/legal/release";

// Owner-approved reservation policies release checkout, independently of charging.
// Environment variables cannot override this reviewed source decision.
export const PUBLIC_CHECKOUT_RELEASED = RESERVATION_POLICY.approvedForReservations;
export { CHECKOUT_CLOSED_MESSAGE } from "./messages";

export function checkoutReleased(env: Record<string, string | undefined> = process.env): boolean {
  return PUBLIC_CHECKOUT_RELEASED || devTestMode(env).active;
}

export function assertCheckoutReleased() {
  if (!checkoutReleased()) throw new Error(CHECKOUT_CLOSED_MESSAGE);
}
