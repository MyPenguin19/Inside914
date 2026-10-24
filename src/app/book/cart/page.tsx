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
        <Suspense fallback={<p>Loading your areas…</p>}>
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
      {cart.members.every(b=>b.status==="pending")&&<CartHoldTimer expiresAt={cart.members.map(b=>b.holdExpiresAt!).sort()[0]}/>}
      {!confirmed && <BookingSteps current={2} />}
      <h1 className="text-3xl font-semibold">
        {confirmed ? "Your areas are reserved" : "Your area reservation"}
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
          : "Upload artwork for each area, or reuse an image and position it for that area. All areas must be ready before checkout."}
      </p>
      {expired && (
        <p role="alert">
          This group is no longer available. Release the holds and choose your
          areas again.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {cart.members.map((b, i) => (
          <section className="min-w-0 space-y-3" key={b.id}>
            {views[i] && <ReservationSummary provisional view={views[i]!} />}
            {confirmed && <p>{views[i]?.campaign.taken ?? 0} of {views[i]?.campaign.total ?? 10} advertisers reserved · {formatPrice(b.priceCents)} authorized · Not charged today</p>}
            {b.reference && (
              <p className="font-semibold">Reference: {b.reference}</p>
            )}
            {!confirmed && !expired && (
              <>
                <p>
                  Artwork:{" "}
                  {b.artworkReady ? "Ready" : "Upload or position image"}
                </p>
                <form action={editAreaArtwork}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <button className={buttonClass("secondary")}>
                    Edit artwork for {views[i]?.zoneName ?? "this area"}
                  </button>
                </form>
                {cart.members.some(
                  (other) => other.id !== b.id && other.artworkReady,
                ) && (
                  <form action={reuseArtwork} className="space-y-2">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <label className="block">
                      Reuse artwork from
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
                    <button className={buttonClass("secondary")}>
                      Copy image and position for this area
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        ))}
      </div>
      <p className="text-xl font-semibold">
        Total if all selected campaigns fill: {formatPrice(cart.members.reduce((n, b) => n + b.priceCents, 0))}
      </p>
      <p>Due today: $0</p>
      {!confirmed && !gate && <Link className={buttonClass("primary")} href="/book/cart/details">Continue to business details</Link>}
      {!confirmed && (
        <form action={releaseAreas}>
          <button className="underline">
            Release all areas and change selection
          </button>
        </form>
      )}
    </div>
  );
}
