import { CartHoldTimer } from "@/components/booking/cart-hold-timer";
import { cartConsentText } from "@/lib/checkout/terms";
import { BookingSteps } from "@/components/booking/booking-steps";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PaymentStep } from "@/components/checkout/payment-step";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CART_COOKIE,
  CART_TERMS,
  ownedCart,
  cartGate,
} from "@/lib/booking/cart";
import { getReservationView } from "@/lib/checkout/reservation";
import { formatPrice } from "@/lib/format";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
import { getStripePublishableKey } from "@/lib/env/public";
import {
  beginCartPayment,
  giveCartConsent,
  confirmAreas,
  simulateCartSetup,
} from "../actions";
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-8">
        <Suspense fallback={<p>Loading checkout…</p>}>
          <Payment />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
async function Payment() {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  const admin = createAdminClient();
  const cart = await ownedCart(admin, token);
  if (!cart || cartGate(cart.members, true))
    return (
      <p>
        Complete artwork and details for every area before checkout.{" "}
        <Link href="/book/cart" className="underline">
          Return to areas
        </Link>
      </p>
    );
  const views = await Promise.all(
    cart.members.map((b) => getReservationView(admin, b.id)),
  );
  const total = cart.members.reduce((n, b) => n + b.priceCents, 0);
  const testMode = isDevTestModeActive();
  return (
    <div className="space-y-6">
      {cart.members.every(b=>b.status==="pending")&&<CartHoldTimer expiresAt={cart.members.map(b=>b.holdExpiresAt!).sort()[0]}/>}
      <BookingSteps current={4} />
      <Link className="underline" href="/book/cart/details">
        ← Back to business details
      </Link>
      <h1 className="text-3xl font-semibold">Reserve your areas</h1>
      <p>
        Nothing is charged today. Save your card once for these separate
        campaign reservations.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {views.map(
          (v, i) =>
            v && (
              <ReservationSummary
                provisional
                key={cart.members[i].id}
                view={v}
              />
            ),
        )}
      </div>
      <p className="text-xl font-semibold">
        Total authorized: {formatPrice(total)}
      </p>
      <div className="max-w-xl">
        <PaymentStep
          publishableKey={testMode ? null : getStripePublishableKey()}
          testMode={testMode}
          termsVersion={CART_TERMS}
          consentText={cartConsentText(cart.members.map((b,i)=>({name:views[i]?.zoneName??"Selected area",amount:b.priceCents})))}
          successHref="/book/cart"
          returnHref="/book/cart/complete"
          actions={{
            beginPayment: beginCartPayment,
            giveConsent: giveCartConsent,
            confirmReservation: confirmAreas,
            simulateCardSetup: simulateCartSetup,
          }}
        />
      </div>
    </div>
  );
}
