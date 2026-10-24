"use server";
import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitationOffer,invitationMessage,invitationFingerprint,queueInvitation } from "@/lib/invitations/service";
import { processDelivery } from "@/lib/email/delivery";
export type InvitationState={message?:string;preview?:{id:string;link:string;text:string;subject:string;recipient:string;fingerprint:string};sent?:boolean};
export async function createInvitation(_prev:InvitationState,form:FormData):Promise<InvitationState> {
 const {supabase}=await requireAdmin();
 const parsed=z.object({edition:z.uuid(),slot:z.uuid(),email:z.union([z.email().max(254),z.literal("")]),name:z.string().trim().max(120)}).safeParse({edition:form.get("edition"),slot:form.get("slot"),email:String(form.get("email")??"").trim(),name:form.get("name")??""});
 if(!parsed.success)return {message:"Choose an available position and check the optional email."};
 const p=parsed.data,result=await supabase.rpc("admin_create_invitation",{p_edition:p.edition,p_slot:p.slot,p_email:p.email||undefined,p_name:p.name||undefined});
 if(result.error)return {message:"This position is unavailable or the invitation limit has been reached. Refresh the campaign."};
 const offer=await invitationOffer(createAdminClient(),result.data);
 if(!offer)return {message:"The position is no longer available. Nothing was reserved or emailed."};
 const preview=invitationMessage(offer,p.name);
 return {preview:{id:offer.id,link:preview.link,text:preview.text,subject:preview.subject,recipient:p.email,fingerprint:invitationFingerprint(offer)},message:"Link created. No position was held and no email was sent."};
}
export async function sendInvitation(_prev:InvitationState,form:FormData):Promise<InvitationState> {
 await requireAdmin();
 const parsed=z.object({id:z.uuid(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.literal("yes")}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {message:"Review the invitation and confirm this individual email."};
 try {
  const db=createAdminClient(),id=await queueInvitation(db,parsed.data.id,parsed.data.fingerprint);
  try {after(async()=>{try{await processDelivery(db,id);}catch{/* Durable record is retained; no contact/token logging. */}});}catch{/* The worker recovers this already-queued message. */}
  notifyOwnerAfterResponse();
  return {sent:true,message:"Invitation queued. Repeated clicks use the same delivery record; acceptance is tracked in the action center if it fails."};
 }catch{return {message:"This invitation changed, expired or became unavailable. Create a fresh preview before sending."};}
}
