import { afterAll, beforeAll, expect, test, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { processOutboxRow } from "@/lib/email/outbox";
import { TERMS_VERSION, CART_TERMS_VERSION } from "@/lib/checkout/terms";
import { issueRecovery,resolveRecovery } from "@/lib/payments/recovery";
const run=promisify(execFile);
const command=(sql:string)=>execFileSync("python3",["scripts/local-test-db.py","-At","-c",sql],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
let fixture:Record<string,string>={};
const db=createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
beforeAll(()=>{
 const source=readFileSync("tests/database/zone-payments.sql","utf8");
 const cutoff=source.indexOf("select pg_temp.assert(not (public.admin_collection_preview((select id from fixture where k='campaign2'))");
 const sql=source.slice(0,cutoff)+"\nselect 'FIXTURE:'||json_object_agg(k,id)::text from fixture;\ncommit;";
 const dir=mkdtempSync(join(tmpdir(),"inside914-payment-test-")),path=join(dir,"fixtures.sql");
 try{writeFileSync(path,sql);const out=execFileSync("python3",["scripts/local-test-db.py","-At","-f",path],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});fixture=JSON.parse(out.split("\n").find(l=>l.startsWith('FIXTURE:'))!.slice(8));}finally{unlinkSync(path);rmdirSync(dir);}
});
afterAll(async()=>{
 if(!fixture.campaign1)return;
 const removed=await db.storage.from("house-artwork").remove([`house/${fixture.admin}.png`]);
 expect(removed.error).toBeNull();
 const ids=[1,2,3,4].map(n=>`'${fixture['campaign'+n]}'`).join(",");
 command(`begin;
 create temporary table clean_carts as select distinct cart_id id from bookings where edition_id in(${ids});
 create temporary table clean_bookings as select id from bookings where edition_id in(${ids});
 delete from zone_payment_events where charge_id in(select id from zone_charges where edition_id in(${ids}));
 delete from zone_charges where edition_id in(${ids});
 delete from mailing_evidence where edition_id in(${ids});
 delete from bookings where edition_id in(${ids});
 alter table editions disable trigger campaign_delete_guard;
 delete from editions where id in(${ids});
 alter table editions enable trigger campaign_delete_guard;
 delete from reservation_carts where id in(select id from clean_carts);
 delete from zones where id in(${[1,2,3,4].map(n=>`'${fixture['zone'+n]}'`).join(',')});
 delete from admin_events where admin_user_id='${fixture.admin}' or target_id in(${ids}) or target_id in(select id::text from clean_bookings);
 delete from house_artwork where updated_by='${fixture.admin}';
 delete from auth.users where id='${fixture.admin}';
 delete from private.approved_layout_templates where template_key='amazingmail-9x6-ten-square-draft' and approval_reference='TRANSACTION-ONLY TEST; rolled back; NOT printer approval';commit;`);
});
test("old draft and new reservation-only policy versions cannot authorize collection", () => {
 for (const version of ["2026-10-24-review-4", "square-zones-2026-10-24-review-4", TERMS_VERSION, CART_TERMS_VERSION]) {
  const result=command(`begin;
   insert into payment_consents(booking_id,edition_id,stripe_setup_intent_id,amount_cents,pricing_mode,terms_version)
   select booking_id,edition_id,'seti_proposed_review_fixture',amount_cents,pricing_mode,'${version}'
   from payment_consents where edition_id='${fixture.campaign1}' limit 1;
   select private.consent_review_reason(id) from payment_consents where stripe_setup_intent_id='seti_proposed_review_fixture';
   rollback;`);
  expect(result).toContain("Draft or unrecognized terms require owner/counsel approval before collection");
 }
});
test("cancellation during preparation blocks readiness and all ledger creation atomically",()=>{
 command(`begin;set request.jwt.claim.sub='${fixture.admin}';
 insert into customer_requests(booking_id,kind,message) select id,'cancellation','Cancel before collection preparation' from bookings where edition_id='${fixture.campaign1}' and status='reserved' limit 1;
 do $$begin
  begin perform admin_prepare_zone_collection('${fixture.campaign1}');raise exception 'unexpected_preparation';
  exception when others then if sqlerrm<>'collection_authorization_revoked' then raise;end if;end;
  if exists(select 1 from zone_charges where edition_id='${fixture.campaign1}') then raise exception 'partial_ledger_created';end if;
 end$$;rollback;`);
});
test("concurrent administrators authorize exactly one ledger per booking",async()=>{
 const sql=`set request.jwt.claim.sub='${fixture.admin}';set role authenticated;select public.admin_prepare_zone_collection('${fixture.campaign1}');`;
 const results=await Promise.all([run("python3",["scripts/local-test-db.py","-At","-c",sql]),run("python3",["scripts/local-test-db.py","-At","-c",sql])]);
 const rows=results.map(r=>JSON.parse(r.stdout.split('\n').find(l=>l.startsWith('['))!) as {id:string}[]);
 command(`select public.bind_zone_collection('${fixture.campaign1}','test','acct_fixture');`);
 expect(rows[0]).toHaveLength(10);expect(rows[0].map(c=>c.id)).toEqual(rows[1].map(c=>c.id));
 expect(command(`select count(*) from zone_charges where edition_id='${fixture.campaign1}';`).trim()).toBe('10');
 expect(command(`select count(*) from zone_charges where edition_id='${fixture.campaign2}';`).trim()).toBe('0');
});
test("private recovery tokens expire, rotate and are consumed on success",async()=>{
 const id=command(`select id from zone_charges where edition_id='${fixture.campaign1}' limit 1;`).trim();
 command(`select public.record_zone_payment('${id}','pi_recovery_fixture','requires_payment_method','evt_recovery_fixture',100,null,'test','acct_fixture');`);
 const token=await issueRecovery(db,id);expect((await resolveRecovery(db,token))?.id).toBe(id);

 expect(await resolveRecovery(db,"x".repeat(43))).toBeNull();
 const replacement=await issueRecovery(db,id);expect(await resolveRecovery(db,token)).toBeNull();
 command(`update zone_charges set recovery_expires_at=now()-interval '1 second' where id='${id}';`);
 expect(await resolveRecovery(db,replacement)).toBeNull();await expect(issueRecovery(db,id)).rejects.toThrow();
 const booking=command(`select booking_id from zone_charges where id='${id}';`).trim();
 command(`insert into customer_requests(booking_id,kind,message) values('${booking}','cancellation','Local cancellation during recovery');`);
 expect(await resolveRecovery(db,token)).toBeNull();
 command(`set request.jwt.claim.sub='${fixture.admin}';set role authenticated;select public.admin_resolve_customer_request(id,'declined','Fixture only') from customer_requests where booking_id='${booking}' and kind='cancellation';`);
 expect(await resolveRecovery(db,token)).toBeNull();
 await expect(issueRecovery(db,id)).rejects.toThrow();

 command(`update zone_charges set recovery_expires_at=now()+interval '1 hour' where id='${id}';select public.record_zone_payment('${id}','pi_recovery_fixture','succeeded','evt_recovery_success',101,null,'test','acct_fixture');`);
 expect(await resolveRecovery(db,replacement)).toBeNull();
});


test("payment notices use the existing outbox but never send test email externally",async()=>{
 vi.stubEnv("STRIPE_ACCOUNT_ID","acct_fixture");vi.stubEnv("INSIDE914_COLLECTION_MODE","test");vi.stubEnv("INSIDE914_TEST_COLLECTION","true");vi.stubEnv("STRIPE_SECRET_KEY","sk_test_fixture");vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY","pk_test_fixture");
 let path:string|undefined;
 try {
  const id=command(`select id from zone_charges where edition_id='${fixture.campaign1}' and status='pending' limit 1;`).trim();
  command(`select public.record_zone_payment('${id}','pi_notice_fixture','requires_payment_method','evt_notice_fixture',200,null,'test','acct_fixture');`);
  const outbox=command(`select o.id from email_outbox o join zone_charges c on c.booking_id=o.booking_id where c.id='${id}' and o.kind='payment_needed';`).trim();
  const sender=vi.fn(async()=>({id:"should-not-send"}));
  expect(await processOutboxRow(db,outbox,sender)).toBe("sent");expect(sender).not.toHaveBeenCalled();
  path=`.dev-emails/${outbox}.html`;
  const amount=Number(command(`select amount_cents from zone_charges where id='${id}';`).trim());
  expect([39900,34900]).toContain(amount);
  const html=readFileSync(path,"utf8");expect(html).toContain(`$${amount/100} for this zone only`);expect(html).toContain("http://localhost:3000/pay/");
  expect(command(`select provider_message_id from email_outbox where id='${outbox}';`).trim()).toBe("not-delivered:test-reservation");
 } finally {if(path)unlinkSync(path);vi.unstubAllEnvs();}
});


test("disabled collection leaves payment notices queued without consuming attempts",async()=>{
 const id=command(`select id from zone_charges where edition_id='${fixture.campaign1}' and status='pending' limit 1;`).trim();
 command(`select public.record_zone_payment('${id}','pi_disabled_notice','requires_payment_method','evt_disabled_notice',300,null,'test','acct_fixture');`);
 const outbox=command(`select o.id from email_outbox o join zone_charges c on c.booking_id=o.booking_id where c.id='${id}' and o.kind='payment_needed';`).trim();
 const sender=vi.fn(async()=>({id:"must-not-send"}));
 expect(await processOutboxRow(db,outbox,sender)).toBe("skipped");
 expect(sender).not.toHaveBeenCalled();
 expect(command(`select status||':'||attempts from email_outbox where id='${outbox}';`).trim()).toBe("pending:0");
});

// These scenarios use the real PostgreSQL locking/RPC protocol and synthetic
// ledgers only. Each SQL scenario rolls back its own changes.
function coordination(sql:string) {
 return command(`begin;set request.jwt.claim.sub='${fixture.admin}';
 create function pg_temp.check(ok boolean) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'coordination assertion failed';end if;end$$;
 create function pg_temp.denied(q text) returns void language plpgsql as $$begin begin execute q;exception when others then return;end;raise exception 'expected denial';end$$;
 create temp table selected as select id,booking_id from zone_charges where edition_id='${fixture.campaign1}' and status='pending' order by id limit 1;
 ${sql}\nrollback;`);
}
test("cancellation before collection durably blocks creation and cannot be dismissed into reusable authority",()=>{
 coordination(`insert into customer_requests(booking_id,kind,message) select booking_id,'cancellation','Cancel before collection' from selected;
 select pg_temp.denied(format('select begin_payment_operation(%L,''create'')',id)) from selected;
 select pg_temp.denied(format('select admin_resolve_customer_request(%L,''resolved'',''Not actually canceled'')',r.id)) from customer_requests r join selected s using(booking_id);
 select admin_resolve_customer_request(r.id,'declined','Review complete; authority still revoked') from customer_requests r join selected s using(booking_id);
 select pg_temp.denied(format('select begin_payment_operation(%L,''create'')',id)) from selected;
 select pg_temp.check(admin_cancel_booking(booking_id,'Owner approved cancellation')='done') from selected;
 select pg_temp.check(status='cancelled') from bookings where id=(select booking_id from selected);
 select pg_temp.check(count(*)=0) from booking_slots where booking_id=(select booking_id from selected) and released_at is null;`);
});
test("in-flight cancellation remains unresolved until the known provider intent is canceled",()=>{
 coordination(`create temp table op as select begin_payment_operation(id,'create') result from selected;
 insert into customer_requests(booking_id,kind,message) select booking_id,'cancellation','In-flight cancellation' from selected;
 select pg_temp.check(admin_cancel_booking(booking_id,'Owner approves')='requires_resolution') from selected;
 select pg_temp.check(finish_payment_operation(id,(select (result->>'token')::uuid from op),'pi_inflight','requires_confirmation')='reconciliation') from selected;
 select pg_temp.denied(format('select begin_payment_operation(%L,''confirm'')',id)) from selected;
 create temp table cancel_op as select begin_payment_operation(id,'cancel') result from selected;
 select pg_temp.check(finish_payment_operation(id,(select (result->>'token')::uuid from cancel_op),'pi_inflight','canceled')='canceled') from selected;
 select pg_temp.check(admin_cancel_booking(booking_id,'Verified provider cancellation')='done') from selected;
 select pg_temp.check(record_zone_payment(id,'pi_inflight','canceled','evt_late_cancel',900,null,'test','acct_fixture')='stale') from selected;
 select pg_temp.check(status='cancelled') from bookings where id=(select booking_id from selected);`);
});
test("success while cancellation is pending is recorded without refund or false cancellation",()=>{
 coordination(`create temp table op as select begin_payment_operation(id,'create') result from selected;
 insert into customer_requests(booking_id,kind,message) select booking_id,'cancellation','In-flight request' from selected;
 select record_zone_payment(id,'pi_success_conflict','succeeded','evt_success_conflict',999,null,'test','acct_fixture') from selected;
 select pg_temp.check(admin_cancel_booking(booking_id,'Owner request')='requires_resolution') from selected;
 select pg_temp.check(status='charged') from bookings where id=(select booking_id from selected);
 select pg_temp.check(state='accepted' and revoked_at is not null) from booking_payment_controls where booking_id=(select booking_id from selected);
 select pg_temp.check(count(*)=1) from zone_payment_events where id='evt_success_conflict';
 select pg_temp.check(record_zone_payment(id,'pi_success_conflict','succeeded','evt_success_conflict',999,null,'test','acct_fixture')='duplicate') from selected;`);
});
test("expired workers are fenced and crash retries keep one creation identity within the replay window",()=>{
 coordination(`create temp table oldop as select begin_payment_operation(id,'create') result from selected;
 select pg_temp.check(begin_payment_operation(id,'create')->>'decision'='busy') from selected;
 update booking_payment_controls set lease_until=now()-interval '1 second' where booking_id=(select booking_id from selected);
 create temp table newop as select begin_payment_operation(id,'create') result from selected;
 select pg_temp.check((select result->>'token' from oldop)<>(select result->>'token' from newop));
 select pg_temp.denied(format('select finish_payment_operation(%L,%L,''pi_crash'',''requires_confirmation'')',id,(select result->>'token' from oldop))) from selected;
 select finish_payment_operation(id,(select (result->>'token')::uuid from newop),null,'unknown') from selected;
 select pg_temp.check(state='reconciliation') from booking_payment_controls where booking_id=(select booking_id from selected);
 update booking_payment_controls set first_started_at=now()-interval '24 hours' where booking_id=(select booking_id from selected);
 select pg_temp.check(begin_payment_operation(id,'create')->>'decision'='reconcile') from selected;`);
});
test("unknown intent plus canceled authority cannot create again or claim cancellation is complete",()=>{
 coordination(`create temp table op as select begin_payment_operation(id,'create') result from selected;
 select finish_payment_operation(id,(select (result->>'token')::uuid from op),null,'unknown') from selected;
 insert into customer_requests(booking_id,kind,message) select booking_id,'cancellation','Cancel after timeout' from selected;
 select pg_temp.denied(format('select begin_payment_operation(%L,''create'')',id)) from selected;
 select pg_temp.check(begin_payment_operation(id,'cancel')->>'decision'='reconcile') from selected;
 select pg_temp.check(admin_cancel_booking(booking_id,'Investigate unknown intent')='requires_resolution') from selected;`);
});
test("payment control and printer mutation permissions reject anonymous and ordinary browser writes",()=>{
 coordination(`select pg_temp.denied(format('select finish_payment_operation(%L,null,''pi_unclaimed'',''canceled'')',id)) from selected;
 select pg_temp.denied(format('select begin_payment_operation(%L,null)',id)) from selected;
 select pg_temp.check(not has_function_privilege('anon','public.begin_payment_operation(uuid,text)','execute'));
 select pg_temp.check(not has_function_privilege('authenticated','public.finish_payment_operation(uuid,uuid,text,text)','execute'));
 select pg_temp.check(not has_table_privilege('authenticated','public.booking_payment_controls','update'));
 select pg_temp.check(not has_table_privilege('authenticated','public.printer_order_events','insert'));
 set local role anon;select pg_temp.denied('select * from booking_payment_controls');reset role;
 set local role authenticated;select pg_temp.check(count(*)=0) from printer_order_events;reset role;`);
});
test("printer milestones require ordered evidence and block automatic cancellation at commitment",()=>{
 coordination(`create temp table proof as select id from mailing_evidence where edition_id='${fixture.campaign1}' limit 1;
 select pg_temp.denied(format('select admin_record_printer_stage(%L,''committed'',%L,''Out of order'')','${fixture.campaign1}',id)) from proof;
 select pg_temp.denied(format('select admin_record_printer_stage(%L,''submitted'',%L,''Missing file'')','${fixture.campaign1}',id)) from proof;
 insert into storage.objects(bucket_id,name) select 'mailing-evidence',storage_path from mailing_evidence where id=(select id from proof);
 select admin_record_printer_stage('${fixture.campaign1}','submitted',id,'Synthetic submission evidence') from proof;
 select admin_record_printer_stage('${fixture.campaign1}','submitted',id,'Duplicate submission') from proof;
 select pg_temp.check(count(*)=1) from printer_order_events where edition_id='${fixture.campaign1}';
 select admin_record_printer_stage('${fixture.campaign1}','committed',id,'Synthetic confirmed printer acceptance') from proof;
 select pg_temp.check(admin_cancel_booking(booking_id,'Needs printer decision')='requires_resolution') from selected;
 select pg_temp.check(status='reserved') from bookings where id=(select booking_id from selected);`);
});
test("real concurrent database workers receive only one collection lease",async()=>{
 const id=command(`select id from zone_charges where edition_id='${fixture.campaign1}' and status='pending' order by id limit 1;`).trim();
 const results=await Promise.all([1,2].map(()=>db.rpc("begin_payment_operation",{p_charge:id,p_action:"create"})));
 expect(results.every(r=>!r.error)).toBe(true);
 const values=results.map(r=>r.data as {decision:string;token?:string});
 expect(values.map(r=>r.decision).sort()).toEqual(["allowed","busy"]);
 const token=values.find(r=>r.token)!.token!;
 expect((await db.rpc("finish_payment_operation",{p_charge:id,p_token:token,p_intent:null,p_status:"unknown"})).error).toBeNull();
});

async function paymentFixture() {
 const id=command(`select c.id from zone_charges c join booking_payment_controls p using(booking_id) where c.edition_id='${fixture.campaign1}' and c.status='pending' and p.state='not_started' order by c.id limit 1;`).trim();
 const row=await db.from("zone_charges").select("*").eq("id",id).single();expect(row.error).toBeNull();return row.data!;
}
async function mockProvider(c:NonNullable<Awaited<ReturnType<typeof paymentFixture>>>) {
 const intent={id:`pi_${c.id.replaceAll("-","")}`,amount:c.amount_cents,currency:"usd",customer:c.customer_id,livemode:false,status:"requires_confirmation",metadata:{zone_charge_id:c.id,booking_id:c.booking_id,edition_id:c.edition_id,consent_id:c.consent_id}};
 const api={context:{mode:"test",accountId:"acct_fixture"},accounts:{retrieve:vi.fn(async()=>({id:"acct_fixture"}))},customers:{retrieve:vi.fn(async()=>({id:c.customer_id,livemode:false}))},paymentMethods:{retrieve:vi.fn(async()=>({customer:c.customer_id,livemode:false}))},paymentIntents:{create:vi.fn(async()=>intent),retrieve:vi.fn(async()=>intent),confirm:vi.fn(async()=>({...intent,status:"requires_action"})),cancel:vi.fn(async()=>({...intent,status:"canceled"}))}};
 const {collectCharge,reconcileCancellation,handlePaymentEvent}=await import("@/lib/payments/charge");
 return {intent,api,collect:()=>collectCharge(db,api as unknown as import("@/lib/payments/charge").PaymentStripe,c.id),reconcile:()=>reconcileCancellation(db,api as unknown as import("@/lib/payments/charge").PaymentStripe,c.id),event:()=>handlePaymentEvent(db,api as unknown as import("@/lib/payments/charge").PaymentStripe,{id:`evt_${c.id}`,type:"payment_intent.succeeded",livemode:false,created:Math.floor(Date.now()/1000),data:{object:intent}} as unknown as import("stripe").default.Event)};
}
function barrier<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
test("real DB plus provider mock: cancellation during creation prevents confirm and reconciles the issued intent",async()=>{
 const c=await paymentFixture(),p=await mockProvider(c),entered=barrier<void>(),release=barrier<typeof p.intent>();
 p.api.paymentIntents.create.mockImplementation(async()=>{entered.resolve();return release.promise;});
 const running=p.collect();const outcome=running.catch(e=>e);await entered.promise;
 expect((await db.from("customer_requests").insert({booking_id:c.booking_id,kind:"cancellation",message:"Cancel while provider request is in flight"})).error).toBeNull();
 release.resolve(p.intent);expect(await outcome).toBeInstanceOf(Error);expect(p.api.paymentIntents.confirm).not.toHaveBeenCalled();
 expect(command(`select state from booking_payment_controls where booking_id='${c.booking_id}';`).trim()).toBe("reconciliation");
 expect(await p.reconcile()).toBe("canceled");
 expect(p.api.paymentIntents.cancel).toHaveBeenCalledWith(p.intent.id,{}, {idempotencyKey:`zone-cancel-${c.id}`});
 expect(command(`set request.jwt.claim.sub='${fixture.admin}';select admin_cancel_booking('${c.booking_id}','Provider verified cancellation');`)).toContain("done");
});
test("real DB plus provider mock: confirmation success racing cancellation needs review and a late webhook records truth",async()=>{
 const c=await paymentFixture(),p=await mockProvider(c),entered=barrier<void>(),release=barrier<typeof p.intent>();
 p.api.paymentIntents.confirm.mockImplementation(async()=>{entered.resolve();return release.promise;});
 const running=p.collect();await entered.promise;
 expect((await db.from("customer_requests").insert({booking_id:c.booking_id,kind:"cancellation",message:"Cancel during confirmation"})).error).toBeNull();
 p.intent.status="succeeded";release.resolve(p.intent);expect(await running).toBe("succeeded");
 expect(command(`select status from bookings where id='${c.booking_id}';`).trim()).toBe("reserved");
 expect(await p.event()).toBe("recorded");expect(await p.event()).toBe("duplicate");
 expect(command(`select status from bookings where id='${c.booking_id}';`).trim()).toBe("charged");
 expect(command(`set request.jwt.claim.sub='${fixture.admin}';select admin_cancel_booking('${c.booking_id}','Needs explicit review');`)).toContain("requires_resolution");
 expect(p.api.paymentIntents.cancel).not.toHaveBeenCalled();
});
test("real DB plus provider mock: timeout retries replay the existing creation key and concurrent administrators do not duplicate writes",async()=>{
 const c=await paymentFixture(),p=await mockProvider(c);
 p.api.paymentIntents.create.mockRejectedValueOnce(new Error("Provider timeout"));
 await expect(p.collect()).rejects.toThrow("Provider timeout");
 expect(command(`select state from booking_payment_controls where booking_id='${c.booking_id}';`).trim()).toBe("reconciliation");
 const entered=barrier<void>(),release=barrier<typeof p.intent>();p.api.paymentIntents.create.mockImplementation(async()=>{entered.resolve();return release.promise;});
 const first=p.collect();await entered.promise;await expect(p.collect()).rejects.toThrow("busy");
 release.resolve(p.intent);expect(await first).toBe("requires_action");
 expect(p.api.paymentIntents.create).toHaveBeenCalledTimes(2);expect(p.api.paymentIntents.confirm).toHaveBeenCalledTimes(1);
 expect(p.api.paymentIntents.create.mock.calls[0]).toEqual(p.api.paymentIntents.create.mock.calls[1]);
});
