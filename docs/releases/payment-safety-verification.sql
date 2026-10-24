-- Read-only verification of the final production safety migration.
begin read only;
with expected(identity,body_md5) as (values
('private.check_zone_collection(uuid)','e434f8bc37b5bd784d01f5b6d8a3dc03'),
('private.collection_cancellation_requested()','22506eb0405d1a8b7f8721134b74d6bb'),
('private.guard_collection_booking()','cf2bc69287c23a7b9b250686717337e5'),
('private.guard_collection_claim()','a5f4d4ccadfcd182c85b29d2f211ea90'),
('private.guard_collection_consent()','47bd41f292f7de6ead7039e677988e60'),
('private.lock_payment_control(uuid)','f1ee1b1c7c11e814ee1cdca3849e6bb7'),
('private.payment_cancellation_safe(uuid)','494c2bd313ec4f65a2ab48cf23be6e08'),
('admin_cancel_booking(uuid,text)','9072ef039744d95fd708d8e71c34a80a'),
('admin_record_printer_stage(uuid,text,uuid,text)','52c71adec74421838c90f4310c2f0e1b'),
('admin_resolve_customer_request(uuid,text,text)','1a3567a515205da760198d5440335797'),
('begin_payment_operation(uuid,text)','2c699f03a4c660b465841cd3b3707a9d'),
('finish_payment_operation(uuid,uuid,text,text)','0544b511c31d3cb5d0436c1fd6c1781f'),
('record_zone_payment(uuid,text,text,text,bigint,text,text,text)','187b6bae3cbb2a447f5cf80523f78cff')
)
select e.identity,md5(p.prosrc)=e.body_md5 as body_matches,
p.prosecdef and p.proconfig=array['search_path=""'] as security_matches
from expected e left join pg_proc p on p.oid=to_regprocedure(e.identity);
select c.relname,c.relrowsecurity,
 not has_table_privilege('anon',c.oid,'SELECT') as no_anonymous_access,
 not has_table_privilege('authenticated',c.oid,'UPDATE') as no_browser_updates
from pg_class c where c.oid in ('public.booking_payment_controls'::regclass,'public.printer_order_events'::regclass);
select not has_function_privilege('authenticated','public.begin_payment_operation(uuid,text)','EXECUTE') as no_browser_payment_claim,
 has_function_privilege('service_role','public.begin_payment_operation(uuid,text)','EXECUTE') as service_payment_claim,
 has_function_privilege('authenticated','public.admin_record_printer_stage(uuid,text,uuid,text)','EXECUTE') as admin_printer_entrypoint,
 not has_function_privilege('anon','public.admin_record_printer_stage(uuid,text,uuid,text)','EXECUTE') as no_anonymous_printer_entrypoint;
commit;
