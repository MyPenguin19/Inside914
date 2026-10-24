import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getAppUrl, getEmailEnv } from "@/lib/env/checkout";
import { queueDelivery } from "@/lib/email/delivery";
import { escapeHtml } from "@/lib/email/escape";
import { isDevTestModeActive } from "@/lib/dev/test-mode";
export async function queueOwnerNotifications(db:SupabaseClient<Database>) {
 const recipient=z.email().safeParse(process.env.ADMIN_NOTIFICATION_EMAIL);
 if(!recipient.success) return 0; // In-app alerts remain available without outbound configuration.
 const alerts=await db.from("operational_alerts").select("id,title,href").is("resolved_at",null).is("delivery_id",null).order("created_at").limit(20);
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
