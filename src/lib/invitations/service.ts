import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getEditionCatalog } from "@/lib/catalog/queries";
import { getAppUrl,getEmailEnv } from "@/lib/env/checkout";
import { formatPrice,formatDeadline } from "@/lib/format";
import { escapeHtml } from "@/lib/email/escape";
import { queueDelivery } from "@/lib/email/delivery";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
type Db=SupabaseClient<Database>;
export type InvitationOffer={id:string;editionId:string;slotId:string;zoneName:string;label:string;priceCents:number;deadline:string;expiresAt:string};
export async function invitationOffer(db:Db,id:string):Promise<InvitationOffer|null> {
 if(!z.uuid().safeParse(id).success)return null;
 const result=await db.from("advertiser_invitations").select("id,edition_id,slot_id,expires_at").eq("id",id).maybeSingle();
 if(result.error)throw new Error("invitation_unavailable");
 const row=result.data;if(!row||Date.parse(row.expires_at)<=Date.now())return null;
 const edition=await getEditionCatalog(row.edition_id),slot=edition?.slots.find(s=>s.id===row.slot_id);
 if(!edition?.bookable||!slot?.available)return null;
 return {id,editionId:edition.id,slotId:slot.id,zoneName:edition.zoneName,label:slot.label,priceCents:edition.unitPriceCents,deadline:edition.artworkDeadline,expiresAt:row.expires_at};
}
export function invitationMessage(offer:InvitationOffer,name:string|null) {
 const link=`${getAppUrl()}/book/multi?invite=${offer.id}`;
 const subject=`Inside914 invitation: ${offer.zoneName}`;
 const text=`${name?`Hello ${name},`:"Hello,"}\n\nYou're invited to advertise with Inside914 in ${offer.zoneName}, position ${offer.label}.\nCurrent price: ${formatPrice(offer.priceCents)}. Due when reserving: $0. Save a card; this area is charged only after its campaign fills and is approved.\nReservation deadline: ${formatDeadline(offer.deadline)}.\n\nChoose your area and position, upload artwork, enter your business details and complete card authorization: ${link}\n\nThis invitation does not reserve or guarantee a space. Availability and the current price are checked again at checkout. This link expires ${formatDeadline(offer.expiresAt)}.\n\nInside914`;
 return {link,subject,text,html:`<h1>Inside914</h1>${text.split("\n\n").map(p=>`<p>${escapeHtml(p).replaceAll("\n","<br>")}</p>`).join("")}<p><a href="${escapeHtml(link)}">Choose your advertising position</a></p>`};
}
export function invitationFingerprint(offer:InvitationOffer) {return createHash("sha256").update(JSON.stringify(offer)).digest("hex");}
// Caller has already checked requireAdmin. Never sends without an explicit preview confirmation.
export async function queueInvitation(db:Db,id:string,fingerprint:string) {
 const offer=await invitationOffer(db,id);
 if(!offer||invitationFingerprint(offer)!==fingerprint)throw new Error("Invitation changed or position unavailable. Create a fresh preview.");
 const row=await db.from("advertiser_invitations").select("recipient_email,business_name,delivery_id").eq("id",id).single();
 if(row.error||!row.data.recipient_email)throw new Error("This invitation has no recipient email.");
 const message=invitationMessage(offer,row.data.business_name);
 const delivery=await queueDelivery(db,`invitation:${id}`,{from:getEmailEnv().from,to:row.data.recipient_email,subject:message.subject,text:message.text,html:message.html,expiresAt:new Date(offer.expiresAt).toISOString()},{isTest:isDevTestModeActive()});
 const saved=await db.from("advertiser_invitations").update({delivery_id:delivery}).eq("id",id);
 if(saved.error)throw new Error("Could not record the invitation delivery.");
 return delivery;
}
