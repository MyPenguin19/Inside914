"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ACCESS_COOKIE, ACCESS_TOKEN_DAYS, hashAccessToken, resolveAccessToken } from "@/lib/access/tokens";
import { exchangeRecovery, requestReservationRecovery, RECOVERY_RESPONSE } from "@/lib/access/recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientAddress } from "@/lib/booking/hold-rate-limit";
import { deliverRecovery } from "@/lib/access/recovery-delivery";
import { notifyOwnerAfterResponse } from "@/lib/operations/notify-after";
export type CustomerActionState={message?:string;ok?:boolean};
export async function recoverReservation(_previous:CustomerActionState,form:FormData):Promise<CustomerActionState> {
 const input={email:form.get("email"),reference:form.get("reference")};
 const address=clientAddress(await headers());
 after(async()=>{try {
  const db=createAdminClient();const id=await requestReservationRecovery(db,input,address);if(id) await deliverRecovery(db,id);
 } catch { /* Generic response; no tokens or contacts logged. */ }});
 return {ok:true,message:RECOVERY_RESPONSE};
}
export async function openPrivateReservation(token:string,recovery=false):Promise<CustomerActionState> {
 if(!z.string().regex(/^[A-Za-z0-9_-]{43}$/).safeParse(token).success) return {ok:false,message:"This link is invalid."};
 const db=createAdminClient();
 const session=recovery?await exchangeRecovery(db,token):await resolveAccessToken(db,token)?token:null;
 if(!session) return {ok:false,message:"This link has expired or is invalid. Request another link."};
 (await cookies()).set(ACCESS_COOKIE,session,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/reservation",maxAge:ACCESS_TOKEN_DAYS*86400});
 redirect("/reservation");
}
export async function submitReservationRequest(_previous:CustomerActionState,form:FormData):Promise<CustomerActionState> {
 const token=(await cookies()).get(ACCESS_COOKIE)?.value;
 const input=z.object({kind:z.enum(["artwork_change","cancellation"]),message:z.string().trim().min(1).max(1000)}).safeParse({kind:form.get("kind"),message:form.get("message")});
 if(!token || !input.success) return {ok:false,message:"Enter a request using your private reservation link."};
 const result=await createAdminClient().rpc("submit_customer_request",{p_hash:hashAccessToken(token),p_kind:input.data.kind,p_message:input.data.message});
 if(result.error) return {ok:false,message:"This request can't be submitted right now. Artwork may be locked or its deadline passed. Contact support for help."};
 notifyOwnerAfterResponse();
 revalidatePath("/reservation");return {ok:true,message:"Request received. Your reservation and artwork stay unchanged until reviewed. Check this private page for the response; replies are not emailed."};
}
