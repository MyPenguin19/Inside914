-- V2 is additive. Existing editions, slot IDs, artwork and reservations are untouched.
-- The business model remains square_v1; layout_template is the immutable physical version.
-- Preserve security-invoker catalog definitions while widening exact coordinate precision.
create temporary table layout_v2_saved_views on commit drop as
 select c.relname,pg_get_viewdef(c.oid,true) definition from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in('slot_availability','slot_pairs');
drop view public.slot_pairs;
drop view public.slot_availability;
alter table public.slots
 alter column x_in type numeric(8,6), alter column y_in type numeric(8,6),
 alter column width_in type numeric(8,6), alter column height_in type numeric(8,6);
do $$declare v record; begin
 for v in select * from layout_v2_saved_views order by case relname when 'slot_availability' then 0 else 1 end loop
  execute format('create view public.%I with (security_invoker=true) as %s',v.relname,v.definition);
  execute format('revoke all on public.%I from public,anon,authenticated',v.relname);
  execute format('grant select on public.%I to anon,authenticated,service_role',v.relname);
 end loop;
end $$;

-- Canonical payload generated from src/lib/print/layout-v2.json, verified by drift tests.
create table private.postcard_layout_versions (
 template_key text primary key, geometry jsonb not null,
 check (template_key=geometry->>'key'), check(jsonb_array_length(geometry->'paidSlots')=10)
);
alter table private.postcard_layout_versions enable row level security;
revoke all on private.postcard_layout_versions from public,anon,authenticated,service_role;


insert into private.postcard_layout_versions values ('amazingmail-9x6-v2', $layout${"key":"amazingmail-9x6-v2","version":2,"approved":true,"coordinateSystem":"file-top-left","file":{"x":0,"y":0,"width":9.125,"height":6.125},"trim":{"x":0.0625,"y":0.0625,"width":9,"height":6},"live":{"x":0.1875,"y":0.1875,"width":8.75,"height":5.75},"postal":{"side":"back","x":5.2,"y":2.795,"width":3.925,"height":3.33},"housePanel":{"side":"back","x":5.2,"y":0.1875,"width":3.7375,"height":2.4825},"paidSlots":[{"side":"front","label":"F1","x":0.2725,"y":0.2225,"width":2.78,"height":2.78},{"side":"front","label":"F2","x":3.1725,"y":0.2225,"width":2.78,"height":2.78},{"side":"front","label":"F3","x":6.0725,"y":0.2225,"width":2.78,"height":2.78},{"side":"front","label":"F4","x":0.2725,"y":3.1225,"width":2.78,"height":2.78},{"side":"front","label":"F5","x":3.1725,"y":3.1225,"width":2.78,"height":2.78},{"side":"front","label":"F6","x":6.0725,"y":3.1225,"width":2.78,"height":2.78},{"side":"back","label":"B1","x":0.1875,"y":0.1875,"width":2.2925,"height":2.815},{"side":"back","label":"B2","x":2.6,"y":0.1875,"width":2.2925,"height":2.815},{"side":"back","label":"B3","x":0.1875,"y":3.1225,"width":2.2925,"height":2.815},{"side":"back","label":"B4","x":2.6,"y":3.1225,"width":2.2925,"height":2.815}],"imageFit":"contain","exportDpi":800}$layout$::jsonb);



insert into private.approved_layout_templates(template_key,approval_reference) values (
 'amazingmail-9x6-v2', 'Owner-requested V2 reservation geometry: Xpressdocs/AmazingMail 566132, landscape 9x6 trim / 9.125x6.125 file. F1-F6 2.78 square, B1-B4 2.2925x2.815 portrait. Postal 3.925x3.33 at file (5.2,2.795) preserved. House 3.7375x2.4825 at (5.2,0.1875), 0.125 postal gap. Source /1/ is back; /2/ is front. Reservation geometry only: printer, final artwork/proof and mailing-product approval remain required; no EDDM claim.');

create function private.square_slots(p_key text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p_key='amazingmail-9x6-ten-square-draft' then private.square_slots()
 else (select jsonb_agg(jsonb_build_object('side',s->>'side','label',s->>'label',
 'x',(s->>'x')::numeric-(geometry->'trim'->>'x')::numeric,
 'y',(s->>'y')::numeric-(geometry->'trim'->>'y')::numeric,
 'width',(s->>'width')::numeric,'height',(s->>'height')::numeric) order by s->>'side',s->>'label')
 from private.postcard_layout_versions cross join lateral jsonb_array_elements(geometry->'paidSlots') s
 where template_key=p_key) end
$$;
revoke all on function private.square_slots(text) from public,anon,authenticated,service_role;

alter table public.editions drop constraint square_campaign_terms;
alter table public.editions add constraint square_campaign_terms check (
 product_model<>'square_v1' or (unit_price_cents=39900 and double_unit_price_cents is null
 and not category_exclusivity and layout_template in ('amazingmail-9x6-ten-square-draft','amazingmail-9x6-v2')));


create or replace function private.check_square_inventory() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; e public.editions; actual jsonb;
begin
 if tg_table_name='editions' then v_id:=new.id;
 else v_id:=coalesce(new.edition_id,old.edition_id); end if;
 select * into e from public.editions where id=v_id;
 if not found then return null; end if;
 if coalesce(private.square_slots(e.layout_template) is not null,false) is distinct from (e.product_model='square_v1') then
  raise exception using errcode='MVP01',message='invalid_square_campaign';
 end if;
 if e.product_model='square_v1' then
  select jsonb_agg(jsonb_build_object('side',side,'label',label,'x',x_in,'y',y_in,'width',width_in,'height',height_in) order by side,label)
   into actual from public.slots where edition_id=v_id;
  if actual is distinct from private.square_slots(e.layout_template) then
   raise exception using errcode='MVP02',message='square_inventory_requires_ten';
  end if;
 end if;
 return null;
end $$;

create or replace function private.guard_square_slot() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.editions;
begin
 if tg_op='UPDATE' and (new.edition_id,new.side,new.label,new.x_in,new.y_in,new.width_in,new.height_in)
  is not distinct from (old.edition_id,old.side,old.label,old.x_in,old.y_in,old.width_in,old.height_in) then return new; end if;
 select * into e from public.editions where id=coalesce(old.edition_id,new.edition_id) for update;
 if e.product_model='square_v1' then raise exception using errcode='MVP02',message='square_inventory_is_fixed'; end if;
 if tg_op='DELETE' then return old; end if;
 select * into e from public.editions where id=new.edition_id for update;
 if e.product_model='square_v1' or
 (private.square_slots(e.layout_template) is not null and (new.x_in+new.width_in>9 or new.y_in+new.height_in>6)) or
 (private.square_slots(e.layout_template) is null and new.x_in+new.width_in>6.5) then
  raise exception using errcode='MVP02',message='invalid_slot_geometry';
 end if;
 return new;
end $$;

create or replace function public.admin_create_square_campaign(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform private.require_admin();
 if (p->>'unit_price_cents')::integer is distinct from 39900 or p->>'double_price_cents' is not null
  or private.square_slots(p->>'layout_template') is null then
  raise exception using errcode='MVP01',message='square_price_is_fixed';
 end if;
 v_id:=public.admin_create_campaign(p,private.square_slots(p->>'layout_template'));
 update public.editions set product_model='square_v1',category_exclusivity=false where id=v_id;
 perform private.log_event('campaign.square_product','campaign',v_id::text,jsonb_build_object('price_cents',39900,'paid_positions',10));
 return v_id;
end $$;


-- Stored source crops may be square, portrait or landscape in V2. Always contain,
-- never stretch or silently crop; historical V1 retains its square validation.
create function private.artwork_crop_valid(a public.booking_artwork) returns boolean
 language sql stable security definer set search_path='' as $$
 select coalesce(a.status='ready' and a.crop_x>=0 and a.crop_y>=0 and a.crop_width>0 and a.crop_height>0
 and a.zoom is not null and a.width_px>0 and a.height_px>0
 and a.crop_x+a.crop_width<=a.width_px and a.crop_y+a.crop_height<=a.height_px
 and (abs(a.crop_width-a.crop_height)<=1 or exists(select 1 from public.bookings b join public.editions e on e.id=b.edition_id
 where b.id=a.booking_id and e.layout_template='amazingmail-9x6-v2')),false)
$$;
create function private.artwork_print_resolution(a public.booking_artwork) returns boolean
 language sql stable security definer set search_path='' as $$
 select private.artwork_crop_valid(a) and exists(select 1 from public.booking_slots bs join public.slots s on s.id=bs.slot_id
 where bs.booking_id=a.booking_id and bs.released_at is null
 and greatest(a.crop_width/s.width_in,a.crop_height/s.height_in)>=300)
$$;
revoke all on function private.artwork_crop_valid(public.booking_artwork),private.artwork_print_resolution(public.booking_artwork) from public,anon,authenticated,service_role;


create or replace function private.square_cart_artwork_ready(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookings where cart_id=c)
 and not exists(
 select 1 from public.bookings b left join public.booking_artwork a on a.booking_id=b.id
 where b.cart_id=c and (a.id is null or not private.artwork_crop_valid(a)))
$$;

create or replace function private.check_zone_collection_before_house(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.editions; n integer;
begin
 select * into e from public.editions where id=p_id for update;
 if not found or e.product_model<>'square_v1' or e.status<>'closed' or e.reservations_paused_at is not null then raise exception 'zone_must_be_closed'; end if;
 if not exists(select 1 from private.approved_layout_templates where template_key=e.layout_template) then raise exception 'printer_layout_not_approved'; end if;
 if e.mailing_window_start is null or e.mailing_window_end is null or e.mailing_window_end<e.mailing_window_start then raise exception 'mailing_window_required'; end if;
 if not exists(select 1 from public.mailing_evidence where edition_id=p_id and kind='final_proof' and published_at is not null and storage_path is not null) then raise exception 'approved_final_proof_required'; end if;
 perform 1 from public.bookings where edition_id=p_id order by id for update;
 perform 1 from public.slots where edition_id=p_id order by id for update;
 perform 1 from public.booking_artwork where booking_id in(select id from public.bookings where edition_id=p_id) for update;
 select count(*) into n from public.slots where edition_id=p_id and blocked_at is null;
 if n<>10 then raise exception 'ten_positions_required'; end if;
 select count(*) into n from public.bookings where edition_id=p_id and status not in ('pending','released','cancelled');
 if n<>10 then raise exception 'ten_confirmed_required'; end if;
 if exists(select 1 from public.bookings b left join public.booking_artwork a on a.booking_id=b.id
 where b.edition_id=p_id and b.status not in ('pending','released','cancelled') and (
 b.status<>'reserved' or b.confirmed_at is null or b.size<>'standard' or b.price_cents<>39900 or b.flagged_at is not null
 or b.stripe_customer_id is null or b.stripe_payment_method_id is null or b.stripe_setup_status in ('failed','canceled')
 or b.stripe_customer_id like 'cus_devtest_%' or b.stripe_payment_method_id like 'pm_devtest_%'
 or (select count(*) from public.booking_slots bs join public.slots s on s.id=bs.slot_id where bs.booking_id=b.id and bs.released_at is null and s.edition_id=p_id and s.blocked_at is null)<>1
 or a.id is null or a.status<>'ready' or a.review_status<>'approved' or not private.artwork_crop_valid(a)
 or not exists(select 1 from public.payment_consents c where c.booking_id=b.id and c.amount_cents=39900 and c.currency='usd' and c.terms_version='square-zones-v1')
 )) then raise exception 'reservation_not_ready'; end if;
 if (select count(distinct bs.slot_id) from public.booking_slots bs join public.bookings b on b.id=bs.booking_id where b.edition_id=p_id and b.status='reserved' and bs.released_at is null)<>10 then raise exception 'inventory_conflict'; end if;
end $$;

create or replace function private.check_zone_collection(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.check_zone_collection_before_house(p_id);
 if not exists(select 1 from public.house_artwork) then raise exception 'house_artwork_required'; end if;
 if not private.current_square_proof(p_id) then raise exception 'current_final_proof_required'; end if;
 if exists(select 1 from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=p_id and b.status='reserved'
 and not private.artwork_print_resolution(a)) then raise exception 'print_resolution_required'; end if;
end $$;

create or replace function private.square_mail_ready(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.editions e join private.approved_layout_templates t on t.template_key=e.layout_template
 where e.id=p_id and e.product_model='square_v1' and e.status in('approved_to_print','printed','mailed','completed')
 and e.reservations_paused_at is null and e.mailing_window_start is not null and e.mailing_window_end>=e.mailing_window_start)
 and (select count(*)=10 from public.slots where edition_id=p_id and blocked_at is null)
 and (select count(*)=10 from public.bookings where edition_id=p_id and status not in('pending','released','cancelled'))
 and (select count(distinct bs.slot_id)=10 from public.bookings b join public.booking_slots bs on bs.booking_id=b.id and bs.released_at is null
 join public.slots s on s.id=bs.slot_id and s.edition_id=p_id and s.blocked_at is null
 join public.booking_artwork a on a.booking_id=b.id
 join public.zone_charges c on c.booking_id=b.id and c.edition_id=p_id
 where b.edition_id=p_id and b.status='charged' and b.price_cents=39900 and b.size='standard' and b.flagged_at is null
 and c.status='succeeded' and c.amount_cents=39900 and c.payment_intent_id is not null
 and a.status='ready' and a.review_status='approved' and private.artwork_print_resolution(a)
 and exists(select 1 from public.payment_consents pc where pc.id=c.consent_id and pc.booking_id=b.id and pc.amount_cents=39900 and pc.currency='usd' and pc.terms_version='square-zones-v1'))
 and private.current_square_proof(p_id)
$$;

notify pgrst,'reload schema';
