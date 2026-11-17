-- Run only against isolated local PostgreSQL. Every fixture and simulated approval rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject(sql text, code text, label text) returns void language plpgsql as $$
begin
 begin execute sql; set constraints all immediate;
 exception when others then
  if sqlstate<>code then raise exception 'FAIL: %: expected %, got % (%)',label,code,sqlstate,sqlerrm; end if;
  raise notice 'PASS: %',label; return;
 end;
 raise exception 'FAIL: % was accepted',label;
end $$;
create temporary table fixture(k text primary key,id uuid);
grant all on fixture to authenticated,anon;
insert into fixture values('admin',gen_random_uuid());
insert into auth.users(id) select id from fixture where k='admin';
insert into public.admins(user_id) select id from fixture where k='admin';
select set_config('request.jwt.claim.sub',(select id::text from fixture where k='admin'),true);
create function pg_temp.payload(zone uuid) returns jsonb language sql as $$
 select jsonb_build_object('zone_id',zone,'name','Isolated square test','issue_month','2098-01-01',
 'target_quantity',5000,'reservation_deadline','2097-12-16T04:59:00Z','artwork_due_at','2097-12-21T04:59:00Z',
 'mailing_window_start','2098-01-11','mailing_window_end','2098-01-15',
 'layout_template','amazingmail-9x6-ten-square-draft','unit_price_cents',39900,'back_unit_price_cents',39900,'double_price_cents',null)
$$;
insert into fixture select 'zone'||i,gen_random_uuid() from generate_series(1,4) i;
insert into zones(id,name,slug,household_count) select id,'Square fixture '||id,'square-fixture-'||id,5000 from fixture where k like 'zone%';
set local role authenticated;
insert into fixture select 'campaign'||right(k,1),public.admin_create_square_campaign(pg_temp.payload(id)||jsonb_build_object('unit_price_cents',case right(k,1) when '2' then 44900 when '3' then 29900 else 39900 end)) from fixture where k like 'zone%';
reset role;
set constraints all immediate;
set constraints all deferred;
create function pg_temp.f(key text) returns uuid language sql as $$ select id from fixture where k=key $$;
select pg_temp.assert(not has_table_privilege('authenticated','private.campaign_operations','INSERT'),'upgrade capability cannot be forged');
select pg_temp.assert(not has_table_privilege('service_role','private.campaign_layout_history','UPDATE'),'layout history cannot be rewritten by API roles');
select public.admin_update_campaign(pg_temp.f('campaign2'),'{"unit_price_cents":44900}');
select public.admin_update_campaign(pg_temp.f('campaign3'),'{"unit_price_cents":29900}');
select pg_temp.assert((select unit_price_cents=44900 from editions where id=pg_temp.f('campaign2')),'custom campaign price persisted');
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
select pg_temp.reject(format('select public.admin_update_campaign(%L,''{"unit_price_cents":1}'')',pg_temp.f('campaign1')),'ADM01','non-admin cannot change prices');
select pg_temp.reject(format('select public.admin_delete_campaign(%L,''DELETE CAMPAIGN'')',pg_temp.f('campaign3')),'ADM01','non-admin cannot delete campaigns');
select pg_temp.reject(format('select public.admin_archive_campaign(%L,''ARCHIVE CAMPAIGN'')',pg_temp.f('campaign1')),'ADM01','non-admin cannot archive');
select pg_temp.reject(format('select public.admin_upgrade_campaign_layout(%L,''x'',''UPGRADE TO V2'')',pg_temp.f('campaign1')),'ADM01','non-admin cannot upgrade');
select set_config('request.jwt.claim.sub',pg_temp.f('admin')::text,true);
select public.admin_set_campaign_status(pg_temp.f('campaign1'),'open');
insert into fixture select 'accepted',booking_id from public.hold_slots(array[(select id from slots where edition_id=pg_temp.f('campaign1') and label='B1')],encode(extensions.gen_random_bytes(32),'hex'),'launch',39900,null);
select public.admin_update_campaign(pg_temp.f('campaign1'),'{"unit_price_cents":44900}');
select pg_temp.assert((select price_cents=39900 from bookings where id=pg_temp.f('accepted')),'active hold retains original quote');
select pg_temp.reject(format('select public.hold_slots(array[%L::uuid],%L,''launch'',1,null)',(select id from slots where edition_id=pg_temp.f('campaign1') and label='F1'),encode(extensions.gen_random_bytes(32),'hex')),'INS05','client tampering rejected');
insert into fixture select 'held',booking_id from public.hold_slots(array[(select id from slots where edition_id=pg_temp.f('campaign1') and label='F1')],encode(extensions.gen_random_bytes(32),'hex'),'launch',44900,null);
select public.admin_update_campaign(pg_temp.f('campaign1'),'{"unit_price_cents":29900}');
select pg_temp.assert((select price_cents=44900 from bookings where id=pg_temp.f('held')),'second hold retains its own quote after later price update');
select pg_temp.reject(format('update bookings set price_cents=29900 where id=%L',pg_temp.f('accepted')),'INS05','accepted quote cannot be rewritten');
-- Confirm the first hold with fixtures only; no network or real Stripe objects.
insert into booking_contacts(booking_id,business_name,contact_name,email,phone) values(pg_temp.f('accepted'),'Local fixture','Owner','fixture@example.com','+19145550123');
insert into payment_consents(booking_id,edition_id,stripe_setup_intent_id,amount_cents,pricing_mode,terms_version)
 values(pg_temp.f('accepted'),pg_temp.f('campaign1'),'seti_fixture',39900,'launch','square-zones-v1');
insert into booking_artwork(booking_id,storage_path,status,crop_x,crop_y,crop_width,crop_height,width_px,height_px,content_type,byte_size,zoom,review_status)
 values(pg_temp.f('accepted'),pg_temp.f('accepted')||'/original.png','ready',0,0,1200,1200,1200,1200,'image/png',10000,1,'approved');
update bookings set stripe_customer_id='cus_fixture',stripe_setup_intent_id='seti_fixture',stripe_payment_method_id='pm_fixture',status='reserved',reference='IN914-'||translate(upper(substr(md5(id::text),1,6)),'01','GH'),confirmed_at=now() where id=pg_temp.f('accepted');
select pg_temp.assert(not (public.admin_layout_upgrade_preview(pg_temp.f('campaign1'))->>'eligible')::boolean,'open live campaign cannot upgrade');
select public.admin_set_campaign_status(pg_temp.f('campaign1'),'pause');
select pg_temp.assert(not (public.admin_layout_upgrade_preview(pg_temp.f('campaign1'))->>'eligible')::boolean,'active holds block upgrade even while paused');
update bookings set hold_expires_at=now()-interval '1 second' where id=pg_temp.f('held');
insert into storage.objects(bucket_id,name,metadata) values('house-artwork','house/'||pg_temp.f('admin')||'.png','{}');
insert into house_artwork(singleton,storage_path,width_px,height_px,updated_by) values(true,'house/'||pg_temp.f('admin')||'.png',2990,2086,pg_temp.f('admin'))
 on conflict(singleton) do update set storage_path=excluded.storage_path,updated_at=now();
insert into mailing_evidence(edition_id,kind,title,storage_path,uploaded_by,published_at,published_by,uploaded_at)
 values(pg_temp.f('campaign1'),'final_proof','Historical V1 proof',pg_temp.f('campaign1')||'/'||gen_random_uuid()||'.pdf',pg_temp.f('admin'),now(),pg_temp.f('admin'),clock_timestamp());
select pg_temp.assert(private.current_square_proof(pg_temp.f('campaign1')),'V1 proof was current before upgrade');
create temporary table saved as select private.campaign_layout_snapshot(pg_temp.f('campaign1')) snapshot;
select pg_temp.assert((public.admin_layout_upgrade_preview(pg_temp.f('campaign1'))->>'eligible')::boolean,'paused V1 with expired holds has safe ten-position mapping');
create temporary table preview as select public.admin_layout_upgrade_preview(pg_temp.f('campaign1')) value;
select pg_temp.assert(jsonb_array_length((select value->'mapping' from preview))=10,'dry run maps exactly ten labels');
select pg_temp.assert((select snapshot from saved)=private.campaign_layout_snapshot(pg_temp.f('campaign1')),'preview is read-only');
select pg_temp.reject(format('select public.admin_upgrade_campaign_layout(%L,%L,''wrong'')',pg_temp.f('campaign1'),(select value->>'fingerprint' from preview)),'P0001','upgrade confirmation required');
select pg_temp.reject(format('select public.admin_upgrade_campaign_layout(%L,''stale'',''UPGRADE TO V2'')',pg_temp.f('campaign1')),'P0001','stale dry run rejected');
select public.admin_upgrade_campaign_layout(pg_temp.f('campaign1'),(select value->>'fingerprint' from preview),'UPGRADE TO V2');
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert(not private.current_square_proof(pg_temp.f('campaign1')),'V1 proof stays preserved but cannot approve V2');
select pg_temp.assert((select layout_template='amazingmail-9x6-v2' and status='open' and reservations_paused_at is not null from editions where id=pg_temp.f('campaign1')),'upgrade stays paused and uses V2');
select pg_temp.assert((select snapshot->'bookings' from saved)=private.campaign_layout_snapshot(pg_temp.f('campaign1'))->'bookings','all booking fields including prices, payment methods, Stripe IDs and ownership unchanged');
select pg_temp.assert((select snapshot->'claims' from saved)=private.campaign_layout_snapshot(pg_temp.f('campaign1'))->'claims','reservation slot ownership unchanged');
select pg_temp.assert((select count(*)=10 from slots s join jsonb_array_elements((select snapshot->'slots' from saved)) old on old->>'id'=s.id::text and old->>'label'=s.label where s.edition_id=pg_temp.f('campaign1')),'all ten slot IDs and labels preserved');
select pg_temp.assert((select width_in=2.2925 and height_in=2.815 from slots where edition_id=pg_temp.f('campaign1') and label='B1'),'back changed to registered rectangle');
select pg_temp.assert((select review_status='pending' and crop_width=1200 and crop_height=1200 and storage_path=pg_temp.f('accepted')||'/original.png' from booking_artwork where booking_id=pg_temp.f('accepted')),'original square crop retained without stretching and approval reset');
select pg_temp.assert((select count(*)=1 from private.campaign_layout_history where edition_id=pg_temp.f('campaign1') and snapshot=(select snapshot from saved)),'historical V1 inputs preserved');
select pg_temp.assert(public.admin_upgrade_campaign_layout(pg_temp.f('campaign1'),'old-fingerprint','UPGRADE TO V2')='already','upgrade retry is idempotent');
select pg_temp.reject(format('update slots set width_in=1 where edition_id=%L',pg_temp.f('campaign1')),'MVP02','ordinary geometry edits remain forbidden');
select pg_temp.assert((select layout_template='amazingmail-9x6-ten-square-draft' from editions where id=pg_temp.f('campaign2')),'other V1 campaign untouched');
select pg_temp.assert(not (public.admin_collection_preview(pg_temp.f('campaign1'))->>'ready')::boolean,'upgrade never releases payment safeguards');
select pg_temp.assert((select count(*)=0 from zone_charges where edition_id in(select id from fixture where k like 'campaign%')),'no collection ledgers or charges created');
-- Deletion and archiving are separate owner actions.
select pg_temp.reject(format('select public.admin_delete_campaign(%L,''wrong'')',pg_temp.f('campaign3')),'P0001','delete confirmation required');
select pg_temp.reject(format('delete from editions where id=%L',pg_temp.f('campaign3')),'ADM04','direct delete cannot bypass authorized procedure');
select public.admin_delete_campaign(pg_temp.f('campaign3'),'DELETE CAMPAIGN');
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert(not exists(select 1 from editions where id=pg_temp.f('campaign3')) and not exists(select 1 from slots where edition_id=pg_temp.f('campaign3')),'empty draft and safe inventory deleted');
select pg_temp.assert(exists(select 1 from admin_events where event_type='campaign.deleted' and target_id=pg_temp.f('campaign3')::text),'deletion audit survives');
select pg_temp.assert(public.admin_delete_campaign(pg_temp.f('campaign3'),'DELETE CAMPAIGN')='already','delete retry idempotent');
select pg_temp.reject(format('select public.admin_delete_campaign(%L,''DELETE CAMPAIGN'')',pg_temp.f('campaign1')),'P0001','history prevents hard deletion');
select pg_temp.reject(format('select public.admin_archive_campaign(%L,''ARCHIVE CAMPAIGN'')',pg_temp.f('campaign1')),'P0001','archive cannot cancel active obligations');
update editions set artwork_deadline=now()-interval '1 day' where id=pg_temp.f('campaign1');
select public.admin_set_campaign_status(pg_temp.f('campaign1'),'cancel');
create temporary table before_archive as select private.campaign_layout_snapshot(pg_temp.f('campaign1')) snapshot;
select public.admin_archive_campaign(pg_temp.f('campaign1'),'ARCHIVE CAMPAIGN');
select pg_temp.assert((select archived_at is not null and status='cancelled' from editions where id=pg_temp.f('campaign1')),'archive retains terminal status');
select pg_temp.assert((select snapshot->'bookings' from before_archive)=private.campaign_layout_snapshot(pg_temp.f('campaign1'))->'bookings','archiving preserves booking and payment history');
select pg_temp.assert((select snapshot->'artwork' from before_archive)=private.campaign_layout_snapshot(pg_temp.f('campaign1'))->'artwork','archiving preserves artwork');
select pg_temp.assert(not private.edition_is_bookable(pg_temp.f('campaign1')),'archive is not bookable');
select pg_temp.reject(format('select public.admin_set_campaign_status(%L,''open'')',pg_temp.f('campaign1')),'ADM04','archive cannot reopen');
rollback;
