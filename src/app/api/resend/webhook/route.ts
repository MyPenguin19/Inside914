import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";
import { z } from "zod";
import { verifyEmailWebhook } from "@/lib/email/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request:Request) {
  const secret=process.env.RESEND_WEBHOOK_SECRET;
  if(!secret) return new Response("Webhook not configured",{status:503});
  // Bound memory while reading, including requests without Content-Length.
  const reader=request.body?.getReader();
  if(!reader) return new Response("Invalid webhook",{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  while(true) {
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>256_000){await reader.cancel();return new Response("Too large",{status:413});}
    chunks.push(value);
  }
  const body=Buffer.concat(chunks).toString("utf8");
  let verified;
  try { verified=verifyEmailWebhook(body,request.headers,secret); }
  catch { return new Response("Invalid webhook",{status:400}); }
  const {event,id}=verified;
  if(!event) return Response.json({received:true,ignored:true});
  const db=createAdminClient();
  const tagged=z.uuid().safeParse(event.data.tags?.delivery_id);
  const existing=tagged.success?null:await db.from("email_deliveries").select("id").eq("provider_message_id",event.data.email_id).maybeSingle();
  if(existing?.error) return new Response("Retry later",{status:503});
  const deliveryId=tagged.success?tagged.data:existing?.data?.id;
  if(!deliveryId) return Response.json({received:true,matched:false});
  const adverse=["email.bounced","email.complained","email.failed","email.suppressed"].includes(event.type);
  const delivery=adverse?await db.from("email_deliveries").select("logical_key").eq("id",deliveryId).maybeSingle():null;
  if(delivery?.error) return new Response("Retry later",{status:503});
  const result=await db.rpc("record_email_event",{p_event_id:id,p_delivery_id:deliveryId,p_provider_id:event.data.email_id,p_kind:event.type,p_at:event.created_at});
  if(result.error) return new Response("Retry later",{status:503});
  // Delivery success/deduplication must not drain unrelated owner notifications.
  // A one-message owner verification must not trigger other sends, even if it fails.
  if(result.data==="recorded" && adverse && !delivery?.data?.logical_key.startsWith("owner-verification:")) notifyOwnerAfterResponse();
  return Response.json({received:true});
}
