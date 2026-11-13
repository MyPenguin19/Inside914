import Link from "next/link";
import { Suspense } from "react";
import { TestCheckoutNotice } from "@/components/checkout/test-checkout-notice";
import { submitContact } from "@/app/(public)/actions/checkout";
import { BookingSteps } from "@/components/booking/booking-steps";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { CheckoutBlocked } from "@/components/checkout/checkout-blocked";
import { ContactForm } from "@/components/checkout/contact-form";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatPhone } from "@/lib/checkout/contact";
import { loadCheckoutContext } from "@/lib/checkout/context";

export const metadata = { title: "Your details · Inside914" };

export default function DetailsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="page-width flex-1 py-6 sm:py-8">
        <BookingSteps current={3} />
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Details />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Details() {
  const context = await loadCheckoutContext();
  if (context.kind !== "ok") return <CheckoutBlocked reason={context.reason} editionId={context.editionId} />;
  const { booking, view } = context;
  const c = booking.contact;
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-8">
      <section aria-labelledby="details-title" className="min-w-0">
        <Link href="/book/review" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← Back to review
        </Link>
        <h1 id="details-title" className="mt-3 font-display text-4xl font-medium tracking-tight">
          Your business details
        </h1>
        <p className="mt-2 text-muted">
          So we know who the ad is for and where to send your confirmation. Your position is held for{" "}
          <HoldCountdown expiresAt={booking.holdExpiresAt!} />.
        </p>
        {view.pricingMode === "test" && (
          <div className="mt-5">
            <TestCheckoutNotice />
          </div>
        )}
        <div className="mt-6">
          <ContactForm
            action={submitContact}
            initial={{
              businessName: c?.business_name ?? "",
              contactName: c?.contact_name ?? "",
              email: c?.email ?? "",
              phone: c?.phone ? formatPhone(c.phone) : "",
              website: c?.website ?? "",
              category: c?.category ?? "",
            }}
          />
        </div>
      </section>
      <aside className="order-first lg:order-last lg:sticky lg:top-20 lg:self-start">
        <ReservationSummary view={view} amountLabel="Amount you'll authorize" />
      </aside>
    </div>
  );
}
