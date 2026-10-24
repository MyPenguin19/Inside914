import { CHECKOUT_CLOSED_MESSAGE } from "./messages";
import { devTestMode } from "@/lib/dev/test-mode";

// A reviewed source release is required after final policies and their effective
// version are approved. Environment variables cannot release commercial checkout.
export const PUBLIC_CHECKOUT_RELEASED = false;
export { CHECKOUT_CLOSED_MESSAGE } from "./messages";

export function checkoutReleased(env: Record<string, string | undefined> = process.env) {
  return PUBLIC_CHECKOUT_RELEASED || devTestMode(env).active;
}

export function assertCheckoutReleased() {
  if (!checkoutReleased()) throw new Error(CHECKOUT_CLOSED_MESSAGE);
}
