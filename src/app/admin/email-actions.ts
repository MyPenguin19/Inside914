"use server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDelivery } from "@/lib/email/delivery";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import type { ActionResult } from "./admin-actions";
import { getOwnerVerificationConfig, sendOwnerVerification } from "@/lib/email/owner-verification";

export async function verifyOwnerEmail(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  if (form.get("confirmed") !== "send") return { ok: false, message: "Confirm the owner email verification first." };
  try {
    getOwnerVerificationConfig();
    const result = await sendOwnerVerification(createAdminClient());
    revalidatePath("/admin/settings");
    if (result.provider_outcome === "email.delivered") return { ok: true, message: "Resend reports this release's verification email delivered. This release uses one message identity." };
    if (result.status === "accepted") return { ok: true, message: "Verification email accepted by Resend. Delivery is awaiting webhook confirmation. Repeating this action will not send another copy." };
    return { ok: false, message: "Delivery is not confirmed. Review the email delivery record before retrying; this action keeps the same message identity." };
  } catch {
    return { ok: false, message: "Email verification could not be confirmed. Check the email configuration and delivery record before retrying." };
  }
}

export async function retryEmail(_previous:ActionResult,form:FormData):Promise<ActionResult> {
  const {supabase}=await requireAdmin();
  const id=z.uuid().safeParse(form.get("id"));
  if(!id.success) return {ok:false,message:"Choose a valid message."};
  const {error}=await supabase.rpc("admin_retry_email_delivery",{p_id:id.data});
  if(error) return {ok:false,message:"This message needs investigation before it can be retried."};
  after(async()=>{try {await processDelivery(createAdminClient(),id.data);}catch {console.error("email_retry_deferred");}});
  revalidatePath("/admin");revalidatePath("/admin/advertisers","layout");
  return {ok:true,message:"Retry queued. A delivery attempt will use the same message and private link."};
}
