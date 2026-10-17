import { cookies } from "next/headers";
import { Suspense } from "react";
import { Panel } from "@/components/booking/hold-state-panel";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { TestReservationBanner } from "@/components/checkout/test-reservation-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ACCESS_COOKIE, resolveAccessToken } from "@/lib/access/tokens";
import { getReservationView } from "@/lib/checkout/reservation";
import { getEmailEnv } from "@/lib/env/checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Your reservation · Inside914", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

const STATUS_TEXT: Record<string, string> = {
  reserved: "Reserved: waiting for the campaign to fill. No payment collected yet.",
  cancelled: "Canceled. You were not charged.",
};

export default function ReservationPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Reservation />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Reservation() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value; // first: marks the page dynamic before any env access
  const admin = createAdminClient();
  const bookingId = await resolveAccessToken(admin, token).catch(() => null);
  const view = bookingId ? await getReservationView(admin, bookingId).catch(() => null) : null;
  if (!view || !view.reference) {
    return (
      <Panel title="This link isn't valid">
        <p className="text-muted">
          Reservation links are private and can expire or be replaced. Please use the newest link from your confirmation
          email, or contact us at {getEmailEnv().supportEmail}.
        </p>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {view.isTest && <TestReservationBanner />}
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Reservation {view.reference}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{view.businessName}</h1>
        <p className="mt-3 font-medium">{view.isTest ? "TEST reservation: nothing saved or authorized." : (STATUS_TEXT[view.status] ?? "In progress.")}</p>
      </section>
      <ReservationSummary view={view} amountLabel="Authorized future charge" />
      <section className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
        <h2 className="text-base font-semibold text-foreground">Inside914 Verified Mail</h2>
        <p className="mt-2">
          Campaign progress and documented mailing evidence will appear here once your edition moves into production.
          Nothing to show yet. Changing your artwork after confirming isn&apos;t available online yet; contact us if you
          need a change.
        </p>
      </section>
    </div>
  );
}
