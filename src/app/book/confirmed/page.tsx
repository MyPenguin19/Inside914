import { Suspense } from "react";
import { CheckoutBlocked } from "@/components/checkout/checkout-blocked";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { TestCheckoutNotice } from "@/components/checkout/test-checkout-notice";
import { TestReservationBanner } from "@/components/checkout/test-reservation-banner";
import { Card, Eyebrow } from "@/components/ui/primitives";
import { Timeline } from "@/components/ui/timeline";
import { formatDeadline, formatPrice } from "@/lib/format";
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
      <main id="main-content" tabIndex={-1} className="page-width flex-1 py-6 sm:py-8">
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
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {view.pricingMode === "test" && <TestCheckoutNotice />}
      <Card className="sm:p-8">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-white">
          ✓
        </span>
        <Eyebrow className="mt-6">Reservation {view.reference}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">Your advertising space is reserved.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Thank you, {view.businessName}. <strong className="text-foreground">No payment has been collected.</strong> We&apos;ll
          charge the authorized {formatPrice(view.priceCents)} only if every space on the postcard is reserved and the
          campaign is approved for print. If it doesn&apos;t fill by {formatDeadline(view.artworkDeadline)}, your reservation
          is canceled without charge.
        </p>
        <p className="mt-3 text-muted">
          {view.emailSent ? (
            <>
              We&apos;ve emailed a confirmation to <strong className="text-foreground">{view.email}</strong> with a private
              link to view your reservation any time.
            </>
          ) : (
            <>
              A confirmation with a private link to your reservation will be emailed to{" "}
              <strong className="text-foreground">{view.email}</strong>. Please keep your reference,{" "}
              <strong className="text-foreground">{view.reference}</strong>.
            </>
          )}
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <ReservationSummary view={view} amountLabel="Authorized future charge" />
        <Card as="section">
          <h2 className="text-lg font-semibold">Campaign status</h2>
          <p className="mt-2 text-sm text-muted">
            <strong className="text-foreground">Selling spaces:</strong> {view.campaign.taken} of {view.campaign.total} spaces
            are taken. The postcard is printed and mailed only after it fills and we approve it for print.
          </p>
          <h2 className="mt-6 text-lg font-semibold">What happens next</h2>
          <div className="mt-4">
            <Timeline
              label="What happens next"
              steps={[
                { title: "Artwork review", state: "current", description: "We check your ad with our printer." },
                { title: "Postcard fills", state: "upcoming", description: "We charge your saved card and email you." },
                { title: "Print and mail", state: "upcoming", description: "Your private link shows the campaign's progress." },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
