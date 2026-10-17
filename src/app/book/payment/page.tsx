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

export const metadata = { title: "Save your card · Inside914" };

export default function PaymentPage({ searchParams }: PageProps<"/book/payment">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <BookingSteps current={5} />
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
    <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <section aria-labelledby="payment-title">
        <h1 id="payment-title" className="text-3xl font-semibold tracking-tight">
          Reserve your space
        </h1>
        <p className="mt-2 text-muted">
          Save a card to hold your space. <strong className="text-foreground">Nothing is charged today.</strong> Your
          position is held for <HoldCountdown expiresAt={booking.holdExpiresAt!} />.
        </p>
        <ol className="mt-5 grid gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          <li><strong className="text-foreground">Today:</strong> your card is saved securely with Stripe. $0 charged.</li>
          <li><strong className="text-foreground">If every space on the postcard is reserved</strong> and we approve the campaign for print, we charge the amount shown and email you.</li>
          <li><strong className="text-foreground">If the campaign doesn&apos;t fill</strong> by its deadline, your reservation is canceled and you&apos;re never charged.</li>
        </ol>
        {typeof outcome === "string" && (
          <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
            {checkoutMessage(outcome)}
          </p>
        )}
        <div className="mt-6">
          <PaymentStep
            publishableKey={testMode ? null : getStripePublishableKey()}
            consentText={consentText(booking.priceCents)}
            termsVersion={TERMS_VERSION}
            testMode={testMode}
            actions={{ beginPayment, giveConsent, confirmReservation, simulateCardSetup }}
          />
        </div>
        <Link href="/book/details" className="mt-6 inline-block text-sm text-muted underline">
          Back to your details
        </Link>
      </section>
      <aside>
        <ReservationSummary view={view} />
      </aside>
    </div>
  );
}
