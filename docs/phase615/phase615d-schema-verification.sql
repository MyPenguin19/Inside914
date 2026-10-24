-- Phase 6.15D postflight. READ ONLY. No customer rows or secret values.
-- Generated from the five frozen migrations; expected function bodies are exact.
with expected(name,body_md5) as (values
  ('private.check_zone_collection','b981f6f25e0cffacf7eba502bde02e38'),
  ('private.consent_review_reason','e770b765616854ec6e9ccd932048e327'),
  ('private.customer_evidence_current','adb815481fd362afeac700c0c88014f3'),
  ('private.freeze_payment_consent','1994b571dcc2d60d031ef2b5799e8bc6'),
  ('private.guard_collection_consent','0af4be0e99a200ee6713b10ba4f88ed9'),
  ('private.notify_reservation_confirmed','0351b158cdc3a80b11a717a9ae33fbd9'),
  ('public.admin_acknowledge_alert','b117203cb1b091359218097c4a8c84ea'),
  ('public.admin_consent_review','f5c3962e535742e5fc3477efe58127a3'),
  ('public.admin_create_invitation','1c73ec23748c0cfe5d0f5165c404701a'),
  ('public.admin_publish_evidence','6de87a9bf296a248f270beb3a744df90'),
  ('public.admin_resolve_customer_request','d68a558bd04af7afc64f95488db2e3ae'),
  ('public.admin_retry_email_delivery','12b5d750e814645c3bfb0ea11a91de2c'),
  ('public.assert_charge_consent','42c2829abe5173a65515a09f227d3dbc'),
  ('public.claim_email_delivery','b09d2685363010a13c4203d07263cf5f'),
  ('public.consume_reservation_recovery','e7d2fd694ed6c8720f6c5b9f3a2fb102'),
  ('public.customer_mailing_evidence','e97e975e120b6fc6bd306425b9db8a5b'),
  ('public.extend_cart_hold','4c52fc6234e40dd8e0f6f4a12f1134eb'),
  ('public.hold_cart','d0907116f3858644d4ece0324a675c7b'),
  ('public.note_artwork_cleanup_failure','abe0882d43da7517e6b247ebc8b76a60'),
  ('public.prepare_reservation_recovery','62a73e170509619816e6fd42053a5d15'),
  ('public.record_email_event','74e67df302a2d159c95a77d3e1777ac8'),
  ('public.refresh_operational_alerts','b7425267d53015bdb4799331dae0ff17'),
  ('public.submit_customer_request','2e6e3a11dee6fbd7e0a4f0f3651f9c95'),
  ('public.sync_email_delivery','e46cb546f07e844e19b135aaf3b788ed')
), actual as (
 select n.nspname||'.'||p.proname name,md5(p.prosrc) body_md5,p.prosecdef,p.proconfig
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
)
select e.name,count(a.name)=1 and bool_and(a.body_md5=e.body_md5) as body_matches,
 bool_and(a.proconfig @> array['search_path=""']) as empty_search_path
from expected e left join actual a using(name) group by e.name order by e.name;

select c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'select') as anonymous_select,
 has_column_privilege('authenticated',c.oid,
 case when c.relname='email_deliveries' then 'payload_ciphertext' else 'id' end,'select') as authenticated_sensitive_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('email_deliveries','email_delivery_events','reservation_recoveries','customer_requests','operational_alerts','advertiser_invitations') order by c.relname;

select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in
 ('email_deliveries','email_delivery_events','reservation_recoveries','customer_requests','operational_alerts','advertiser_invitations') order by tablename,policyname;

select tgname,tgenabled from pg_trigger where not tgisinternal and tgname in
 ('freeze_payment_consent','collection_consent_guard','notify_reservation_confirmed') order by tgname;

select table_name,column_name,data_type from information_schema.columns where table_schema='public' and
 ((table_name='payment_consents' and column_name in ('consent_text','reservation_deadline_at_consent'))
 or (table_name='reservation_carts' and column_name='hold_extensions')
 or (table_name='artwork_uploads' and column_name='cleanup_failures')) order by table_name,column_name;

-- Public RPC grants. Admin RPCs also require private.require_admin() in their verified bodies.
with expected(name,access_kind) as (values
 ('admin_acknowledge_alert','admin'),('admin_consent_review','admin'),
 ('admin_create_invitation','admin'),('admin_publish_evidence','admin'),
 ('admin_resolve_customer_request','admin'),('admin_retry_email_delivery','admin'),
 ('assert_charge_consent','service'),('claim_email_delivery','service'),
 ('consume_reservation_recovery','service'),('customer_mailing_evidence','service'),
 ('extend_cart_hold','service'),('hold_cart','service'),
 ('note_artwork_cleanup_failure','service'),('prepare_reservation_recovery','service'),
 ('record_email_event','service'),('refresh_operational_alerts','service'),
 ('submit_customer_request','service'),('sync_email_delivery','service')
)
select e.name,e.access_kind,
 count(p.oid)=1 and bool_and(not has_function_privilege('anon',p.oid,'execute'))
 and bool_and(has_function_privilege('authenticated',p.oid,'execute')=(e.access_kind='admin'))
 and bool_and(case when e.access_kind='service' then has_function_privilege('service_role',p.oid,'execute') else true end) as grants_match
from expected e left join pg_proc p on p.proname=e.name and p.pronamespace='public'::regnamespace
group by e.name,e.access_kind order by e.name;

-- Historical evidence/artwork storage remains private; no new bucket is required.
select id,public from storage.buckets where id in ('artwork','mailing-evidence','house-artwork') order by id;
