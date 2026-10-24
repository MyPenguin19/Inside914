import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServerEnv } from "@/lib/env/server";
import { getAppUrl, getEmailEnv } from "@/lib/env/checkout";
import { isTestStripeId } from "@/lib/dev/test-mode";
import { queueDelivery } from "@/lib/email/delivery";
import { escapeHtml } from "@/lib/email/escape";
import { hashAccessToken } from "./tokens";
type Db=SupabaseClient<Database>;
export const RECOVERY_RESPONSE="If those details match a reservation, we'll email a private recovery link. Check your inbox and spam folder. Links expire 15 minutes after the request. If no usable link arrives, request a new one; at most three requests per hour are allowed.";
export async function requestReservationRecovery(db:Db,raw:unknown,address:string) {
 const input=z.object({email:z.email().max(254).transform(s=>s.toLowerCase().trim()),reference:z.string().trim().min(5).max(60).transform(s=>s.toUpperCase())}).safeParse(raw);
 if(!input.success) return null;
 const secret=getServerEnv().SUPABASE_SECRET_KEY;
 const key=(value:string)=>createHmac("sha256",secret).update(`reservation-recovery:${value}`).digest("hex");
 for(const [value,max] of [[`ip:${address}`,10],[`email:${input.data.email}`,3]] as const) {
  const limit=await db.rpc("note_hold_attempt",{p_visitor_hash:key(value),p_max:max,p_window_seconds:3600});
  if(limit.error || !limit.data) return null;
 }
 const booking=await db.from("bookings").select("id,stripe_customer_id,booking_contacts(email)").eq("reference",input.data.reference).not("status","in","(pending,released)").maybeSingle();
 if(booking.error || booking.data?.booking_contacts?.email.toLowerCase()!==input.data.email) return null;
 const token=randomBytes(32).toString("base64url");
 const recovery=await db.rpc("prepare_reservation_recovery",{p_booking:booking.data.id,p_hash:hashAccessToken(token)});
 const prepared=recovery.data?.[0];
 if(recovery.error || !prepared) return null;
 if(!prepared.created) {
  const existing=await db.from("email_deliveries").select("id").eq("logical_key",`recovery:${prepared.recovery_id}`).maybeSingle();
  return existing.data?.id??null; // Concurrent first request may still be preparing its envelope.
 }
 // Fragment is not sent to access logs or HTTP referrers. A deliberate POST exchanges it.
 const link=`${getAppUrl()}/reservation/recover#${token}`;
 const support = getEmailEnv().supportEmail;
 try {return await queueDelivery(db,`recovery:${prepared.recovery_id}`,{from:getEmailEnv().from,to:input.data.email,subject:"Open your Inside914 reservation",
  expiresAt:new Date(prepared.expires_at).toISOString(),
  text:`Use this private link within 15 minutes: ${link}\nYour existing links remain valid. If you didn't request this, ignore it.\nQuestions? Email ${support}. Inside914 is operated by Inside Diagnostics LLC.`,
  html:`<p>Open your reservation within 15 minutes.</p><p><a href="${escapeHtml(link)}">Open reservation</a></p><p>Existing links remain valid. Ignore this email if you did not request it.</p><p>Questions? <a href="mailto:${escapeHtml(support)}">${escapeHtml(support)}</a>. Inside914 is operated by Inside Diagnostics LLC.</p>`},
  {isTest:isTestStripeId(booking.data.stripe_customer_id)});
 } catch {
  await db.from("operational_alerts").upsert({logical_key:`recovery-preparation:${prepared.recovery_id}`,kind:"email",title:"Reservation recovery email could not be prepared",href:`/admin/advertisers/${booking.data.id}`},{onConflict:"logical_key",ignoreDuplicates:true});
  return null;
 }
}
export async function exchangeRecovery(db:Db,token:string) {
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
 const session=randomBytes(32).toString("base64url");
 const r=await db.rpc("consume_reservation_recovery",{p_hash:hashAccessToken(token),p_session_hash:hashAccessToken(session)});
 return !r.error && r.data?session:null;
}
