import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const EMAIL_EVENTS=["email.sent","email.delivered","email.delivery_delayed","email.bounced","email.complained","email.failed","email.suppressed"] as const;
// Svix documented HMAC-SHA256 protocol. Raw body and bounded timestamp are required.
export function verifyEmailWebhook(body:string,headers:Headers,secret:string,now=Date.now()) {
  const id=headers.get("svix-id"), timestamp=headers.get("svix-timestamp"), signatures=headers.get("svix-signature");
  if(!id || id.length>200 || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(now/1000-Number(timestamp))>300 || !signatures || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new Error("invalid_webhook");
  const key=Buffer.from(secret.slice(6),"base64");
  if(key.length<16) throw new Error("invalid_webhook");
  const expected=createHmac("sha256",key).update(`${id}.${timestamp}.${body}`).digest();
  const valid=signatures.split(" ").some(part=>{
    const [version,value]=part.split(",");
    if(version!=="v1" || !value) return false;
    const actual=Buffer.from(value,"base64");
    return actual.length===expected.length && timingSafeEqual(actual,expected);
  });
  if(!valid) throw new Error("invalid_webhook");
  const kind=z.object({type:z.string()}).parse(JSON.parse(body)).type;
  if(!EMAIL_EVENTS.some(event=>event===kind)) return {id,event:null};
  return {id,event:z.object({type:z.string().max(100),created_at:z.iso.datetime({offset:true}),data:z.object({email_id:z.string().min(1).max(200),tags:z.record(z.string(),z.string()).optional()})}).parse(JSON.parse(body))};
}
