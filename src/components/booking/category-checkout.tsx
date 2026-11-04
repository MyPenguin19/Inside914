import { invitationOffer } from "@/lib/invitations/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { connection } from "next/server";
import { categoryCatalog } from "@/lib/booking/category-checkout";
import { CategoryZoneSelector } from "./category-zone-selector";
import { Notice } from "@/components/ui/primitives";
import { checkoutReleased } from "@/lib/checkout/release";
import { cookies } from "next/headers";
import { CART_COOKIE, ownedCart } from "@/lib/booking/cart";
import { HeldAreas } from "./held-areas";
import { isActiveHold } from "@/lib/booking/change-position";
export async function CategoryCheckout({searchParams}:{searchParams?:Promise<{invite?:string}>}) {
  await connection();
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (token) {
    const admin = createAdminClient();
    const cart = await ownedCart(admin, token);
    if (cart?.members.some(isActiveHold)) {
      return <HeldAreas admin={admin} cart={cart} />;
    }
  }
  let catalog;
  try { catalog = await categoryCatalog(); }
  catch { return <Notice tone="danger" role="alert">Area availability could not be loaded. Please refresh; nothing was reserved.</Notice>; }
  const invite=(await searchParams)?.invite;
  const offer=invite?await invitationOffer(createAdminClient(),invite).catch(()=>null):null;
  return <CategoryZoneSelector {...catalog} checkoutOpen={checkoutReleased()} invitation={offer?{editionId:offer.editionId,slotId:offer.slotId}:undefined} invitationUnavailable={!!invite&&!offer}/>;
}
