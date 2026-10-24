import { devTestMode } from "@/lib/dev/test-mode";

// A reviewed source release is required after final policies and their effective
// version are approved. Environment variables cannot release commercial checkout.
export const PUBLIC_CHECKOUT_RELEASED = false;
export const CHECKOUT_CLOSED_MESSAGE = "Reservations are not open yet. You can explore the advertising areas or contact Info@inside914.com.";

export function checkoutReleased(env: Record<string, string | undefined> = process.env) {
  return PUBLIC_CHECKOUT_RELEASED || devTestMode(env).active;
}

export function assertCheckoutReleased() {
  if (!checkoutReleased()) throw new Error(CHECKOUT_CLOSED_MESSAGE);
}
