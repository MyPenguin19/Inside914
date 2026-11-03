import { BookingLoading } from "@/components/booking/booking-loading";
import { CartHoldTimer } from "@/components/booking/cart-hold-timer";
import { cartConsentText } from "@/lib/checkout/terms";
import { BookingSteps } from "@/components/booking/booking-steps";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PaymentStep } from "@/components/checkout/payment-step";
import { AreaOrderSummary } from "@/components/checkout/area-order-summary";
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
        <Suspense fallback={<BookingLoading step={4} title="Save your card. Pay $0 today." message="Preparing your reservation summary…" form />}>
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
  if (views.some(view => !view?.campaignName)) return <p>Campaign details are unavailable. Please try again.</p>;
  const total = cart.members.reduce((n, b) => n + b.priceCents, 0);
  const testMode = isDevTestModeActive();
  return (
    <div className="space-y-6">
      {cart.members.every(b=>b.status==="pending")&&<CartHoldTimer extensionUsed={cart.members.some(b=>b.holdExtensions>0)} expiresAt={cart.members.map(b=>b.holdExpiresAt!).sort()[0]}/>}
      <BookingSteps current={4} />
      <Link className="underline" href="/book/cart/details">
        ← Back to business details
      </Link>
      <h1 className="text-3xl font-semibold">Save your card. Pay $0 today.</h1>
      <p>Your card is saved securely with Stripe. Each area is charged only after its campaign fills and is approved.</p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <aside aria-label="Your order" className="space-y-4 rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24 lg:order-2">
        <h2 className="text-lg font-semibold">Your selection</h2>
        <ul className="space-y-3 text-sm">{views.map((v, i) => v && <li key={cart.members[i].id} className="flex justify-between gap-3">
          <span>{v.zoneName}<span className="block text-muted">{v.positions.map(p => p.label).join(" + ")}</span></span>
          <span className="shrink-0 font-medium">{formatPrice(cart.members[i].priceCents)}</span>
        </li>)}</ul>
        <p className="border-t border-line pt-3 font-semibold">Combined authorized maximum: {formatPrice(total)}</p>
        <p className="font-semibold text-accent">Due today: $0</p>
        <details><summary className="cursor-pointer text-sm text-muted">Review artwork and campaign details</summary>
          <div className="mt-4 space-y-5">{views.map((v, i) => v && <AreaOrderSummary key={cart.members[i].id} view={v} />)}</div>
        </details>
      </aside>
      <div className="min-w-0 lg:order-1">
        <PaymentStep
          multiple={cart.members.length > 1}
          publishableKey={testMode ? null : getStripePublishableKey()}
          testMode={testMode}
          termsVersion={CART_TERMS}
          consentText={cartConsentText(cart.members.map((b,i)=>({name:views[i]!.campaignName!,amount:b.priceCents})))}
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
    </div>
  );
}
