import "server-only";
import { z } from "zod";
import { getEmailEnv } from "@/lib/env/checkout";
export type EmailMessage = { from?: string; to: string; subject: string; html: string; text: string; idempotencyKey: string; deliveryId?: string };
export type SendEmail = (message: EmailMessage) => Promise<{id:string}>;
export class EmailProviderError extends Error {
  constructor(readonly code:string, readonly definitive:boolean) { super(code); }
}
export const sendWithResend:SendEmail = async message => {
  const {resendApiKey,from}=getEmailEnv();
  if (!resendApiKey) throw new EmailProviderError("email_not_configured",true);
  let response:Response;
  try {
    response=await fetch("https://api.resend.com/emails",{
      method:"POST",signal:AbortSignal.timeout(30_000),
      headers:{Authorization:`Bearer ${resendApiKey}`,"Content-Type":"application/json","Idempotency-Key":message.idempotencyKey},
      body:JSON.stringify({from:message.from??from,to:[message.to],subject:message.subject,html:message.html,text:message.text,
        ...(message.deliveryId?{tags:[{name:"delivery_id",value:message.deliveryId}]}:{})}),
    });
  } catch { throw new EmailProviderError("provider_outcome_unknown",false); }
  // 409 can mean another send is in flight / a payload mismatch; 5xx can follow acceptance.
  if(!response.ok) throw new EmailProviderError(`provider_http_${response.status}`,[400,401,403,404,422,429].includes(response.status));
  const result=z.object({id:z.string().min(1)}).safeParse(await response.json().catch(()=>null));
  if(!result.success) throw new EmailProviderError("provider_outcome_unknown",false);
  return result.data;
};
