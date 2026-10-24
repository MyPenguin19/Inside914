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
 if(error) return {ok:false,message:"Could not record the response."};
 revalidatePath("/admin","layout");revalidatePath("/reservation");return {ok:true,message:"Response recorded. Reservation and artwork were not changed by this action."};
}
export async function acknowledgeAlert(form:FormData) {
 const {supabase}=await requireAdmin();const id=z.uuid().safeParse(form.get("id"));if(!id.success)return;
 await supabase.rpc("admin_acknowledge_alert",{p_id:id.data});revalidatePath("/admin","layout");
}
