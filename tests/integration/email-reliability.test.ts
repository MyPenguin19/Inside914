import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only",()=>({}));
const {queueDelivery,processDelivery}=await import("@/lib/email/delivery");
const {EmailProviderError}=await import("@/lib/email/provider");
const db=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const ids:string[]=[];
afterEach(async()=>{if(ids.length)await db.from("email_deliveries").delete().in("id",ids.splice(0));});
async function queued(){const id=await queueDelivery(db,`fixture:${randomUUID()}`,{from:"Inside914 <sender@example.com>",to:"client@example.com",subject:"Fixture",html:"<p>private link</p>",text:"private link"});ids.push(id);return id;}
const due=async(id:string)=>{const r=await db.from("email_deliveries").update({next_attempt_at:new Date(0).toISOString()}).eq("id",id);expect(r.error).toBeNull();};
test("concurrent workers have one fenced lease and immutable payload",async()=>{
 const id=await queued();const send=vi.fn(async()=>{await new Promise(r=>setTimeout(r,80));return {id:randomUUID()};});
 const outcomes=await Promise.all([processDelivery(db,id,send),processDelivery(db,id,send)]);
 expect(outcomes.sort()).toEqual(["sent","skipped"]);expect(send).toHaveBeenCalledTimes(1);
});
test("an ambiguous accepted send is reconciled by signed event metadata without resending",async()=>{
 const id=await queued();const send=vi.fn(async()=>{throw new Error("timeout private-url");});
 expect(await processDelivery(db,id,send)).toBe("failed");
 const event={p_event_id:randomUUID(),p_delivery_id:id,p_provider_id:randomUUID(),p_kind:"email.delivered",p_at:new Date().toISOString()};
 expect((await db.rpc("record_email_event",event)).data).toBe("recorded");
 expect((await db.rpc("record_email_event",event)).data).toBe("duplicate");
 await due(id);expect(await processDelivery(db,id,send)).toBe("skipped");expect(send).toHaveBeenCalledTimes(1);
 const row=(await db.from("email_deliveries").select("*").eq("id",id).single()).data!;expect(row.status).toBe("accepted");expect(row.last_error).toBeNull();
});
test("unknown acceptance outside provider retention requires investigation and preserves envelope",async()=>{
 const id=await queued();await processDelivery(db,id,async()=>{throw new Error("timeout");});
 await db.from("email_deliveries").update({first_attempt_at:new Date(Date.now()-24*3600000).toISOString(),next_attempt_at:new Date(0).toISOString()}).eq("id",id);
 const send=vi.fn();expect(await processDelivery(db,id,send)).toBe("skipped");expect(send).not.toHaveBeenCalled();
 expect((await db.from("email_deliveries").select("status").eq("id",id).single()).data?.status).toBe("investigation");
});
test("definitive failure is safely retryable; late worker cannot overwrite webhook",async()=>{
 const id=await queued();await processDelivery(db,id,async()=>{throw new EmailProviderError("provider_http_429",true);});await due(id);
 const providerId=randomUUID();expect(await processDelivery(db,id,async()=>{
  const r=await db.rpc("record_email_event",{p_event_id:randomUUID(),p_delivery_id:id,p_provider_id:providerId,p_kind:"email.bounced",p_at:new Date().toISOString()});expect(r.error).toBeNull();return {id:providerId};
 })).toBe("failed");
 const row=(await db.from("email_deliveries").select("*").eq("id",id).single()).data!;expect(row.status).toBe("failed");expect(row.provider_outcome).toBe("email.bounced");expect(row.retry_safe).toBe(false);
});
test("anonymous callers cannot read envelopes or claim a message",async()=>{
 const id=await queued();const anon=createClient<Database>(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!);
 expect((await anon.from("email_deliveries").select("payload_ciphertext")).error).not.toBeNull();
 expect((await anon.rpc("claim_email_delivery",{p_id:id})).error).not.toBeNull();
});
