import { getStagedArtwork } from "@/lib/artwork/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLayoutV2 } from "@/lib/print/layouts";
import { Suspense } from "react";
import {
  extendCurrentHold,
  finalizeArtworkUpload,
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

export default function ArtworkPage({ searchParams }: { searchParams: Promise<{ upload?: string }> }) {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-6 sm:py-8">
        <BookingSteps current={2} />
        <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <Studio searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Studio({ searchParams }: { searchParams: Promise<{ upload?: string }> }) {
  const context = await loadHoldContext();
  if (context.kind !== "active") {
    return <HoldStatePanel state={context.kind} editionId={context.kind === "expired" ? context.editionId : undefined} />;
  }
  const { booking, area, otherSlots } = context;
  const { upload } = await searchParams;
  const artwork = (upload ? await getStagedArtwork(createAdminClient(), booking.id, upload) : null) ?? context.artwork;
  return (
    <div className="mt-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Add your artwork</h1>
        {booking.cartId && <p className="mt-2 font-medium" data-testid="artwork-area">{booking.zoneName}</p>}
        <p className="mt-2 text-muted">
          {isLayoutV2(booking.layoutTemplate) ? "Upload, adjust, and save. Each area keeps its own artwork." : booking.productModel === "square_v1" ? "Upload an ad for this area, then crop, drag and zoom to a square. Other areas keep their own artwork." : "Upload your ad, then drag and zoom until it fits. You’ll see it on the postcard as you go."}
        </p>
      </header>
      {booking.size === "both_sides" && <p className="mb-4 text-sm text-muted">This image and crop will be used on both front and back. You can review both sides on the next step.</p>}
      <ArtworkStudio
        layoutKey={booking.layoutTemplate}
        key={booking.cartId ? `${booking.id}:${artwork?.version ?? "empty"}` : booking.id}
        nextHref={booking.cartId ? "/book/cart" : undefined}
        hold={{ expiresAt: booking.expiresAt, extensionsLeft: booking.cartId ? Math.max(0,1-booking.holdExtensions) : MAX_EXTENSIONS - booking.holdExtensions }}
        ad={{
          side: area.side,
          area,
          labels: booking.positions.map((p) => p.label),
          size: booking.size,
          priceCents: booking.priceCents,
        }}
        dimensions={booking.productModel === "square_v1" ? { width: 9, height: 6 } : undefined}
        otherSlots={otherSlots}
        initialArtwork={artwork}
        actions={{
          requestUpload: requestArtworkUpload,
          finalizeUpload: finalizeArtworkUpload,
          saveLayout: saveArtworkLayout,
          extendHold: extendCurrentHold,
        }}
      />
    </div>
  );
}
