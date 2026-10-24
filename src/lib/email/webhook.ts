import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
// Svix documented HMAC-SHA256 protocol. Raw body and bounded timestamp are required.
export function verifyEmailWebhook(body:string,headers:Headers,secret:string,now=Date.now()) {
  const id=headers.get("svix-id"), timestamp=headers.get("svix-timestamp"), signatures=headers.get("svix-signature");
  if(!id || id.length>200 || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(now/1000-Number(timestamp))>300 || !signatures || !secret.startsWith("whsec_")) throw new Error("invalid_webhook");
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
  return {id,event:z.object({type:z.string(),created_at:z.iso.datetime({offset:true}),data:z.object({email_id:z.string().min(1).max(200),tags:z.record(z.string(),z.string()).optional()})}).parse(JSON.parse(body))};
}
