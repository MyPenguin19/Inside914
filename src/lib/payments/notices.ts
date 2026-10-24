import { formatPrice } from "@/lib/format";
import "server-only";
import { getEmailEnv } from "@/lib/env/checkout";
import { mkdir, writeFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { SendEmail } from "@/lib/email/outbox";
import { getCollectionContext, type CollectionContext } from "./environment";
import { verifyLedgerContext } from "./charge";
import { issueRecovery } from "./recovery";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
type Db=SupabaseClient<Database>;
type NoticeRow={id:string;booking_id:string;kind:string;attempts:number};

export async function preparePaymentNotice(db:Db,row:NoticeRow,context:CollectionContext,appUrl:string) {
  if(!["payment_needed","payment_receipt"].includes(row.kind)) throw new Error("invalid_payment_notice");
  const {data:c,error}=await db.from("zone_charges").select("*").eq("booking_id",row.booking_id).single();
  if(error || !c) throw new Error("payment_ledger_missing");
  verifyLedgerContext(c,context);
  if(row.kind==="payment_needed" && c.status==="succeeded") return null;
  if(row.kind==="payment_receipt" && c.status!=="succeeded") throw new Error("payment_not_succeeded");
  // Provider failures can be ambiguous. Never rotate and re-send a link automatically.
  if(row.attempts>0) throw new Error("payment_notice_requires_reconciliation");
  const {data:e}=await db.from("editions").select("name,zones(name)").eq("id",c.edition_id).single();
  const {data:contact}=await db.from("booking_contacts").select("email").eq("booking_id",row.booking_id).single();
  if(!contact?.email) throw new Error("payment_contact_missing");
  const base=new URL(appUrl);
  if(context.mode==="live" && (base.protocol!=="https:" || base.username || base.password || ["localhost","127.0.0.1","[::1]"].includes(base.hostname))) throw new Error("invalid_payment_url");
  const title=(context.mode==="test" ? "Test payment " : "Payment ")+(row.kind==="payment_receipt" ? "received" : "needs attention");
  let link="";
  if(row.kind==="payment_needed") link=new URL(`/pay/${await issueRecovery(db,c.id)}`,base).toString();
  const support = getEmailEnv().supportEmail;
  const text=`${title}\n${e?.zones?.name ?? "Your zone"}\n${formatPrice(c.amount_cents)} for this zone only. Other zones are unchanged.\n${link ? `Complete payment by ${c.recovery_expires_at}: ${link}` : "No further payment is due for this reservation."}\n\nQuestions? Email ${support}. Inside914 is operated by Inside Diagnostics LLC.`;
  return {to:contact.email,subject:title,text,html:`<h1>${escape(title)}</h1><pre>${escape(text)}</pre><p><a href="mailto:${escape(support)}">${escape(support)}</a></p>${link ? `<a href="${escape(link)}">Resolve payment</a>` : ""}`,idempotencyKey:`payment-notice-${row.id}`};
}

// The runtime gate blocks this entire path while collection is disabled.
export async function deliverPaymentNotice(db:Db,row:NoticeRow,send:SendEmail) {
  const context=getCollectionContext();
  const message=await preparePaymentNotice(db,row,context,context.mode==="test" ? "http://localhost:3000" : process.env.APP_URL!);
  if(!message) return "not-delivered:already-resolved";
  if(context.mode==="live") return (await send(message)).id;
  await mkdir(".dev-emails",{recursive:true});
  await writeFile(`.dev-emails/${row.id}.html`,message.html,{mode:0o600});
  return "not-delivered:test-reservation";
}
