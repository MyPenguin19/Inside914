import "server-only";
import { INVITATION_EMAIL_RELEASED } from "@/lib/invitations/release";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { decryptEnvelope, encryptEnvelope, type EmailEnvelope } from "./envelope";
import { EmailProviderError, sendWithResend, type SendEmail } from "./provider";

type Db=SupabaseClient<Database>;
export const TEST_NOT_DELIVERED="not-delivered:test-reservation";
export async function queueDelivery(db:Db, logicalKey:string, envelope:EmailEnvelope, options:{outboxId?:string;isTest?:boolean}={}) {
  const {error}=await db.from("email_deliveries").upsert({logical_key:logicalKey,payload_ciphertext:encryptEnvelope(envelope,logicalKey),
    outbox_id:options.outboxId??null,is_test:options.isTest??false},{onConflict:"logical_key",ignoreDuplicates:true});
  if(error) throw new Error("email_queue_failed");
  const result=await db.from("email_deliveries").select("id").eq("logical_key",logicalKey).single();
  if(result.error) throw new Error("email_queue_failed");
  return result.data.id;
}

export async function processDelivery(db:Db,id:string,send:SendEmail=sendWithResend) {
  const claimed=await db.rpc("claim_email_delivery",{p_id:id});
  if(claimed.error) throw new Error("email_claim_failed");
  const row=claimed.data?.[0];
  if(!row) {
    const synced=await db.rpc("sync_email_delivery",{p_id:id});
    if(synced.error) throw new Error("email_outbox_sync_failed");
    return "skipped" as const;
  }
  let state:"accepted"|"failed"|"investigation"|"sending"="accepted";
  let providerId:string|null=null, code:string|null=null, retrySafe=false;
  try {
    if (!INVITATION_EMAIL_RELEASED && row.logical_key.startsWith("invitation:")) throw new Error("promotional_email_on_hold");
    const payload=decryptEnvelope(row.payload_ciphertext,row.logical_key);
    if(payload.expiresAt && Date.parse(payload.expiresAt)<=Date.now()+60_000) throw new Error("email_link_expired");
    const message={...payload,idempotencyKey:`inside914-delivery-${row.id}`,deliveryId:row.id};
    providerId=row.is_test?TEST_NOT_DELIVERED:(await send(message)).id;
  } catch(error) {
    retrySafe=error instanceof EmailProviderError && error.definitive && !row.ambiguous;
    code=error instanceof EmailProviderError?error.code:"provider_outcome_unknown";
    if(error instanceof Error && error.message==="promotional_email_on_hold") {code=error.message;state="failed";retrySafe=false;}
    else if(error instanceof Error && error.message==="email_envelope_unavailable") {code=error.message;state="investigation";}
    else if(error instanceof Error && error.message==="email_link_expired") {code=error.message;state=row.ambiguous?"investigation":"failed";retrySafe=false;}
    else state=retrySafe?"failed":row.attempts>=8?"investigation":"sending";
  }
  // Lease fencing: late workers cannot overwrite a newer worker or a signed webhook outcome.
  const updated=await db.from("email_deliveries").update({status:state,provider_message_id:providerId,
    ambiguous:row.ambiguous || state==="sending" || state==="investigation",
    accepted_at:state==="accepted"?new Date().toISOString():null,last_error:code,retry_safe:retrySafe,
    next_attempt_at:new Date(Date.now()+Math.min(2**row.attempts,360)*60_000).toISOString(),lease_id:null,lease_until:null})
    .eq("id",id).eq("lease_id",row.lease_id!).select("id").maybeSingle();
  if(updated.error) throw new Error("email_result_not_recorded"); // durable 'sending' row remains ambiguous
  const synced=await db.rpc("sync_email_delivery",{p_id:id});
  if(synced.error) throw new Error("email_outbox_sync_failed");
  const current=await db.from("email_deliveries").select("status").eq("id",id).single();
  if(current.error) throw new Error("email_result_unavailable");
  state=current.data.status as typeof state;
  return state==="accepted"?"sent" as const:state==="investigation"?"investigation" as const:"failed" as const;
}
export async function processDueDeliveries(db:Db,limit=20,send?:SendEmail) {
  const {data,error}=await db.from("email_deliveries").select("id").or("and(status.eq.sending,attempts.lte.8),and(status.eq.pending,attempts.lt.8),and(status.eq.failed,retry_safe.eq.true,attempts.lt.8)")
    .lte("next_attempt_at",new Date().toISOString()).order("next_attempt_at").limit(limit);
  if(error) throw new Error("email_due_query_failed");
  const results=[];
  for(const row of data??[]) {
    try { results.push(await processDelivery(db,row.id,send)); }
    catch { results.push("failed" as const); } // One broken row must not starve the queue.
  }
  return results;
}
