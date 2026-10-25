import {createHmac} from "node:crypto";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
vi.mock("server-only",()=>({}));
const notify=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/operations/notify-after",()=>({notifyOwnerAfterResponse:notify}));
const rpc=vi.fn(async()=>({data:"recorded",error:null}));
const lookup=vi.fn(async()=>({data:{id:"00000000-0000-4000-8000-000000000001",logical_key:"reservation:fixture"},error:null}));
const client=vi.fn(()=>({rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:lookup})})})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:client}));
const {POST}=await import("@/app/api/resend/webhook/route");
const key=Buffer.alloc(32,3),secret=`whsec_${key.toString("base64")}`;
const payload={type:"email.delivered",created_at:"2026-10-24T12:00:00Z",data:{email_id:"provider-id",created_at:"2026-10-24T11:59:00Z",from:"sender@example.com",to:["client@example.com"],subject:"Fixture",tags:{delivery_id:"00000000-0000-4000-8000-000000000001"}}};
function request(body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000))) {
 const signature=createHmac("sha256",key).update(`event-fixture.${timestamp}.${body}`).digest("base64");
 return new Request("http://localhost/api/resend/webhook",{method:"POST",body,headers:{"svix-id":"event-fixture","svix-timestamp":timestamp,"svix-signature":`v1,${signature}`}});
}
beforeEach(()=>{vi.stubEnv("RESEND_WEBHOOK_SECRET",secret);rpc.mockResolvedValue({data:"recorded",error:null});});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
test("documented signed outbound payload associates provider identity and tag",async()=>{
 expect((await POST(request())).status).toBe(200);expect(rpc).toHaveBeenCalledWith("record_email_event",{p_event_id:"event-fixture",p_delivery_id:payload.data.tags.delivery_id,p_provider_id:"provider-id",p_kind:"email.delivered",p_at:payload.created_at});
});
test("missing signing configuration fails closed",async()=>{vi.stubEnv("RESEND_WEBHOOK_SECRET","");expect((await POST(request())).status).toBe(503);expect(client).not.toHaveBeenCalled();});
test("tampered raw bytes and old or future signatures never reach the database",async()=>{
 for(const timestamp of [String(Math.floor(Date.now()/1000)-301),String(Math.floor(Date.now()/1000)+301)])expect((await POST(request(undefined,timestamp))).status).toBe(400);
 const original=request();const changed=new Request(original.url,{method:"POST",body:JSON.stringify(payload)+" ",headers:original.headers});expect((await POST(changed)).status).toBe(400);expect(client).not.toHaveBeenCalled();
});
test("oversized streaming bodies are stopped before parsing or database work",async()=>{expect((await POST(request("x".repeat(256001)))).status).toBe(413);expect(client).not.toHaveBeenCalled();});
test("authenticated unsupported events are acknowledged without association",async()=>{expect(await (await POST(request(JSON.stringify({type:"domain.updated",data:{id:"unrelated"}})))).json()).toEqual({received:true,ignored:true});expect(client).not.toHaveBeenCalled();});
test("events without tags use the recorded provider identity",async()=>{
 const data={...payload.data,tags:undefined};expect((await POST(request(JSON.stringify({...payload,data})))).status).toBe(200);expect(lookup).toHaveBeenCalledTimes(1);
});

test("successful and duplicate delivery callbacks do not drain unrelated owner alerts",async()=>{
 await POST(request());expect(notify).not.toHaveBeenCalled();
 rpc.mockResolvedValueOnce({data:"duplicate",error:null});await POST(request(JSON.stringify({...payload,type:"email.failed"})));expect(notify).not.toHaveBeenCalled();
 await POST(request(JSON.stringify({...payload,type:"email.failed"})));expect(notify).toHaveBeenCalledTimes(1);
});
test("a failed owner verification is reconciled without triggering any other email",async()=>{
 lookup.mockResolvedValueOnce({data:{id:payload.data.tags.delivery_id,logical_key:"owner-verification:fixture"},error:null});
 expect((await POST(request(JSON.stringify({...payload,type:"email.failed"})))).status).toBe(200);
 expect(rpc).toHaveBeenCalledTimes(1);expect(notify).not.toHaveBeenCalled();
});
