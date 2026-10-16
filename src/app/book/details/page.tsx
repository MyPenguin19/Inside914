import { Suspense } from "react";
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <BookingSteps current={5} />
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
    <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <section aria-labelledby="details-title">
        <h1 id="details-title" className="text-3xl font-semibold tracking-tight">
          Your business details
        </h1>
        <p className="mt-2 text-muted">
          So we know who the ad is for and where to send your confirmation. Your position is held for{" "}
          <HoldCountdown expiresAt={booking.holdExpiresAt!} />.
        </p>
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
      <aside>
        <ReservationSummary view={view} amountLabel="Amount you'll authorize" />
      </aside>
    </div>
  );
}
