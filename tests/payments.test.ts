import { beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { assertCollectionEnvironment } from "@/lib/payments/environment";
import { collectCharge,handlePaymentEvent,verifyIntent, type PaymentStripe } from "@/lib/payments/charge";
import type { Database, ZoneChargeRow } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
const allowed={INSIDE914_COLLECTION_MODE:"test",INSIDE914_TEST_COLLECTION:"true",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321",STRIPE_SECRET_KEY:"sk_test_fixture",NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:"pk_test_fixture"};
test("collection requires explicit local test-only configuration",()=>{
 expect(()=>assertCollectionEnvironment(allowed)).not.toThrow();
 for(const override of [{INSIDE914_TEST_COLLECTION:"false"},{NEXT_PUBLIC_SUPABASE_URL:"https://production.supabase.co"},{STRIPE_SECRET_KEY:"sk_live_fixture"},{NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:"pk_live_fixture"},{VERCEL:"1"}]) expect(()=>assertCollectionEnvironment({...allowed,...override})).toThrow();
});
let row:ZoneChargeRow;let intent:Stripe.PaymentIntent;
let bookingStatus: string; let openCancellation: boolean; let requestError: boolean;
let rpc: ReturnType<typeof vi.fn>;
function db() {
 const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:{...row},error:null}),maybeSingle:async()=>({data:{...row},error:null}),update:(value:Partial<ZoneChargeRow>)=>({eq:()=>({is:async()=>{Object.assign(row,value);return {error:null};}})})};
 const booking={select:()=>booking,eq:()=>booking,maybeSingle:async()=>({data:{status:bookingStatus},error:null})};
 const requests={select:()=>requests,eq:()=>requests,limit:async()=>({data:openCancellation?[{id:"request"}]:[],error:requestError?{message:"unavailable"}:null})};
 return {from:(table:string)=>table==="bookings"?booking:table==="customer_requests"?requests:chain,rpc} as unknown as SupabaseClient<Database>;
}
function stripe(){return {context:{mode:"test" as const,accountId:"acct_fixture"},accounts:{retrieve:vi.fn(async()=>({id:"acct_fixture"}))},customers:{retrieve:vi.fn(async()=>({id:"cus_test",livemode:false}))},paymentMethods:{retrieve:vi.fn(async()=>({id:"pm_test",customer:"cus_test",livemode:false}))},paymentIntents:{create:vi.fn(async()=>intent),retrieve:vi.fn(async()=>intent),confirm:vi.fn(async()=>({...intent,status:"processing"}))}};}
beforeEach(()=>{
 bookingStatus="reserved";openCancellation=false;requestError=false;
 row={stripe_mode:"test",stripe_account_id:"acct_fixture",id:"00000000-0000-4000-8000-000000000001",booking_id:"b",edition_id:"e",consent_id:"c",amount_cents:39900,customer_id:"cus_test",payment_method_id:"pm_test",payment_intent_id:null,status:"pending",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:"admin",recovery_hash:null,recovery_expires_at:null,last_event_at:0,failure_code:null};
 intent={id:"pi_test",livemode:false,amount:39900,currency:"usd",customer:"cus_test",metadata:{zone_charge_id:row.id,booking_id:"b",edition_id:"e"},status:"requires_confirmation"} as unknown as Stripe.PaymentIntent;
 rpc=vi.fn(async(name:string,args?:Record<string,unknown>)=>{
  if(name==="begin_payment_operation")return {data:{decision:"allowed",token:"operation-fixture"},error:null};
  if(name==="finish_payment_operation") {if(args?.p_intent)row.payment_intent_id=String(args.p_intent);return {data:"in_progress",error:null};}
  return {data:"recorded",error:null};
 });
});
test("creates one per-booking intent, persists it, and confirms off-session with stable keys",async()=>{
 const api=stripe();await collectCharge(db(),api as unknown as PaymentStripe,row.id);
 expect(api.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({amount:39900,customer:"cus_test"}),{idempotencyKey:`zone-create-${row.id}`});
 expect(row.payment_intent_id).toBe("pi_test");
 expect(api.paymentIntents.confirm).toHaveBeenCalledWith("pi_test",{off_session:true},{idempotencyKey:`zone-initial-confirm-${row.id}`});
 expect(rpc).toHaveBeenCalledWith("assert_charge_consent",{p_charge:row.id});
 await collectCharge(db(),api as unknown as PaymentStripe,row.id);expect(api.paymentIntents.create).toHaveBeenCalledTimes(1);
});
test("ambiguous creation retry uses the same key and never a new attempt",async()=>{
 const api=stripe();api.paymentIntents.create.mockRejectedValueOnce(new Error("timeout"));
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("timeout");
 await collectCharge(db(),api as unknown as PaymentStripe,row.id);
 expect(api.paymentIntents.create.mock.calls[0]).toEqual(api.paymentIntents.create.mock.calls[1]);
});
test("unknown creation beyond idempotency retention is blocked",async()=>{
 row.created_at=new Date(Date.now()-24*3600_000).toISOString();const api=stripe();
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("reconciliation");expect(api.paymentIntents.create).not.toHaveBeenCalled();
});
test.each(["succeeded","requires_action","requires_payment_method","processing","canceled"] as const)("existing %s intent is never reconfirmed by an admin retry",async status=>{
 row.payment_intent_id=intent.id;intent.status=status;const api=stripe();await collectCharge(db(),api as unknown as PaymentStripe,row.id);
 expect(api.paymentIntents.create).not.toHaveBeenCalled();expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
});
test.each([{livemode:true},{amount:159600},{currency:"eur"},{customer:"cus_other"},{metadata:{zone_charge_id:"wrong"}}])("rejects mismatched intent %j",change=>{
 expect(()=>verifyIntent(row,{...intent,...change} as Stripe.PaymentIntent)).toThrow();
});
test("webhook re-reads Stripe instead of trusting event status",async()=>{
 intent.status="succeeded";const api=stripe();
 const event={id:"evt_success",type:"payment_intent.payment_failed",created:123,livemode:false,data:{object:{...intent,status:"requires_payment_method"}}} as Stripe.Event;
 expect(await handlePaymentEvent(db(),api as unknown as PaymentStripe,event)).toBe("recorded");
 expect(rpc).toHaveBeenCalledWith("record_zone_payment",expect.objectContaining({p_status:"succeeded",p_event:"evt_success",p_intent:"pi_test"}));
});
test("live payment webhooks are ignored",async()=>{
 const api=stripe();expect(await handlePaymentEvent(db(),api as unknown as PaymentStripe,{livemode:true,type:"payment_intent.succeeded"} as Stripe.Event)).toBe("ignored");expect(api.paymentIntents.retrieve).not.toHaveBeenCalled();
});
test("fake saved cards never reach Stripe",async()=>{
 row.customer_id="cus_devtest_abc";const api=stripe();await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("Simulated");expect(api.paymentIntents.create).not.toHaveBeenCalled();
});

test("live collection uses the bound live customer and the same idempotency keys",async()=>{
 row.stripe_mode="live";intent.livemode=true;
 const api=stripe() as unknown as PaymentStripe;
 api.context.mode="live";
 vi.mocked(api.customers.retrieve).mockResolvedValue({id:"cus_test",livemode:true} as never);
 vi.mocked(api.paymentMethods.retrieve).mockResolvedValue({id:"pm_test",customer:"cus_test",livemode:true} as never);
 await collectCharge(db(),api,row.id);
 expect(api.paymentIntents.create).toHaveBeenCalledTimes(1);
 expect(api.paymentIntents.confirm).toHaveBeenCalledWith("pi_test",{off_session:true},{idempotencyKey:`zone-initial-confirm-${row.id}`});
});
test.each(["mode","account","customer","method"])("rejects mismatched %s before creating a payment",async mismatch=>{
 const api=stripe();
 if(mismatch==="mode") row.stripe_mode="live";
 if(mismatch==="account") api.accounts.retrieve.mockResolvedValue({id:"acct_wrong"});
 if(mismatch==="customer") api.customers.retrieve.mockResolvedValue({id:"cus_test",livemode:true});
 if(mismatch==="method") api.paymentMethods.retrieve.mockResolvedValue({id:"pm_test",customer:"cus_other",livemode:false});
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow();
 expect(api.paymentIntents.create).not.toHaveBeenCalled();expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
});
test("live webhook records current state with account and mode",async()=>{
 row.stripe_mode="live";intent.livemode=true;intent.status="succeeded";
 const api=stripe() as unknown as PaymentStripe;api.context.mode="live";
 const event={id:"evt_live",type:"payment_intent.succeeded",created:321,livemode:true,data:{object:intent}} as Stripe.Event;
 expect(await handlePaymentEvent(db(),api,event)).toBe("recorded");
 expect(rpc).toHaveBeenCalledWith("record_zone_payment",expect.objectContaining({p_mode:"live",p_account:"acct_fixture",p_status:"succeeded"}));
});
test("connected-account events cannot update another account's ledger",async()=>{
 const api=stripe();const event={type:"payment_intent.succeeded",livemode:false,account:"acct_other"} as Stripe.Event;
 expect(await handlePaymentEvent(db(),api as unknown as PaymentStripe,event)).toBe("ignored");
 expect(api.paymentIntents.retrieve).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
});

test("collection and webhook matching use the accepted ledger amount, not a global price",async()=>{
 row.amount_cents=44900; intent.amount=44900;
 const api=stripe(); await collectCharge(db(),api as unknown as PaymentStripe,row.id);
 expect(api.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({amount:44900}),expect.anything());
 expect(()=>verifyIntent(row,{...intent,amount:39900})).toThrow();
});

test("unresolved consent blocks every Stripe call",async()=>{
 rpc.mockResolvedValue({data:null,error:{message:"consent_review_required"}});const api=stripe();
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("Consent review required");
 expect(api.accounts.retrieve).not.toHaveBeenCalled();expect(api.paymentIntents.create).not.toHaveBeenCalled();expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
});

test.each(["cancelled", "released", "pending", "charged"])("%s reservation blocks all collection calls", async status => {
 bookingStatus=status;const api=stripe();
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("Reservation");
 expect(api.accounts.retrieve).not.toHaveBeenCalled();expect(api.paymentIntents.create).not.toHaveBeenCalled();expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
});
test("unresolved cancellation and request lookup errors fail closed", async()=>{
 const api=stripe();openCancellation=true;
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("cancellation");
 openCancellation=false;requestError=true;
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("verify cancellation");
 expect(api.accounts.retrieve).not.toHaveBeenCalled();expect(api.paymentIntents.create).not.toHaveBeenCalled();
});
test("a cancellation received during Stripe reads blocks creation",async()=>{
 const api=stripe();api.customers.retrieve.mockImplementation(async()=>{openCancellation=true;return {id:"cus_test",livemode:false};});
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("cancellation");
 expect(api.paymentIntents.create).not.toHaveBeenCalled();expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
});
test("a cancellation received during intent creation blocks confirmation",async()=>{
 const api=stripe();api.paymentIntents.create.mockImplementation(async()=>{openCancellation=true;return intent;});
 await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("cancellation");
 expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
});

test("database operation claim failure prevents provider writes even after successful account reads",async()=>{
 const original=rpc.getMockImplementation() as (name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
 rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>name==="begin_payment_operation" ? {data:null,error:{message:"database unavailable"}} : original(name,args));
 const api=stripe();await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("authorization unavailable");
 expect(api.paymentIntents.create).not.toHaveBeenCalled();expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
});
test("lost outcome persistence cannot advance from creation to confirmation",async()=>{
 const original=rpc.getMockImplementation() as (name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
 rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>name==="finish_payment_operation" ? {data:null,error:{message:"database unavailable"}} : original(name,args));
 const api=stripe();await expect(collectCharge(db(),api as unknown as PaymentStripe,row.id)).rejects.toThrow("requires reconciliation");
 expect(api.paymentIntents.create).toHaveBeenCalledTimes(1);expect(api.paymentIntents.confirm).not.toHaveBeenCalled();
 expect(api.paymentIntents.create).toHaveBeenCalledWith(expect.anything(),{idempotencyKey:`zone-create-${row.id}`});
});
