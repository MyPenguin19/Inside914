import { createHmac } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only",()=>({}));
const {encryptEnvelope,decryptEnvelope}=await import("@/lib/email/envelope");
const {verifyEmailWebhook}=await import("@/lib/email/webhook");
const {sendWithResend}=await import("@/lib/email/provider");
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
test("durable email encryption binds payload to logical identity and hides the token",()=>{
 vi.stubEnv("EMAIL_PAYLOAD_ENCRYPTION_KEY","a".repeat(64));
 const value={from:"Inside914 <sender@example.com>",to:"client@example.com",subject:"Reserved",html:"<p>private-token</p>",text:"private-token"};
 const encrypted=encryptEnvelope(value,"one");expect(encrypted).not.toContain("private-token");
 expect(decryptEnvelope(encrypted,"one")).toEqual(value);expect(()=>decryptEnvelope(encrypted,"two")).toThrow("email_envelope_unavailable");
 vi.stubEnv("EMAIL_PAYLOAD_ENCRYPTION_KEY","b".repeat(64));expect(()=>decryptEnvelope(encrypted,"one")).toThrow();
});
test("signed events require authentic unmodified bytes and a fresh timestamp",()=>{
 const secret=Buffer.alloc(32,7),now=Date.now(),timestamp=String(Math.floor(now/1000));
 const body=JSON.stringify({type:"email.sent",created_at:new Date(now).toISOString(),data:{email_id:"provider-1",tags:{delivery_id:"one"}}});
 const signature=createHmac("sha256",secret).update(`event-1.${timestamp}.${body}`).digest("base64");
 const headers=new Headers({"svix-id":"event-1","svix-timestamp":timestamp,"svix-signature":`v1,invalid v1,${signature}`});
 expect(verifyEmailWebhook(body,headers,`whsec_${secret.toString("base64")}`,now).id).toBe("event-1");
 expect(()=>verifyEmailWebhook(body+" ",headers,`whsec_${secret.toString("base64")}`,now)).toThrow();
 expect(()=>verifyEmailWebhook(body,headers,`whsec_${secret.toString("base64")}`,now+301000)).toThrow();
});
test("provider errors classify definitive rejection separately from unknown acceptance",async()=>{
 vi.stubEnv("RESEND_API_KEY","fixture");const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 const message={to:"client@example.com",subject:"Subject",text:"text",html:"text",idempotencyKey:"stable"};
 fetch.mockResolvedValue(new Response("",{status:429}));await expect(sendWithResend(message)).rejects.toMatchObject({definitive:true});
 fetch.mockResolvedValue(new Response("",{status:503}));await expect(sendWithResend(message)).rejects.toMatchObject({definitive:false});
 fetch.mockRejectedValue(new Error("private-token"));await expect(sendWithResend(message)).rejects.toMatchObject({message:"provider_outcome_unknown",definitive:false});
});
