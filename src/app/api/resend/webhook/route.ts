import { z } from "zod";
import { verifyEmailWebhook } from "@/lib/email/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request:Request) {
  const secret=process.env.RESEND_WEBHOOK_SECRET;
  if(!secret) return new Response("Webhook not configured",{status:503});
  const body=await request.text();
  if(Buffer.byteLength(body)>256_000) return new Response("Too large",{status:413});
  let verified;
  try { verified=verifyEmailWebhook(body,request.headers,secret); }
  catch { return new Response("Invalid webhook",{status:400}); }
  const db=createAdminClient();
  const {event,id}=verified;
  const tagged=z.uuid().safeParse(event.data.tags?.delivery_id);
  const existing=tagged.success?null:await db.from("email_deliveries").select("id").eq("provider_message_id",event.data.email_id).maybeSingle();
  if(existing?.error) return new Response("Retry later",{status:503});
  const deliveryId=tagged.success?tagged.data:existing?.data?.id;
  if(!deliveryId) return Response.json({received:true,matched:false});
  const result=await db.rpc("record_email_event",{p_event_id:id,p_delivery_id:deliveryId,p_provider_id:event.data.email_id,p_kind:event.type,p_at:event.created_at});
  if(result.error) return new Response("Retry later",{status:503});
  return Response.json({received:true});
}
