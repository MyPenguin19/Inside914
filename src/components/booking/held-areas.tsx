import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ButtonLink } from "@/components/ui/button";
import { editAreaArtwork, releaseAreas } from "@/app/book/cart/actions";
import { ArtworkActionButton } from "./artwork-action-button";
import { CartHoldTimer } from "./cart-hold-timer";
import { getReservationView } from "@/lib/checkout/reservation";
import { canChangePosition } from "@/lib/booking/change-position";
import { cartGate, type ownedCart } from "@/lib/booking/cart";
import { formatPrice } from "@/lib/format";

export async function HeldAreas({ admin, cart }: { admin: SupabaseClient<Database>; cart: NonNullable<Awaited<ReturnType<typeof ownedCart>>> }) {
  const views = await Promise.all(cart.members.map(b => getReservationView(admin, b.id)));
  const active = cart.members.filter(canChangePosition);
  return <section aria-label="Your held areas" className="space-y-5">
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold">Your selected areas</h2>
      <p>Your spaces are already held. Change an individual ad space below, or continue with your artwork.</p>
    </div>
    {active.length > 0 && <CartHoldTimer expiresAt={active.map(b => b.holdExpiresAt!).sort()[0]} extensionUsed={active.some(b => b.holdExtensions > 0)} />}
    <div className="grid gap-4 sm:grid-cols-2">
      {cart.members.map((b, i) => <section key={b.id} aria-label={views[i]?.zoneName} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold">{views[i]?.zoneName ?? "Selected area"}</h3>
        <p>{views[i]?.positions.map(p => `${p.side === "front" ? "Front" : "Back"} · ${p.label}`).join(", ")} · {formatPrice(b.priceCents)}</p>
        {canChangePosition(b) ? <>
          <p className="text-sm text-muted">{b.artworkReady ? "Artwork saved" : "Ready for your artwork"}</p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href={`/book/cart/position?booking=${b.id}`} variant="secondary">Change ad space</ButtonLink>
            <form action={editAreaArtwork}>
              <input type="hidden" name="bookingId" value={b.id} />
              <ArtworkActionButton secondary>{b.artworkReady ? "Edit artwork" : "Add artwork"}</ArtworkActionButton>
            </form>
          </div>
        </> : <p className="text-sm text-muted">{b.status === "reserved" ? "Reserved" : "This hold is no longer available."}</p>}
      </section>)}
    </div>
    <ButtonLink href={cartGate(cart.members) ? "/book/cart" : "/book/cart/details"}>{cartGate(cart.members) ? "Continue with your areas" : "Continue to business details"}</ButtonLink>
    <details className="text-sm text-muted">
      <summary className="cursor-pointer">Start over with different areas</summary>
      <p className="my-3">This releases all held spaces so you can choose different areas. To change a position, use “Change ad space” above.</p>
      <form action={releaseAreas}><button className="underline">Release all areas and start over</button></form>
    </details>
    <Link href="/book/cart" className="block text-sm underline">View your full reservation</Link>
  </section>;
}
