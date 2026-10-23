import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only",()=>({}));
const state=vi.hoisted(()=>({mode:"live" as "live"|"test",disabled:false}));
vi.mock("@/lib/payments/environment",()=>({getCollectionContext:()=>{if(state.disabled)throw new Error("disabled");return {mode:state.mode,accountId:"acct_fixture"};}}));
vi.mock("@/lib/payments/recovery",()=>({issueRecovery:vi.fn(async()=>"private-fixture-token")}));
import { deliverPaymentNotice,preparePaymentNotice } from "@/lib/payments/notices";
import { issueRecovery } from "@/lib/payments/recovery";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
const context={mode:"live" as const,accountId:"acct_fixture"};
const row={id:"notice1",booking_id:"booking1",kind:"payment_needed",attempts:0};
function db(status="requires_action",mode="live") {
 const data={amount_cents:44900,id:"charge1",edition_id:"zone1",stripe_mode:mode,stripe_account_id:"acct_fixture",status,recovery_expires_at:"2099-01-01"};
 return {from:(table:string)=>{const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:table==="zone_charges"?data:table==="editions"?{zones:{name:"<Zone>"}}:{email:"fixture@example.com"},error:null})};return chain;}} as unknown as SupabaseClient<Database>;
}
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();state.mode="live";state.disabled=false;});
test("live recovery message uses HTTPS, escaped text and stable outbox key",async()=>{
 const message=await preparePaymentNotice(db(),row,context,"https://inside914.example");
 expect(message?.text).toContain("https://inside914.example/pay/private-fixture-token");
 expect(message?.text).toContain("$449 for this zone only");
 expect(message?.html).toContain("&lt;Zone&gt;");expect(message?.subject).toBe("Payment needs attention");
 expect(message?.idempotencyKey).toBe("payment-notice-notice1");
});
test("live receipt requires success and does not issue a payment link",async()=>{
 const receipt={...row,kind:"payment_receipt"};
 await expect(preparePaymentNotice(db(),receipt,context,"https://inside914.example")).rejects.toThrow("not_succeeded");
 expect((await preparePaymentNotice(db("succeeded"),receipt,context,"https://inside914.example"))?.subject).toBe("Payment received");
 expect(issueRecovery).not.toHaveBeenCalled();
});
test("paid reservations suppress stale recovery emails",async()=>{
 expect(await preparePaymentNotice(db("succeeded"),row,context,"https://inside914.example")).toBeNull();
 expect(issueRecovery).not.toHaveBeenCalled();
});
test("mixed test ledger and live sender is refused",async()=>{
 await expect(preparePaymentNotice(db("requires_action","test"),row,context,"https://inside914.example")).rejects.toThrow("mismatch");
});
test("ambiguous retry requires reconciliation without rotating the link or sending",async()=>{
 const send=vi.fn(async()=>({id:"email1"}));vi.stubEnv("APP_URL","https://inside914.example");
 await expect(deliverPaymentNotice(db(),{...row,attempts:1},send)).rejects.toThrow("reconciliation");
 expect(send).not.toHaveBeenCalled();expect(issueRecovery).not.toHaveBeenCalled();
});
test("disabled collection cannot send payment notices",async()=>{
 state.disabled=true;const send=vi.fn(async()=>({id:"email1"}));
 await expect(deliverPaymentNotice(db(),row,send)).rejects.toThrow("disabled");expect(send).not.toHaveBeenCalled();
});
test("live message is passed to the injected sender without test labelling",async()=>{
 vi.stubEnv("APP_URL","https://inside914.example");const send=vi.fn(async()=>({id:"email1"}));
 expect(await deliverPaymentNotice(db(),row,send)).toBe("email1");
 expect(send).toHaveBeenCalledWith(expect.objectContaining({subject:"Payment needs attention",idempotencyKey:"payment-notice-notice1"}));
});
