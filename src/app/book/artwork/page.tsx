import { Suspense } from "react";
import {
  extendCurrentHold,
  finalizeArtworkUpload,
  removeArtwork,
  requestArtworkUpload,
  saveArtworkLayout,
} from "@/app/(public)/actions/artwork";
import { ArtworkStudio } from "@/components/artwork/artwork-studio";
import { BookingSteps } from "@/components/booking/booking-steps";
import { HoldStatePanel } from "@/components/booking/hold-state-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadHoldContext } from "@/lib/booking/hold-context";

export const metadata = { title: "Add your artwork · Inside914" };

const MAX_EXTENSIONS = 2; // matches the check in public.extend_hold()

export default function ArtworkPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-6 sm:py-8">
        <BookingSteps current={3} />
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Studio />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Studio() {
  const context = await loadHoldContext();
  if (context.kind !== "active") {
    return <HoldStatePanel state={context.kind} editionId={context.kind === "expired" ? context.editionId : undefined} />;
  }
  const { booking, area, otherSlots, artwork } = context;
  return (
    <div className="mt-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Add your artwork</h1>
        {booking.cartId && <p className="mt-2 font-medium" data-testid="artwork-area">{booking.zoneName}</p>}
        <p className="mt-2 text-muted">
          Upload your ad, then drag and zoom until it fits. You&apos;ll see it on the postcard as you go.
        </p>
      </header>
      {booking.size === "both_sides" && <p className="mb-4 text-sm text-muted">This image and crop will be used on both front and back. You can review both sides on the next step.</p>}
      <ArtworkStudio
        key={booking.cartId ? `${booking.id}:${artwork?.version ?? "empty"}` : booking.id}
        nextHref={booking.cartId ? "/book/cart" : undefined}
        continueLabel={booking.cartId ? "Save artwork and return to areas" : undefined}
        hold={{ expiresAt: booking.expiresAt, extensionsLeft: booking.cartId ? 0 : MAX_EXTENSIONS - booking.holdExtensions }}
        ad={{
          side: area.side,
          area,
          labels: booking.positions.map((p) => p.label),
          size: booking.size,
          priceCents: booking.priceCents,
        }}
        otherSlots={otherSlots}
        initialArtwork={artwork}
        actions={{
          requestUpload: requestArtworkUpload,
          finalizeUpload: finalizeArtworkUpload,
          saveLayout: saveArtworkLayout,
          removeArtwork,
          extendHold: extendCurrentHold,
        }}
      />
    </div>
  );
}
