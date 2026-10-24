import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { processDelivery } from "@/lib/email/delivery";
import { EmailProviderError, sendWithResend, type SendEmail } from "@/lib/email/provider";

// Two bounded attempts, identical immutable payload/key. Never regenerate a token on retry.
// A 10-second HTTP timeout per attempt fits the request's 60-second runtime budget.
export function boundedRecoverySender(send:SendEmail=sendWithResend, pause:()=>Promise<void>=()=>new Promise(r=>setTimeout(r,1000))):SendEmail {
 return async message=>{
  let ambiguous=false;
  for(let attempt=0;attempt<2;attempt++) {
   if(message.expiresAt&&Date.parse(message.expiresAt)<=Date.now()+60_000) {
    throw new EmailProviderError(ambiguous?"provider_outcome_unknown":"email_link_expired",!ambiguous);
   }
   try {return await send(message);} catch(error) {
    const failure=error instanceof EmailProviderError?error:new EmailProviderError("provider_outcome_unknown",false);
    ambiguous ||= !failure.definitive;
    const transient=!failure.definitive||failure.code==="provider_http_429";
    if(attempt===1||!transient) throw ambiguous?new EmailProviderError("provider_outcome_unknown",false):failure;
    await pause();
   }
  }
  throw new EmailProviderError("provider_outcome_unknown",false);
 };
}
export function deliverRecovery(db:SupabaseClient<Database>,id:string,send?:SendEmail) {
 return processDelivery(db,id,boundedRecoverySender(send));
}
