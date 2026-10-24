import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchOwnerNotifications } from "./notifications";
// Runs within Next's managed request lifetime. Durable database alerts, not this callback,
// are the source of truth. A terminated request is recovered by the scheduled worker.
export function notifyOwnerAfterResponse() {
 try {after(async()=>{
  try {await dispatchOwnerNotifications(createAdminClient());}
  catch {console.error("owner_notification_deferred");} // Fixed code only; no contacts or URLs.
 });} catch {console.error("owner_notification_deferred");}
}
