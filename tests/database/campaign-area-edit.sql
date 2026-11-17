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

insert into fixture select 'zone'||i,gen_random_uuid() from generate_series(1,3) i;
insert into zones(id,name,slug,household_count) select id,'Area edit fixture '||id,'area-edit-'||id,5000 from fixture where k like 'zone%';
create function pg_temp.f(key text) returns uuid language sql as $$ select id from fixture where k=key $$;
set local role authenticated;
insert into fixture select 'draft',public.admin_create_square_campaign(pg_temp.payload(pg_temp.f('zone1')));
insert into fixture select 'occupied',public.admin_create_square_campaign(pg_temp.payload(pg_temp.f('zone3')));
reset role;
set constraints all immediate;
set constraints all deferred;
create temporary table inventory as select * from slots where edition_id=pg_temp.f('draft');
select pg_temp.assert((public.admin_campaign_management(pg_temp.f('draft'))->>'can_change_area')::boolean,'unused draft advertises editable area');
select pg_temp.assert(not has_function_privilege('authenticated','private.campaign_area_changeable(uuid)','EXECUTE'),'private eligibility is not an API');
select pg_temp.assert(not has_table_privilege('authenticated','private.campaign_operations','INSERT'),'area-change capability cannot be forged');
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone2'))),'ADM01','non-admin cannot move a campaign');
select set_config('request.jwt.claim.sub',pg_temp.f('admin')::text,true);
select pg_temp.reject(format('update editions set zone_id=%L where id=%L',pg_temp.f('zone2'),pg_temp.f('draft')),'ADM04','direct update cannot bypass audited RPC');
set local role authenticated;
select public.admin_update_campaign(pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone2'),'name','Corrected area'));
reset role;
select pg_temp.assert((select zone_id=pg_temp.f('zone2') and name='Corrected area' from editions where id=pg_temp.f('draft')),'selected area persisted');
select pg_temp.assert(not exists((select * from inventory except select * from slots where edition_id=pg_temp.f('draft')) union all (select * from slots where edition_id=pg_temp.f('draft') except select * from inventory)),'area correction preserves all ten slots and geometry');
select pg_temp.assert(exists(select 1 from admin_events where target_id=pg_temp.f('draft')::text and event_type='campaign.updated' and details->'before'->>'zone_id'=pg_temp.f('zone1')::text and details->'after'->>'zone_id'=pg_temp.f('zone2')::text),'before and after area are audited');
select pg_temp.assert(not exists(select 1 from private.campaign_operations where edition_id=pg_temp.f('draft')),'transaction capability removed after save');
select public.admin_update_campaign(pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone2')));
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone3'),'name','Must roll back')),'ADM04','duplicate area/month rejected');
select pg_temp.assert((select name='Corrected area' and zone_id=pg_temp.f('zone2') from editions where id=pg_temp.f('draft')),'failed save rolls back every field');
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('zone_id',gen_random_uuid())),'ADM03','nonexistent area rejected');
select pg_temp.reject(format('select public.admin_update_campaign(%L,''{"zone_id":null}'')',pg_temp.f('draft')),'ADM03','null area rejected');
select pg_temp.reject(format('update editions set layout_template=''amazingmail-9x6-v2'' where id=%L',pg_temp.f('draft')),'MVP01','layout remains immutable');
-- Retained invitations and production evidence lock even an otherwise unused draft.
insert into advertiser_invitations(edition_id,slot_id,created_by,expires_at) values(pg_temp.f('draft'),(select id from inventory limit 1),pg_temp.f('admin'),now()+interval '1 day');
select pg_temp.assert(not (public.admin_campaign_management(pg_temp.f('draft'))->>'can_change_area')::boolean,'invitation history locks area');
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone1'))),'ADM04','invited campaign cannot move');
delete from advertiser_invitations where edition_id=pg_temp.f('draft');
insert into mailing_evidence(edition_id,kind,title,storage_path,uploaded_by) values(pg_temp.f('draft'),'final_proof','Test proof',pg_temp.f('draft')||'/'||gen_random_uuid()||'.pdf',pg_temp.f('admin'));
select pg_temp.assert(not (public.admin_campaign_management(pg_temp.f('draft'))->>'can_change_area')::boolean,'production evidence locks area');
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone1'))),'ADM04','production evidence prevents move');
delete from mailing_evidence where edition_id=pg_temp.f('draft');
select public.admin_set_campaign_status(pg_temp.f('draft'),'open');
select pg_temp.assert(not (public.admin_campaign_management(pg_temp.f('draft'))->>'can_change_area')::boolean,'published campaign area stays fixed');
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone1'))),'ADM04','published campaign rejects area change');
-- Unchanged area does not prevent ordinary edits on an open campaign without bookings.
select public.admin_update_campaign(pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone2'),'name','Open campaign edit'));
insert into fixture select 'held',booking_id from public.hold_slots(array[(select id from inventory limit 1)],encode(extensions.gen_random_bytes(32),'hex'),'launch',39900,null);
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('issue_month','2098-03-01')),'ADM04','booked schedule is protected');
select public.admin_update_campaign(pg_temp.f('draft'),'{"unit_price_cents":44900}');
select pg_temp.assert((select price_cents=39900 from bookings where id=pg_temp.f('held')),'existing hold keeps its agreed price');
select public.admin_update_campaign(pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone2'),'name','Booked name edit'));
select public.admin_cancel_booking(pg_temp.f('held'),'Local fixture cancellation');
-- Retained booking history must still prevent moving a draft, even with no live claims.
update editions set status='draft' where id=pg_temp.f('draft');
select pg_temp.assert(not (public.admin_campaign_management(pg_temp.f('draft'))->>'can_change_area')::boolean,'ended booking history locks area');
select pg_temp.reject(format('select public.admin_update_campaign(%L,%L)',pg_temp.f('draft'),jsonb_build_object('zone_id',pg_temp.f('zone1'))),'ADM04','released draft cannot move');
rollback;
