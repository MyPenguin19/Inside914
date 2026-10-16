import { Suspense } from "react";
import { CheckoutBlocked } from "@/components/checkout/checkout-blocked";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { TestReservationBanner } from "@/components/checkout/test-reservation-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadCheckoutContext } from "@/lib/checkout/context";
import { processOutboxForBooking } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "You're reserved · Inside914" };

export default function ConfirmedPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Confirmed />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Confirmed() {
  const context = await loadCheckoutContext({ contact: true, allowConfirmed: true });
  if (context.kind !== "ok") return <CheckoutBlocked reason={context.reason} editionId={context.editionId} />;
  const { booking, view } = context;
  if (booking.status !== "reserved") return <CheckoutBlocked reason="contact_missing" />; // not confirmed yet: back to checkout

  // Retry the confirmation email if an earlier attempt failed (no-op once sent).
  await processOutboxForBooking(createAdminClient(), booking.id).catch(() => {});

  if (view.isTest) {
    return (
      <div className="flex flex-col gap-6">
        <TestReservationBanner />
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Test reference {view.reference}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Test reservation complete</h1>
          <p className="mt-3 text-muted">
            The full booking flow ran end to end for {view.businessName}. The position is held in the development
            database only. Clear test reservations with <code>npm run dev:clear-test-reservations</code>.
          </p>
        </section>
        <ReservationSummary view={view} amountLabel="Amount (TEST, not authorized)" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Reservation {view.reference}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your advertising space is reserved!</h1>
        <p className="mt-3 text-muted">
          Thank you, {view.businessName}. <strong className="text-foreground">No payment has been collected.</strong> Once all
          postcard spaces are reserved and the campaign is approved, we&apos;ll attempt the authorized charge and notify you.
          If the campaign doesn&apos;t fill by its deadline, your reservation is canceled without charge.
        </p>
        <p className="mt-3 text-muted">
          We&apos;ve emailed a confirmation to <strong className="text-foreground">{view.email}</strong> with a private link
          to view your reservation any time.
        </p>
      </section>
      <ReservationSummary view={view} amountLabel="Authorized future charge" />
      <section className="rounded-2xl border border-line p-6 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">What happens next</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>We review your artwork with our printer.</li>
          <li>When every space is reserved and the campaign is approved, we charge your saved card and email you.</li>
          <li>Your private link will show your campaign&apos;s progress, including Inside914 Verified Mail details once available.</li>
        </ol>
      </section>
    </div>
  );
}
