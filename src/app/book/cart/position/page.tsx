import { Suspense } from "react";
import { cookies } from "next/headers";
import { z } from "zod";
import { BookingLoading } from "@/components/booking/booking-loading";
import { ChangeAdSpace } from "@/components/booking/change-ad-space";
import { ButtonLink } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createAdminClient } from "@/lib/supabase/admin";
import { CART_COOKIE, ownedCart } from "@/lib/booking/cart";
import { canChangePosition } from "@/lib/booking/change-position";
import { getEditionCatalog } from "@/lib/catalog/queries";
import { checkoutReleased } from "@/lib/checkout/release";

export const metadata = { title: "Change ad space · Inside914" };
type Params = { searchParams: Promise<{ booking?: string }> };

export default function Page({ searchParams }: Params) {
  return <><SiteHeader /><main id="main-content" tabIndex={-1} className="page-width flex-1 py-8">
    <Suspense fallback={<BookingLoading step={2} title="Change ad space" message="Loading available spaces…" />}>
      <Position searchParams={searchParams} />
    </Suspense>
  </main><SiteFooter /></>;
}

function Unavailable() {
  return <div className="space-y-4"><h1 className="text-3xl font-semibold">Review your areas</h1>
    <p>This hold can no longer be changed. Return to your areas to check its status.</p>
    <ButtonLink href="/book/cart">Back to your areas</ButtonLink></div>;
}

async function Position({ searchParams }: Params) {
  const id = z.uuid().safeParse((await searchParams).booking);
  if (!id.success) return <Unavailable />;
  const admin = createAdminClient();
  const cart = await ownedCart(admin, (await cookies()).get(CART_COOKIE)?.value);
  const member = cart?.members.find(b => b.id === id.data);
  if (!member || !canChangePosition(member)) return <Unavailable />;
  const [catalog, claim] = await Promise.all([
    getEditionCatalog(member.editionId, { priced: false }),
    admin.from("booking_slots").select("slot_id").eq("booking_id", member.id).is("released_at", null).single(),
  ]);
  if (!catalog || claim.error || !catalog.slots.some(s => s.id === claim.data.slot_id)) return <Unavailable />;
  return <ChangeAdSpace key={`${member.id}:${claim.data.slot_id}`} bookingId={member.id}
    currentSlotId={claim.data.slot_id} slots={catalog.slots} layoutKey={catalog.layoutTemplate}
    zoneName={catalog.zoneName} priceCents={member.priceCents} expiresAt={member.holdExpiresAt!}
    extensionUsed={member.holdExtensions > 0} changesOpen={catalog.bookable && checkoutReleased()} />;
}
