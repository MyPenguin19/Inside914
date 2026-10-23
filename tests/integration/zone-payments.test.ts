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
  const html=readFileSync(path,"utf8");expect(html).toContain("$399 for this zone only");expect(html).toContain("http://localhost:3000/pay/");
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
