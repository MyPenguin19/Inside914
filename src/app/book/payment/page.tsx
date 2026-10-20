import Link from "next/link";
import { Suspense } from "react";
import { beginPayment, confirmReservation, giveConsent, simulateCardSetup } from "@/app/(public)/actions/checkout";
import { BookingSteps } from "@/components/booking/booking-steps";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { CheckoutBlocked } from "@/components/checkout/checkout-blocked";
import { PaymentStep } from "@/components/checkout/payment-step";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadCheckoutContext } from "@/lib/checkout/context";
import { checkoutMessage } from "@/lib/checkout/messages";
import { consentText, TERMS_VERSION } from "@/lib/checkout/terms";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
import { getStripePublishableKey } from "@/lib/env/public";
import { TestCheckoutNotice } from "@/components/checkout/test-checkout-notice";
import { Notice } from "@/components/ui/primitives";
import { formatDeadline, formatPrice } from "@/lib/format";

export const metadata = { title: "Save your card · Inside914" };

export default function PaymentPage({ searchParams }: PageProps<"/book/payment">) {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-6 sm:py-8">
        <BookingSteps current={4} />
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Payment searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Payment({ searchParams }: { searchParams: PageProps<"/book/payment">["searchParams"] }) {
  const { outcome } = await searchParams;
  const context = await loadCheckoutContext({ contact: true });
  if (context.kind !== "ok") return <CheckoutBlocked reason={context.reason} editionId={context.editionId} />;
  const { booking, view } = context;
  const testMode = isDevTestModeActive(); // server-side decision; never on Vercel or production builds

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-8">
      <section aria-labelledby="payment-title" className="min-w-0">
        <Link href="/book/details" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← Back to your details
        </Link>
        <h1 id="payment-title" className="mt-3 font-display text-4xl font-medium tracking-tight">
          Reserve your space
        </h1>
        <p className="mt-2 text-muted">
          Save a card to hold your space. <strong className="text-foreground">Nothing is charged today.</strong> Your
          position is held for <HoldCountdown expiresAt={booking.holdExpiresAt!} />.
        </p>
        {booking.pricingMode === "test" && !testMode && (
          <div className="mt-5">
            <TestCheckoutNotice checkout />
          </div>
        )}
        <h2 className="mb-3 mt-7 text-lg font-semibold">How payment works</h2>
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["Today", "You save a card with Stripe. $0 is charged."],
            ["When the postcard fills", `and we approve it for print, we charge ${formatPrice(booking.priceCents)} and email you.`],
            ["If it doesn't fill", `by ${formatDeadline(view.artworkDeadline)}, your reservation is canceled. You're never charged.`],
          ].map(([when, what]) => (
            <li key={when} className="rounded-xl border border-line bg-surface p-3.5">
              <p className="font-medium">{when}</p>
              <p className="mt-1 text-muted">{what}</p>
            </li>
          ))}
        </ol>
        {typeof outcome === "string" && (
          <div className="mt-5">
            <Notice tone="danger" role="alert">
              {checkoutMessage(outcome)}
            </Notice>
          </div>
        )}
        <h2 className="mb-3 mt-7 text-lg font-semibold">Card for the future payment</h2>
        <div>
          <PaymentStep
            publishableKey={testMode ? null : getStripePublishableKey()}
            consentText={consentText(booking.priceCents)}
            termsVersion={TERMS_VERSION}
            testMode={testMode}
            actions={{ beginPayment, giveConsent, confirmReservation, simulateCardSetup }}
          />
        </div>
      </section>
      <aside className="order-first lg:order-last lg:sticky lg:top-20 lg:self-start">
        <ReservationSummary view={view} amountLabel="Amount you'll authorize" />
      </aside>
    </div>
  );
}
