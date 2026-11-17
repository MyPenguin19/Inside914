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
insert into fixture select 'campaign'||right(k,1),public.admin_create_square_campaign(pg_temp.payload(id)) from fixture where k like 'zone%';
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert((select count(*)=4 from editions where id in(select id from fixture where k like 'campaign%') and status='draft' and product_model='square_v1' and not category_exclusivity and unit_price_cents=39900 and double_unit_price_cents is null),'four zones get fixed-price drafts without category restrictions');
select pg_temp.assert((select count(*)=40 from slots where edition_id in(select id from fixture where k like 'campaign%')),'exactly ten paid slots per campaign');
select pg_temp.assert((select count(*)=24 from slots where edition_id in(select id from fixture where k like 'campaign%') and side='front' and width_in=2.5 and height_in=2.5),'six front squares per campaign');
select pg_temp.reject(format('select public.admin_create_square_campaign(%L::jsonb)',pg_temp.payload((select id from fixture where k='zone1'))),'ADM04','duplicate month and zone rejected');
select pg_temp.reject(format('select public.admin_create_square_campaign(%L::jsonb)',pg_temp.payload((select id from fixture where k='zone1'))||'{"unit_price_cents":0}'),'MVP01','zero price rejected');
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
select pg_temp.reject(format('select public.admin_create_square_campaign(%L::jsonb)',pg_temp.payload((select id from fixture where k='zone1'))),'ADM01','non-admin rejected');
select set_config('request.jwt.claim.sub',(select id::text from fixture where k='admin'),true);
create temporary table saved_layout_approval as select * from private.approved_layout_templates where template_key='amazingmail-9x6-ten-square-draft';
delete from private.approved_layout_templates where template_key='amazingmail-9x6-ten-square-draft';
select pg_temp.reject(format('update editions set status=''open'' where id=%L',(select id from fixture where k='campaign1')),'ADM04','printer gate blocks opening');
select pg_temp.reject(format('update editions set unit_price_cents=0 where id=%L',(select id from fixture where k='campaign1')),'23514','database rejects invalid price');
select pg_temp.reject(format('update editions set product_model=''legacy'' where id=%L',(select id from fixture where k='campaign1')),'MVP01','model cannot downgrade');
select pg_temp.reject(format('insert into slots(edition_id,side,label,x_in,y_in,width_in,height_in) values(%L,''back'',''HOUSE'',0,0,1,1)',(select id from fixture where k='campaign1')),'MVP02','house or eleventh position cannot be sold');
select pg_temp.reject(format('delete from slots where edition_id=%L',(select id from fixture where k='campaign1')),'MVP02','inventory cannot shrink');
select pg_temp.reject(format('update slots set width_in=1 where edition_id=%L',(select id from fixture where k='campaign1')),'MVP02','square geometry cannot change');
set local role anon;
select pg_temp.assert((select count(*)=0 from editions where id in(select id from fixture where k like 'campaign%')),'drafts invisible publicly');
reset role;
-- Restore the migrated owner approval after testing its absence.
insert into private.approved_layout_templates select * from saved_layout_approval;
update editions set status='open' where id in(select id from fixture where k like 'campaign%');
create function pg_temp.items() returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('edition_id',f.id,'mode','standard','slot_ids',jsonb_build_array(s.id),'token_hash',encode(extensions.gen_random_bytes(32),'hex')))
 from fixture f join slots s on s.edition_id=f.id and s.label='F1' where f.k like 'campaign%'
$$;
insert into fixture values('cart',public.hold_cart(encode(extensions.gen_random_bytes(32),'hex'),pg_temp.items(),'test'));
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert((select count(*)=4 from bookings where cart_id=(select id from fixture where k='cart') and price_cents=39900 and size='standard' and category_id is null),'four-area cart reserves one $399 square per zone even in test mode');
select pg_temp.reject(format('select public.hold_cart(%L,%L::jsonb,''test'')',encode(extensions.gen_random_bytes(32),'hex'),pg_temp.items()),'INS03','same square cannot be reserved twice');
select pg_temp.reject(format('update bookings set size=''full_side'' where cart_id=%L',(select id from fixture where k='cart')),'MVP03','full-side booking bypass rejected');
select pg_temp.reject(format('update bookings set price_cents=1 where cart_id=%L',(select id from fixture where k='cart')),'INS05','booking price bypass rejected');
select pg_temp.reject(format('insert into booking_slots(booking_id,slot_id) select b.id,s.id from bookings b join slots s on s.edition_id=b.edition_id and s.label=''F2'' where b.cart_id=%L',(select id from fixture where k='cart')),'MVP03','second claimed square rejected');
update bookings set status='released' where cart_id=(select id from fixture where k='cart');
-- Fill every paid position without requiring categories. An eleventh request cannot oversell.
do $$
declare s record; c text; i integer:=0; cats text[];
begin
 select array_agg(id order by id) into cats from advertising_categories;
 for s in select * from slots where edition_id=(select id from fixture where k='campaign1') order by label loop
  i:=i+1;c:=cats[i];
  perform public.hold_cart(encode(extensions.gen_random_bytes(32),'hex'),jsonb_build_array(jsonb_build_object('edition_id',s.edition_id,'mode','standard','slot_ids',jsonb_build_array(s.id),'token_hash',encode(extensions.gen_random_bytes(32),'hex'))),'launch');
 end loop;
end $$;
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert((select count(*)=10 and sum(price_cents)=399000 from bookings where edition_id=(select id from fixture where k='campaign1') and status='pending'),'capacity is ten ads totaling $3,990');
select pg_temp.reject(format('select public.hold_cart(%L,%L::jsonb,''launch'')',
 encode(extensions.gen_random_bytes(32),'hex'),
 (select jsonb_build_array(jsonb_build_object('edition_id',edition_id,'mode','standard','slot_ids',jsonb_build_array(id),'token_hash',encode(extensions.gen_random_bytes(32),'hex'))) from slots where edition_id=(select id from fixture where k='campaign1') limit 1)),
 'INS03','eleventh reservation cannot take an occupied position');
select pg_temp.assert(not private.edition_is_full((select id from fixture where k='campaign1')),'ten holds are not ten confirmed reservations');
-- Synthetic card references only: no Stripe requests, charges or deliveries.
update bookings set stripe_setup_intent_id='seti_square_'||id,stripe_customer_id='cus_square_fixture'
 where edition_id=(select id from fixture where k='campaign1') and status='pending';
insert into booking_artwork(booking_id,storage_path,status,crop_x,crop_y,crop_width,crop_height,width_px,height_px,content_type,byte_size,zoom)
 select id,id||'/fixture.png','ready',0,0,1000,1000,1000,1000,'image/png',10000,1 from bookings where edition_id=(select id from fixture where k='campaign1') and status='pending';
select public.share_square_cart_artwork(c.token_hash,a.id,a.updated_at,'[]'::jsonb) from booking_artwork a join bookings b on b.id=a.booking_id join reservation_carts c on c.id=b.cart_id where b.edition_id=(select id from fixture where k='campaign1') and b.status='pending';
insert into booking_contacts(booking_id,business_name,contact_name,email,phone)
 select id,'Square fixture','Test','square@example.com','+19145550123' from bookings where edition_id=(select id from fixture where k='campaign1') and status='pending';
savepoint wrong_amount_fixture;
insert into payment_consents(booking_id,edition_id,stripe_setup_intent_id,amount_cents,pricing_mode,terms_version)
 select id,edition_id,stripe_setup_intent_id,100,pricing_mode,'square-zones-v1' from bookings where edition_id=(select id from fixture where k='campaign1') and status='pending';
select pg_temp.assert((select public.confirm_cart(cart_id,stripe_setup_intent_id,'pm_square_fixture',jsonb_build_object(id,'IN914-'||translate(upper(substr(md5(id::text),1,6)),'01','GH')))='consent_missing'
 from bookings where edition_id=(select id from fixture where k='campaign1') and status='pending' limit 1),'wrong consent amount cannot confirm a $399 booking');
rollback to wrong_amount_fixture;
insert into payment_consents(booking_id,edition_id,stripe_setup_intent_id,amount_cents,pricing_mode,terms_version)
 select id,edition_id,stripe_setup_intent_id,39900,pricing_mode,'square-zones-v1' from bookings where edition_id=(select id from fixture where k='campaign1') and status='pending';
do $$ declare b record; result text;
begin
 for b in select * from bookings where edition_id=(select id from fixture where k='campaign1') and status='pending' loop
  result:=public.confirm_cart(b.cart_id,b.stripe_setup_intent_id,'pm_square_fixture',jsonb_build_object(b.id,'IN914-'||translate(upper(substr(md5(b.id::text),1,6)),'01','GH')));
  perform pg_temp.assert(result='confirmed','square confirmation keeps $399 consent');
 end loop;
end $$;
select pg_temp.assert(private.edition_is_full((select id from fixture where k='campaign1')),'ten confirmed square reservations fill the campaign');
update bookings set status='cancelled' where id=(select id from bookings where edition_id=(select id from fixture where k='campaign1') and status='reserved' limit 1);
update slots set blocked_at=now() where edition_id=(select id from fixture where k='campaign1') and not exists(select 1 from booking_slots bs where bs.slot_id=slots.id and bs.released_at is null);
select pg_temp.assert(not private.edition_is_full((select id from fixture where k='campaign1')),'nine reservations plus a blocked position are not full');
rollback;
