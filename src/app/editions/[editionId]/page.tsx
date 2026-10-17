import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { holdSelection } from "@/app/(public)/actions/booking";
import { BookingSteps } from "@/components/booking/booking-steps";
import { PostcardBooking } from "@/components/booking/postcard-booking";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VerifiedMail } from "@/components/verified-mail";
import { getEditionCatalog } from "@/lib/catalog/queries";
import { TestCheckoutNotice } from "@/components/checkout/test-checkout-notice";
import { Card, Notice } from "@/components/ui/primitives";
import { CAMPAIGN_DETAILS_PROVISIONAL } from "@/lib/catalog/areas";
import { formatDay, formatDeadline, formatHouseholds, formatIssueMonth } from "@/lib/format";

export default function EditionPage({ params }: PageProps<"/editions/[editionId]">) {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-6 sm:py-8">
        <BookingSteps current={2} />
        <Suspense fallback={<BookingSkeleton />}>
          <EditionBooking params={params} />
        </Suspense>
        <div className="mt-14">
          <VerifiedMail compact />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function EditionBooking({ params }: { params: PageProps<"/editions/[editionId]">["params"] }) {
  const { editionId } = await params;
  if (!z.uuid().safeParse(editionId).success) notFound();

  let catalog;
  try {
    catalog = await getEditionCatalog(editionId);
  } catch (error) {
    console.error(error);
    return (
      <div className="mt-6">
        <Notice tone="danger" role="alert">
          We couldn&apos;t load this postcard right now. Nothing was reserved. Please refresh the page in a moment.
        </Notice>
      </div>
    );
  }
  if (!catalog) notFound();

  return (
    <>
      <header className="mt-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">Choose your space</h1>
        <p className="mt-2 text-muted">
          {catalog.zoneName} · {formatIssueMonth(catalog.issueMonth)} · ≈ {formatHouseholds(catalog.households)} homes · Reserve by{" "}
          {formatDeadline(catalog.artworkDeadline)}
          {catalog.mailDate && <> · Planned mail date {formatDay(catalog.mailDate)}</>}
        </p>
      </header>
      {catalog.pricingMode === "test" && (
        <div className="mt-4">
          <TestCheckoutNotice />
        </div>
      )}
      {CAMPAIGN_DETAILS_PROVISIONAL && (
        <div className="mt-4">
          <Notice tone="warning" role="note">
            <strong>Provisional campaign details.</strong> Dates, household counts and the postcard layout are placeholders
            and may change before the campaign is confirmed.
          </Notice>
        </div>
      )}
      <div className="mt-6">
        {catalog.bookable ? (
          <PostcardBooking catalog={catalog} holdSelection={holdSelection} />
        ) : (
          <Card>
            <p className="font-medium">This edition is closed for booking.</p>
            <Link href="/areas" className="mt-2 inline-block text-sm text-accent underline">
              See open advertising areas
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}

function BookingSkeleton() {
  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true" aria-label="Loading postcard">
      <div className="grid grid-cols-2 gap-4 sm:gap-8">
        <div className="aspect-[6.5/12] animate-pulse rounded-lg border border-line bg-surface" />
        <div className="aspect-[6.5/12] animate-pulse rounded-lg border border-line bg-surface" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>
  );
}
