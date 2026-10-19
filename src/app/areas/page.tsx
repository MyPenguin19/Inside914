import { Suspense } from "react";
import { BookingSteps } from "@/components/booking/booking-steps";
import { CategoryCheckout } from "@/components/booking/category-checkout";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Notice } from "@/components/ui/primitives";
import { CAMPAIGN_DETAILS_PROVISIONAL } from "@/lib/catalog/areas";

export const metadata = { title: "Advertising areas · Inside914" };

// LIVE areas: campaigns and open-space counts come from Supabase (anon, RLS: published editions only).
export default function AreasPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-6 sm:py-8">
        <BookingSteps current={1} />
        <div className="mt-6">
          <h1 className="font-display text-4xl font-medium tracking-tight">Choose your category and zones.</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Each area is one postcard mailed to homes in that part of Westchester. We plan the mailing routes for you.
          </p>
        </div>
        {CAMPAIGN_DETAILS_PROVISIONAL && (
          <div className="mt-6">
            <Notice tone="warning" role="note">
              <strong>Provisional campaign details.</strong> Dates, household counts and the postcard layout shown here are
              placeholders and may change before the campaign is confirmed.
            </Notice>
          </div>
        )}

        <Suspense fallback={<AreasSkeleton />}>
          <div className="mt-6"><CategoryCheckout /></div>
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

function AreasSkeleton() {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading advertising areas">
      <div className="h-80 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>
  );
}
