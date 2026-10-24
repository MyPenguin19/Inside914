import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getAppUrl, getEmailEnv } from "@/lib/env/checkout";
import { processDelivery, queueDelivery } from "@/lib/email/delivery";
import { escapeHtml } from "@/lib/email/escape";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
export async function queueOwnerNotifications(db:SupabaseClient<Database>,alertIds?:string[]) {
 const recipient=z.email().safeParse(process.env.ADMIN_NOTIFICATION_EMAIL);
 if(!recipient.success) return 0; // In-app alerts remain available without outbound configuration.
 let query=db.from("operational_alerts").select("id,title,href").is("resolved_at",null).neq("kind","owner_email").is("delivery_id",null).order("created_at").limit(20);
 if(alertIds)query=query.in("id",alertIds);
 const alerts=await query;
 if(alerts.error) throw new Error("owner_alerts_unavailable");
 for(const alert of alerts.data) {
  const url=new URL(alert.href,getAppUrl()).toString();
  const id=await queueDelivery(db,`owner-alert:${alert.id}`,{from:getEmailEnv().from,to:recipient.data,subject:`Inside914: ${alert.title}`,
   text:`${alert.title}\nReview securely in the admin panel: ${url}\nNo automatic payment, approval or cancellation was performed.`,
   html:`<p>${escapeHtml(alert.title)}</p><p><a href="${escapeHtml(url)}">Review in Inside914</a></p><p>No automatic payment, approval or cancellation was performed.</p>`},{isTest:isDevTestModeActive()});
  const saved=await db.from("operational_alerts").update({delivery_id:id}).eq("id",alert.id).is("delivery_id",null);
  if(saved.error) throw new Error("owner_alert_queue_failed");
 }
 return alerts.data.length;
}

export function ownerNotificationsConfigured() {
 return z.email().safeParse(process.env.ADMIN_NOTIFICATION_EMAIL).success;
}
// Alert records are committed by the originating transaction. This is a best-effort
// prompt drain; the authenticated daily worker independently recovers interrupted work.
export async function dispatchOwnerNotifications(db:SupabaseClient<Database>,send?:import("@/lib/email/provider").SendEmail,alertIds?:string[]) {
 const refreshed=await db.rpc("refresh_operational_alerts");
 if(refreshed.error) throw new Error("owner_alert_refresh_failed");
 if(!ownerNotificationsConfigured()) return {configured:false,processed:0};
 await queueOwnerNotifications(db,alertIds);
 let query=db.from("email_deliveries").select("id")
  .like("logical_key","owner-alert:%").or("and(status.eq.pending,attempts.lt.8),and(status.eq.sending,attempts.lte.8),and(status.eq.failed,retry_safe.eq.true,attempts.lt.8)")
  .lte("next_attempt_at",new Date().toISOString()).order("next_attempt_at").limit(6);
 if(alertIds)query=query.in("logical_key",alertIds.map(id=>`owner-alert:${id}`));
 const due=await query;
 if(due.error) throw new Error("owner_deliveries_unavailable");
 for(const row of due.data) {
  try {await processDelivery(db,row.id,send);} catch { /* Durable row remains for retry/investigation. */ }
 }
 // Surface even a first terminal bounce/expired link, without emailing recursive failures.
 const result=await db.rpc("refresh_operational_alerts");
 if(result.error) throw new Error("owner_alert_refresh_failed");
 return {configured:true,processed:due.data.length};
}
