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

test("current documented outbound payload shape supports tags and unknown signed events are ignored",()=>{
 const key=Buffer.alloc(32,7),secret=`whsec_${key.toString("base64")}`,now=Date.now(),timestamp=String(Math.floor(now/1000));
 const verify=(data:unknown)=>{const body=JSON.stringify(data);const signature=createHmac("sha256",key).update(`msg_fixture.${timestamp}.${body}`).digest("base64");return verifyEmailWebhook(body,new Headers({"svix-id":"msg_fixture","svix-timestamp":timestamp,"svix-signature":`v1,${signature}`}),secret,now);};
 const result=verify({type:"email.delivered",created_at:new Date().toISOString(),data:{email_id:"provider-fixture",created_at:new Date().toISOString(),from:"sender@example.com",to:["recipient@example.com"],subject:"Example",tags:{delivery_id:"00000000-0000-4000-8000-000000000001"},headers:[{name:"X-Example",value:"fixture"}]}});
 expect(result.event?.data.tags?.delivery_id).toBe("00000000-0000-4000-8000-000000000001");
 expect(verify({type:"contact.created",data:{id:"ignored"}}).event).toBeNull();
});
test("expired messages are rejected before any provider HTTP call",async()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 await expect(sendWithResend({to:"client@example.com",subject:"Example",html:"private",text:"private",idempotencyKey:"fixed",expiresAt:new Date(Date.now()-1).toISOString()})).rejects.toMatchObject({code:"email_link_expired",definitive:true});
 expect(fetch).not.toHaveBeenCalled();
});

test("contact Reply-To survives encrypted queuing and maps to the Resend HTTP field", async () => {
 vi.stubEnv("EMAIL_PAYLOAD_ENCRYPTION_KEY","a".repeat(64));vi.stubEnv("RESEND_API_KEY","re_fixture");
 const envelope={from:"Inside914 <sender@inside914.com>",to:"info@inside914.com",replyTo:"visitor@example.com",subject:"Contact",html:"<p>Question</p>",text:"Question"};
 const payload=decryptEnvelope(encryptEnvelope(envelope,"contact-fixture"),"contact-fixture");
 expect(payload.replyTo).toBe("visitor@example.com");
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response(JSON.stringify({id:"provider-fixture"}),{status:200}));vi.stubGlobal("fetch",fetch);
 await sendWithResend({...payload,idempotencyKey:"contact-stable"});
 expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({from:envelope.from,to:["info@inside914.com"],reply_to:"visitor@example.com"});
 expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe("contact-stable");
});
