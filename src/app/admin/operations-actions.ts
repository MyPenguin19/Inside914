"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import type { ActionResult } from "./admin-actions";
export async function resolveCustomerRequest(_previous:ActionResult,form:FormData):Promise<ActionResult> {
 const {supabase}=await requireAdmin();
 const input=z.object({id:z.uuid(),status:z.enum(["resolved","declined"]),response:z.string().trim().min(1).max(1000)}).safeParse({...Object.fromEntries(form),response:form.get("reason")});
 if(!input.success) return {ok:false,message:"Add a response and a valid outcome."};
 const {error}=await supabase.rpc("admin_resolve_customer_request",{p_id:input.data.id,p_status:input.data.status,p_response:input.data.response});
 if(error) return {ok:false,message:error.message.includes("cancellation_not_completed") ? "Cancel the reservation first. A pending payment or printer commitment must be resolved before marking this request complete." : "Could not record the response."};
 revalidatePath("/admin","layout");revalidatePath("/reservation");return {ok:true,message:"Response recorded. Reservation and artwork were not changed by this action."};
}
export async function acknowledgeAlert(form:FormData) {
 const {supabase}=await requireAdmin();const id=z.uuid().safeParse(form.get("id"));if(!id.success)return;
 const {error}=await supabase.rpc("admin_acknowledge_alert",{p_id:id.data});
 if(error)throw new Error("Could not acknowledge this alert. Please try again.");
 revalidatePath("/admin","layout");
}

export async function recordPrinterStage(_previous:ActionResult,form:FormData):Promise<ActionResult> {
 const {supabase}=await requireAdmin();
 const input=z.object({editionId:z.uuid(),stage:z.enum(["submitted","committed","printed","mailing_submitted","mailed"]),evidenceId:z.uuid(),notes:z.string().trim().min(1).max(1000),confirmed:z.literal("on")}).safeParse(Object.fromEntries(form));
 if(!input.success)return {message:"Select evidence, add a note and confirm the milestone."};
 // Require a real stored file, not merely a metadata row or a failed upload.
 const evidence=await supabase.from("mailing_evidence").select("storage_path").eq("id",input.data.evidenceId).eq("edition_id",input.data.editionId).single();
 if(evidence.error || !evidence.data.storage_path)return {message:"Upload the supporting document first."};
 const file=await supabase.storage.from("mailing-evidence").download(evidence.data.storage_path);
 if(file.error || !file.data?.size)return {message:"The supporting document could not be verified. No milestone was recorded."};
 const {error}=await supabase.rpc("admin_record_printer_stage",{p_edition:input.data.editionId,p_stage:input.data.stage,p_evidence:input.data.evidenceId,p_notes:input.data.notes});
 if(error)return {message:"Could not record this milestone. Check the document and record each stage in order."};
 revalidatePath("/admin","layout");return {ok:true,message:"Printer milestone recorded with its evidence and administrator audit trail. No order was sent."};
}
