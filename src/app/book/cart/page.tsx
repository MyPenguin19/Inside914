import { BookingLoading } from "@/components/booking/booking-loading";
import { CartHoldTimer } from "@/components/booking/cart-hold-timer";
import { Notice } from "@/components/ui/primitives";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BookingSteps } from "@/components/booking/booking-steps";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { AreaOrderSummary } from "@/components/checkout/area-order-summary";
import { ArtworkActionButton } from "@/components/booking/artwork-action-button";
import { buttonClass } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CART_COOKIE,
  ownedCart,
  cartGate,
  cartExpired,
} from "@/lib/booking/cart";
import { getReservationView } from "@/lib/checkout/reservation";
import { formatPrice } from "@/lib/format";
import { canChangePosition } from "@/lib/booking/change-position";
import {
  editAreaArtwork,
  reuseArtwork,
  releaseAreas,
} from "./actions";
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-8">
        <Suspense fallback={<BookingLoading step={2} title="Add your artwork" message="Loading your selected areas…" />}>
          <Cart />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
async function Cart() {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  const admin = createAdminClient();
  const cart = await ownedCart(admin, token);
  if (!cart)
    return (
      <p>
        No area reservation found.{" "}
        <Link className="underline" href="/book/multi">
          Choose areas
        </Link>
      </p>
    );
  const views = await Promise.all(
    cart.members.map((b) => getReservationView(admin, b.id)),
  );
  const confirmed = cart.members.every((b) => b.status === "reserved");
  const expired = cartExpired(cart.members);
  const gate = cartGate(cart.members);
  return (
    <div className="space-y-6">
      {cart.members.every(b=>b.status==="pending")&&<CartHoldTimer extensionUsed={cart.members.some(b=>b.holdExtensions>0)} expiresAt={cart.members.map(b=>b.holdExpiresAt!).sort()[0]}/>}
      {!confirmed && <BookingSteps current={2} />}
      <h1 className="text-3xl font-semibold">
        {confirmed ? "Your areas are reserved" : "Add your artwork"}
      </h1>
      {isDevTestModeActive() && (
        <Notice tone="warning">
          TEST reservation: simulated card only. No card is saved and no payment
          is authorized.
        </Notice>
      )}
      <p>
        {confirmed
          ? "Nothing was charged today. Each campaign has its own reservation reference and confirmation."
          : cart.members.length === 1 ? "Add your ad image, check how it looks, then continue." : "Use the same image in every area, or a different one for each."}
      </p>
      {!confirmed && !expired && <p role="status" className="text-sm font-medium text-accent">{cart.members.filter(b => b.artworkReady).length} of {cart.members.length} {cart.members.length === 1 ? "ad" : "ads"} ready</p>}
      {expired && (
        <p role="alert">
          This group is no longer available. Release the holds and choose your
          areas again.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {cart.members.map((b, i) => (
          <section aria-label={views[i]?.zoneName} className="min-w-0 space-y-4 rounded-2xl border border-line bg-surface p-5" key={b.id}>
            {views[i] && (confirmed ? <ReservationSummary provisional view={views[i]!} /> : <AreaOrderSummary view={views[i]!} />)}
            {confirmed && <p>{views[i]?.campaign.taken ?? 0} of {views[i]?.campaign.total ?? 10} advertisers reserved · {formatPrice(b.priceCents)} authorized · Not charged today</p>}
            {b.reference && (
              <p className="font-semibold">Reference: {b.reference}</p>
            )}
            {!confirmed && !expired && (
              <>
                <p>
                  {b.artworkReady ? "✓ Artwork saved" : "Add an image to continue"}
                </p>
                <form action={editAreaArtwork}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <ArtworkActionButton secondary={b.artworkReady} ariaLabel={`${b.artworkReady ? "Edit" : "Add"} artwork for ${views[i]?.zoneName ?? "this area"}`}>
                    {b.artworkReady ? "Edit artwork" : "Add artwork"}
                  </ArtworkActionButton>
                </form>
                {canChangePosition(b) && <Link href={`/book/cart/position?booking=${b.id}`} className={buttonClass("secondary")}>Change ad space</Link>}
                {cart.members.some(
                  (other) => other.id !== b.id && other.artworkReady,
                ) && (
                  <details open={!b.artworkReady}>
                  <summary className="cursor-pointer text-sm text-muted">Use artwork from another area</summary>
                  <form action={reuseArtwork} className="mt-3 space-y-2">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <label className="block">
                      Use artwork from
                      <select
                        name="sourceId"
                        className="mt-1 block w-full rounded-xl border border-line bg-surface p-3"
                      >
                        {cart.members.map((other, j) =>
                          other.id !== b.id && other.artworkReady ? (
                            <option key={other.id} value={other.id}>
                              {views[j]?.zoneName}
                            </option>
                          ) : null,
                        )}
                      </select>
                    </label>
                    <ArtworkActionButton secondary>Use this image</ArtworkActionButton>
                  </form>
                  </details>
                )}
              </>
            )}
          </section>
        ))}
      </div>
      <section aria-label="Artwork and next step" className={confirmed || gate ? "space-y-3" : "sticky bottom-0 z-20 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:bottom-3"}>
      <p className="font-semibold">
        Total if all selected campaigns fill: {formatPrice(cart.members.reduce((n, b) => n + b.priceCents, 0))}
      </p>
      <p>Due today: $0</p>
      {!confirmed && !gate && <Link className={buttonClass("primary")} href="/book/cart/details">Continue to business details</Link>}
      {!confirmed && !expired && gate === "artwork_missing" && <p className="text-sm text-muted">Save artwork for each area to continue to business details.</p>}
      </section>
      {!confirmed && (
        <details>
        <summary className="cursor-pointer text-sm text-muted">Start over with different areas</summary>
        <p className="my-3 text-sm text-muted">This releases every held space. To change just one space and keep your saved artwork, use “Change ad space” above.</p>
        <form action={releaseAreas}>
          <button className="underline">
            Release all areas and change selection
          </button>
        </form>
        </details>
      )}
    </div>
  );
}
