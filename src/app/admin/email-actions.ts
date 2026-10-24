"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import type { ActionResult } from "./admin-actions";
export async function retryEmail(_previous:ActionResult,form:FormData):Promise<ActionResult> {
  const {supabase}=await requireAdmin();
  const id=z.uuid().safeParse(form.get("id"));
  if(!id.success) return {ok:false,message:"Choose a valid message."};
  const {error}=await supabase.rpc("admin_retry_email_delivery",{p_id:id.data});
  if(error) return {ok:false,message:"This message needs investigation before it can be retried."};
  revalidatePath("/admin");revalidatePath("/admin/advertisers","layout");
  return {ok:true,message:"Retry queued. The delivery worker will use the same message and private link."};
}
