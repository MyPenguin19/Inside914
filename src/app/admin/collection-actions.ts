"use server";
import { z } from "zod";
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectCharge, getCollectionStripe, verifyStripeAccount, verifyLedgerContext } from "@/lib/payments/charge";
import { issueRecovery } from "@/lib/payments/recovery";
import { getCollectionContext } from "@/lib/payments/environment";
import type { ActionResult } from "./admin-actions";

export async function activateZone(_previous:ActionResult,form:FormData):Promise<ActionResult> {
  const {supabase}=await requireAdmin();
  const parsed=z.uuid().safeParse(form.get("id"));
  if(!parsed.success) return {message:"Invalid campaign."};
  try {
    const stripe=getCollectionStripe(); // Disabled/release gate precedes any writes or API calls.
    await verifyStripeAccount(stripe);
    const {error}=await supabase.rpc("admin_prepare_zone_collection",{p_id:parsed.data});
    if(error) return {message:"Activation blocked: "+error.message};
    const admin=createAdminClient();
    const {error:bindingError}=await admin.rpc("bind_zone_collection",{p_id:parsed.data,p_mode:stripe.context.mode,p_account:stripe.context.accountId});
    if(bindingError) throw new Error("Collection account binding failed");
    const {data:charges,error:loadError}=await admin.from("zone_charges").select("id").eq("edition_id",parsed.data);
    if(loadError) throw new Error("Could not load collection ledger");
    let errors=0;
    for(const c of charges ?? []) { try { await collectCharge(admin,stripe,c.id); } catch { errors++; } }
    refresh();
    return {ok:errors===0,message:errors ? `${errors} requests need reconciliation. Retry uses the same payment intents. Check Stripe webhooks before proceeding.` : "Collection requests submitted. Signed webhooks determine payment status; other zones are unchanged."};
  } catch { return {message:"Collection unavailable. Check collection configuration and the ledger before retrying."}; }
}
export async function recoveryLink(_previous:{url?:string;message?:string},form:FormData):Promise<{url?:string;message?:string}> {
  await requireAdmin();
  try {
    const context=getCollectionContext();
    const id=z.uuid().parse(form.get("id"));
    const db=createAdminClient();
    const {data:charge}=await db.from("zone_charges").select("*").eq("id",id).single();
    if(!charge) throw new Error("Missing ledger");
    verifyLedgerContext(charge,context);
    const token=await issueRecovery(db,id);
    return {url:`/pay/${token}`};
  } catch {return {message:"Recovery unavailable or overdue. Review this payment before taking further action."};}
}
