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
import { formatDeadline, formatHouseholds, formatIssueMonth } from "@/lib/format";

export default function EditionPage({ params }: PageProps<"/editions/[editionId]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
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
      <p role="alert" className="mt-8 rounded-xl border border-line bg-surface p-5 text-muted">
        We couldn&apos;t load this postcard right now. Please refresh the page in a moment.
      </p>
    );
  }
  if (!catalog) notFound();

  return (
    <>
      <header className="mt-8 border-b border-line pb-6">
        <p className="text-sm text-muted">{formatIssueMonth(catalog.issueMonth)} edition</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{catalog.zoneName}</h1>
        <p className="mt-3 text-muted">
          Planned mailing quantity: <strong className="text-foreground">≈ {formatHouseholds(catalog.households)} homes</strong>
          {" · "}Artwork due {formatDeadline(catalog.artworkDeadline)}
        </p>
      </header>
      <div className="mt-8">
        {catalog.bookable ? (
          <PostcardBooking catalog={catalog} holdSelection={holdSelection} />
        ) : (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="font-medium">This edition is closed for booking.</p>
            <Link href="/#editions" className="mt-2 inline-block text-sm text-accent underline">
              See open editions
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function BookingSkeleton() {
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true" aria-label="Loading postcard">
      <div className="grid grid-cols-2 gap-4 sm:gap-8">
        <div className="aspect-[6.5/12] animate-pulse rounded-lg border border-line bg-surface" />
        <div className="aspect-[6.5/12] animate-pulse rounded-lg border border-line bg-surface" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>
  );
}
