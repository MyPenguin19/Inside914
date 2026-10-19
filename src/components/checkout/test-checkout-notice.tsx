import { Notice } from "@/components/ui/primitives";
import { getStripeKeyMode } from "@/lib/env/checkout";
import { formatPrice } from "@/lib/format";
import { TEST_PRICES, POSTCARD_PRICES } from "@/lib/pricing";

// Shown wherever the temporary $1 / $2 prices apply. Server component: the wording follows the
// Stripe keys actually configured, so it never claims "test mode" while real cards are being saved.
export function TestCheckoutNotice({ checkout = false }: { checkout?: boolean }) {
  const prices = `${formatPrice(TEST_PRICES.unitPriceCents)} standard, ${formatPrice(TEST_PRICES.doublePriceCents)} double; full-side options retain ${formatPrice(POSTCARD_PRICES.fullSidePriceCents)} / ${formatPrice(POSTCARD_PRICES.bothSidesPriceCents)} per area`;
  let mode: "test" | "live" | null;
  try {
    mode = getStripeKeyMode();
  } catch {
    mode = null; // Stripe not configured (or misconfigured): say nothing about Stripe
  }

  if (mode === "live") {
    return (
      <Notice tone="warning" role="note">
        <strong>Temporary pricing:</strong> {prices}. Your card is saved securely with Stripe and nothing is charged today.
      </Notice>
    );
  }
  if (mode === "test") {
    return (
      <Notice tone="warning" role="note">
        <strong>Test checkout.</strong> Stripe is in test mode and prices are temporary: {prices}.
        {checkout && <> Use a Stripe test card, for example 4242 4242 4242 4242 with any future date and any CVC.</>} No
        real card is charged.
      </Notice>
    );
  }
  return (
    <Notice tone="warning" role="note">
      <strong>Temporary pricing:</strong> {prices}. Nothing is charged today.
    </Notice>
  );
}
