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
 'layout_template','amazingmail-9x6-ten-square-draft','unit_price_cents',39900,'double_price_cents',null)
$$;
insert into fixture select 'zone'||i,gen_random_uuid() from generate_series(1,4) i;
insert into zones(id,name,slug,household_count) select id,'Square fixture '||id,'square-fixture-'||id,5000 from fixture where k like 'zone%';
set local role authenticated;
insert into fixture select 'campaign'||right(k,1),public.admin_create_square_campaign(pg_temp.payload(id)) from fixture where k like 'zone%';
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert((select count(*)=4 from editions where id in(select id from fixture where k like 'campaign%') and status='draft' and product_model='square_v1' and category_exclusivity and unit_price_cents=39900 and double_unit_price_cents is null),'four zones get fixed-price category-exclusive drafts');
select pg_temp.assert((select count(*)=40 from slots where edition_id in(select id from fixture where k like 'campaign%')),'exactly ten paid slots per campaign');
select pg_temp.assert((select count(*)=24 from slots where edition_id in(select id from fixture where k like 'campaign%') and side='front' and width_in=2.5 and height_in=2.5),'six front squares per campaign');
select pg_temp.reject(format('select public.admin_create_square_campaign(%L::jsonb)',pg_temp.payload((select id from fixture where k='zone1'))),'ADM04','duplicate month and zone rejected');
select pg_temp.reject(format('select public.admin_create_square_campaign(%L::jsonb)',pg_temp.payload((select id from fixture where k='zone1'))||'{"unit_price_cents":100}'),'MVP01','temporary price rejected');
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
select pg_temp.reject(format('select public.admin_create_square_campaign(%L::jsonb)',pg_temp.payload((select id from fixture where k='zone1'))),'ADM01','non-admin rejected');
select set_config('request.jwt.claim.sub',(select id::text from fixture where k='admin'),true);
select pg_temp.reject(format('update editions set status=''open'' where id=%L',(select id from fixture where k='campaign1')),'ADM04','printer gate blocks opening');
select pg_temp.reject(format('update editions set unit_price_cents=100 where id=%L',(select id from fixture where k='campaign1')),'23514','database prevents repricing');
select pg_temp.reject(format('update editions set product_model=''legacy'' where id=%L',(select id from fixture where k='campaign1')),'MVP01','model cannot downgrade');
select pg_temp.reject(format('insert into slots(edition_id,side,label,x_in,y_in,width_in,height_in) values(%L,''back'',''HOUSE'',0,0,1,1)',(select id from fixture where k='campaign1')),'MVP02','house or eleventh position cannot be sold');
select pg_temp.reject(format('delete from slots where edition_id=%L',(select id from fixture where k='campaign1')),'MVP02','inventory cannot shrink');
select pg_temp.reject(format('update slots set width_in=1 where edition_id=%L',(select id from fixture where k='campaign1')),'MVP02','square geometry cannot change');
set local role anon;
select pg_temp.assert((select count(*)=0 from editions where id in(select id from fixture where k like 'campaign%')),'drafts invisible publicly');
reset role;
-- Test-only simulated approval is visible solely inside this transaction and never committed.
insert into private.approved_layout_templates(template_key,approval_reference) values('amazingmail-9x6-ten-square-draft','TRANSACTION-ONLY TEST; rolled back; NOT printer approval');
update editions set status='open' where id in(select id from fixture where k like 'campaign%');
create function pg_temp.items() returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('edition_id',f.id,'mode','standard','slot_ids',jsonb_build_array(s.id),'token_hash',encode(extensions.gen_random_bytes(32),'hex')))
 from fixture f join slots s on s.edition_id=f.id and s.label='F1' where f.k like 'campaign%'
$$;
insert into fixture values('cart',public.hold_category_cart('plumbing',encode(extensions.gen_random_bytes(32),'hex'),pg_temp.items(),'test'));
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert((select count(*)=4 from bookings where cart_id=(select id from fixture where k='cart') and price_cents=39900 and size='standard' and category_id='plumbing'),'four-area cart reserves one $399 square per zone even in test mode');

select pg_temp.assert(not has_function_privilege('anon','public.share_square_cart_artwork(text,uuid,timestamptz,jsonb)','execute'),'anonymous clients cannot share artwork directly');
insert into booking_artwork(booking_id,storage_path,status,crop_x,crop_y,crop_width,crop_height,width_px,height_px,content_type,byte_size,zoom)
 select id,id||'/source.png','ready',20,20,800,800,1200,900,'image/png',10000,1.2 from bookings where cart_id=(select id from fixture where k='cart') order by id limit 1;
create function pg_temp.targets() returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('booking_id',id,'path',id||'/'||gen_random_uuid())) from bookings
 where cart_id=(select id from fixture where k='cart') and id<>(select booking_id from booking_artwork where booking_id in(select id from bookings where cart_id=(select id from fixture where k='cart')) order by booking_id limit 1)
$$;
select pg_temp.reject(format('select public.share_square_cart_artwork(%L,%L,%L,%L::jsonb)',repeat('0',64),a.id,a.updated_at,pg_temp.targets()),'ART01','wrong cart token cannot share artwork') from booking_artwork a where a.booking_id in(select id from bookings where cart_id=(select id from fixture where k='cart'));
select pg_temp.reject(format('select public.share_square_cart_artwork(%L,%L,%L,%L::jsonb)',c.token_hash,a.id,a.updated_at,'[]'),'ART01','missing target zones rejected atomically') from booking_artwork a join bookings b on b.id=a.booking_id join reservation_carts c on c.id=b.cart_id where c.id=(select id from fixture where k='cart');
select public.share_square_cart_artwork(c.token_hash,a.id,a.updated_at,pg_temp.targets()) from booking_artwork a join bookings b on b.id=a.booking_id join reservation_carts c on c.id=b.cart_id where c.id=(select id from fixture where k='cart');
select pg_temp.assert(private.square_cart_artwork_ready((select id from fixture where k='cart')),'one square image and crop are ready across four zones');
select pg_temp.assert((select count(distinct shared_source_id)=1 and count(*)=4 from booking_artwork a join bookings b on b.id=a.booking_id where b.cart_id=(select id from fixture where k='cart')),'four members share one logical source');
update booking_artwork set crop_x=30 where booking_id=(select id from bookings where cart_id=(select id from fixture where k='cart') order by id desc limit 1);
select pg_temp.assert(not private.square_cart_artwork_ready((select id from fixture where k='cart')),'zone-specific crop cannot pass checkout');
select pg_temp.reject(format('update bookings set status=''reserved'' where cart_id=%L',(select id from fixture where k='cart')),'ART01','confirmation refuses divergent artwork');
update booking_artwork set crop_x=20 where booking_id in(select id from bookings where cart_id=(select id from fixture where k='cart'));
update booking_artwork set crop_height=400 where id=shared_source_id and booking_id in(select id from bookings where cart_id=(select id from fixture where k='cart'));
select pg_temp.assert(not private.square_cart_artwork_ready((select id from fixture where k='cart')),'rectangular crop cannot pass checkout');
update booking_artwork set crop_height=null where id=shared_source_id and booking_id in(select id from bookings where cart_id=(select id from fixture where k='cart'));
select pg_temp.assert(not private.square_cart_artwork_ready((select id from fixture where k='cart')),'missing crop height fails closed');
rollback;
