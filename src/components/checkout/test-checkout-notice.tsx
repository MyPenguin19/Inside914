import { Notice } from "@/components/ui/primitives";
import { formatPrice } from "@/lib/format";
import { TEST_PRICES } from "@/lib/pricing";

// Shown wherever TEST pricing applies (Stripe test mode, temporary prices). Server component.
export function TestCheckoutNotice({ checkout = false }: { checkout?: boolean }) {
  return (
    <Notice tone="warning" role="note">
      <strong>Test checkout.</strong> Stripe is in test mode and prices are temporary:{" "}
      {formatPrice(TEST_PRICES.unitPriceCents)} standard, {formatPrice(TEST_PRICES.doublePriceCents)} double.
      {checkout && (
        <> Use a Stripe test card, for example 4242 4242 4242 4242 with any future date and any CVC.</>
      )}{" "}
      No real card is charged.
    </Notice>
  );
}
