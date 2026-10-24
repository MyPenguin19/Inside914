import { invitationOffer } from "@/lib/invitations/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { connection } from "next/server";
import { categoryCatalog } from "@/lib/booking/category-checkout";
import { CategoryZoneSelector } from "./category-zone-selector";
import { Notice } from "@/components/ui/primitives";
export async function CategoryCheckout({searchParams}:{searchParams?:Promise<{invite?:string}>}) {
  await connection();
  let catalog;
  try { catalog = await categoryCatalog(); }
  catch { return <Notice tone="danger" role="alert">Area availability could not be loaded. Please refresh; nothing was reserved.</Notice>; }
  const invite=(await searchParams)?.invite;
  const offer=invite?await invitationOffer(createAdminClient(),invite).catch(()=>null):null;
  return <CategoryZoneSelector {...catalog} invitation={offer?{editionId:offer.editionId,slotId:offer.slotId}:undefined} invitationUnavailable={!!invite&&!offer}/>;
}
