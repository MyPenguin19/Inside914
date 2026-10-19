
import { bookingSizeLabel } from "@/lib/booking/products";
import Link from "next/link";
import { TestCheckoutNotice } from "@/components/checkout/test-checkout-notice";
import { ButtonLink } from "@/components/ui/button";
import { Suspense } from "react";
import { QualityNote } from "@/components/artwork/artwork-studio";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { PostcardPreview } from "@/components/artwork/postcard-preview";
import { BookingSteps } from "@/components/booking/booking-steps";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { HoldStatePanel, Panel } from "@/components/booking/hold-state-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { adAreas, effectivePpi, resolutionLevel } from "@/lib/artwork/rules";
import { loadHoldContext } from "@/lib/booking/hold-context";
import { formatIssueMonth, formatPrice } from "@/lib/format";

export const metadata = { title: "Review your ad · Inside914" };

export default function ReviewPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-6 sm:py-8">
        <BookingSteps current={4} />
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Review />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Review() {
  const context = await loadHoldContext();
  if (context.kind !== "active") {
    return <HoldStatePanel state={context.kind} editionId={context.kind === "expired" ? context.editionId : undefined} />;
  }
  const { booking, area, otherSlots, artwork } = context;
  if (!artwork?.crop) {
    return (
      <Panel title="Add your artwork first">
        <p className="text-muted">Upload and position your ad, then come back here to review it.</p>
        <Link href="/book/artwork" className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-accent">
          Add your artwork
        </Link>
      </Panel>
    );
  }

  const ppi = effectivePpi(artwork.crop, area);
  const side = booking.size === "both_sides" ? "Front and back (same artwork)" : area.side === "front" ? "Front" : "Back";
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-8">
      <section aria-labelledby="review-title" className="min-w-0">
        <h1 id="review-title" className="font-display text-4xl font-medium tracking-tight">
          Review your ad
        </h1>
        <p className="mt-2 text-muted">
          Check everything looks right. Your position is held for <HoldCountdown expiresAt={booking.expiresAt} />.
        </p>
        {booking.pricingMode === "test" && (
          <div className="mt-5">
            <TestCheckoutNotice />
          </div>
        )}
        <dl className="mt-5 grid gap-4 border-y border-line py-5 text-sm sm:grid-cols-2">
          <Item label="Edition" value={`${booking.zoneName} · ${formatIssueMonth(booking.issueMonth)}`} />
          <Item label="Postcard side" value={side} />
          <Item label="Position" value={booking.positions.map((p) => p.label).join(" + ")} />
          <Item label="Size" value={bookingSizeLabel(booking.size)} />
          <Item label="Price" value={formatPrice(booking.priceCents)} />
          <Item label="Charged today" value="Nothing" />
        </dl>
        <div className="mt-5 flex flex-col gap-3">
          <QualityNote ppi={ppi} level={resolutionLevel(ppi)} />
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-xs text-muted">
            <strong className="font-medium text-foreground">This is a provisional preview, not a print proof.</strong>{" "}
            Final position sizes, margins and print settings will be confirmed with our printer before anything is
            printed. Keep important words and logos inside the dashed line.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/book/details" size="lg">
            Continue
          </ButtonLink>
          <ButtonLink href="/book/artwork" size="lg" variant="secondary">
            Make changes
          </ButtonLink>
        </div>
      </section>
      <aside aria-label="Your ad on the postcard" className="mx-auto w-full max-w-[300px] lg:sticky lg:top-20 lg:max-w-none lg:self-start">
        {adAreas(booking.positions).map(previewArea => <PostcardPreview key={previewArea.side} side={previewArea.side} otherSlots={otherSlots} area={previewArea}>
          <CroppedImage
            src={artwork.viewUrl}
            imageWidth={artwork.width}
            imageHeight={artwork.height}
            crop={artwork.crop!}
            alt="Your ad as it will sit on the postcard"
          />
        </PostcardPreview>)}
      </aside>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
