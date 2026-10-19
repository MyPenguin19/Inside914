-- Version new campaigns without repricing or rewriting historical reservations.
alter table public.editions add column product_model text not null default 'legacy'
 check (product_model in ('legacy','square_v1'));
alter table public.editions add constraint square_campaign_terms check (
 product_model <> 'square_v1' or (unit_price_cents=39900 and double_unit_price_cents is null
 and category_exclusivity and layout_template='amazingmail-9x6-ten-square-draft'));

-- Canonical PAID inventory only. Coordinates are measured from the trim origin.
-- House branding and postal regions are deliberately not bookable slots.
create function private.square_slots() returns jsonb language sql immutable set search_path='' as $$
 select jsonb_agg(jsonb_build_object('side',side,'label',label,'x',x,'y',y,'width',2.5,'height',2.5) order by side,label)
 from (values ('front','F1',0.75,0.5),('front','F2',3.25,0.5),('front','F3',5.75,0.5),
 ('front','F4',0.75,3.0),('front','F5',3.25,3.0),('front','F6',5.75,3.0),
 ('back','B1',0.125,0.5),('back','B2',2.625,0.5),('back','B3',0.125,3.0),('back','B4',2.625,3.0)) s(side,label,x,y)
$$;
revoke all on function private.square_slots() from public,anon,authenticated;

create function private.check_square_inventory() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; e public.editions; actual jsonb;
begin
 if tg_table_name='editions' then v_id:=new.id;
 else v_id:=coalesce(new.edition_id,old.edition_id); end if;
 select * into e from public.editions where id=v_id;
 if not found then return null; end if;
 if coalesce(e.layout_template='amazingmail-9x6-ten-square-draft',false) is distinct from (e.product_model='square_v1') then
  raise exception using errcode='MVP01',message='invalid_square_campaign';
 end if;
 if e.product_model='square_v1' then
  select jsonb_agg(jsonb_build_object('side',side,'label',label,'x',x_in,'y',y_in,'width',width_in,'height',height_in) order by side,label)
   into actual from public.slots where edition_id=v_id;
  if actual is distinct from private.square_slots() then
   raise exception using errcode='MVP02',message='square_inventory_requires_ten';
  end if;
 end if;
 return null;
end $$;
create constraint trigger square_inventory_edition after insert or update on public.editions
 deferrable initially deferred for each row execute function private.check_square_inventory();
create constraint trigger square_inventory_slot after insert or update or delete on public.slots
 deferrable initially deferred for each row execute function private.check_square_inventory();

-- Replace the legacy-only width limit with version-aware bounds; retain all other checks.
alter table public.slots drop constraint slots_check;
create function private.guard_square_slot() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.editions;
begin
 if tg_op='UPDATE' and (new.edition_id,new.side,new.label,new.x_in,new.y_in,new.width_in,new.height_in)
  is not distinct from (old.edition_id,old.side,old.label,old.x_in,old.y_in,old.width_in,old.height_in) then return new; end if;
 select * into e from public.editions where id=coalesce(old.edition_id,new.edition_id) for update;
 if e.product_model='square_v1' then raise exception using errcode='MVP02',message='square_inventory_is_fixed'; end if;
 if tg_op='DELETE' then return old; end if;
 select * into e from public.editions where id=new.edition_id for update;
 if e.product_model='square_v1' or
 (e.layout_template='amazingmail-9x6-ten-square-draft' and (new.x_in+new.width_in>9 or new.y_in+new.height_in>6)) or
 (e.layout_template is distinct from 'amazingmail-9x6-ten-square-draft' and new.x_in+new.width_in>6.5) then
  raise exception using errcode='MVP02',message='invalid_slot_geometry';
 end if;
 return new;
end $$;
create trigger guard_square_slot before insert or update or delete on public.slots for each row execute function private.guard_square_slot();

create function private.guard_square_campaign() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.product_model='square_v1' and (new.product_model,new.zone_id,new.layout_template) is distinct from (old.product_model,old.zone_id,old.layout_template) then
  raise exception using errcode='MVP01',message='square_campaign_is_fixed';
 end if;
 if old.product_model<>new.product_model and (old.status<>'draft' or exists(select 1 from public.bookings where edition_id=old.id)) then
  raise exception using errcode='MVP01',message='square_campaign_requires_unused_draft';
 end if;
 return new;
end $$;
create trigger guard_square_campaign before update on public.editions for each row execute function private.guard_square_campaign();

create function public.admin_create_square_campaign(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform private.require_admin();
 if (p->>'unit_price_cents')::integer is distinct from 39900 or p->>'double_price_cents' is not null
  or p->>'layout_template' is distinct from 'amazingmail-9x6-ten-square-draft' then
  raise exception using errcode='MVP01',message='square_price_is_fixed';
 end if;
 v_id:=public.admin_create_campaign(p,private.square_slots());
 update public.editions set product_model='square_v1',category_exclusivity=true where id=v_id;
 perform private.log_event('campaign.square_product','campaign',v_id::text,jsonb_build_object('price_cents',39900,'paid_positions',10));
 return v_id;
end $$;
revoke all on function public.admin_create_square_campaign(jsonb) from public,anon;
grant execute on function public.admin_create_square_campaign(jsonb) to authenticated;

create function private.guard_square_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare square boolean;
begin
 select product_model='square_v1' into square from public.editions where id=new.edition_id for share;
 if tg_op='UPDATE' and new.edition_id<>old.edition_id and (square or exists(select 1 from public.editions where id=old.edition_id and product_model='square_v1')) then
  raise exception using errcode='MVP03',message='square_booking_campaign_is_fixed';
 end if;
 if square and (new.size<>'standard' or new.price_cents<>39900 or coalesce(new.claimed_slot_count,1)<>1) then
  raise exception using errcode='MVP03',message='square_booking_requires_one_399_ad';
 end if;
 return new;
end $$;
create trigger guard_square_booking before insert or update on public.bookings for each row execute function private.guard_square_booking();

create function private.lock_square_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Serialize competing claim mutations for one booking, including direct service writes.
 perform 1 from public.bookings b join public.editions e on e.id=b.edition_id
 where b.id in (new.booking_id,old.booking_id) and e.product_model='square_v1' order by b.id for update of b;
 if tg_op='UPDATE' and new.booking_id<>old.booking_id then raise exception using errcode='MVP03',message='claim_booking_is_fixed'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger lock_square_claim before insert or update or delete on public.booking_slots for each row execute function private.lock_square_claim();
create function private.check_square_claim() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; b public.bookings; n integer;
begin
 if tg_table_name='bookings' then v_id:=new.id; else v_id:=coalesce(new.booking_id,old.booking_id); end if;
 select * into b from public.bookings where id=v_id;
 if not found or b.status in ('released','cancelled') or not exists(select 1 from public.editions where id=b.edition_id and product_model='square_v1') then return null; end if;
 select count(*) into n from public.booking_slots bs join public.slots s on s.id=bs.slot_id
 where bs.booking_id=v_id and bs.released_at is null and s.edition_id=b.edition_id;
 if n<>1 or (select count(*) from public.booking_slots where booking_id=v_id and released_at is null)<>1 then
  raise exception using errcode='MVP03',message='square_booking_requires_one_claim';
 end if;
 return null;
end $$;
create constraint trigger square_claim_booking after insert or update on public.bookings deferrable initially deferred for each row execute function private.check_square_claim();
create constraint trigger square_claim_slot after insert or update or delete on public.booking_slots deferrable initially deferred for each row execute function private.check_square_claim();
revoke all on function private.check_square_inventory(),private.guard_square_slot(),private.guard_square_campaign(),private.guard_square_booking(),private.lock_square_claim(),private.check_square_claim() from public,anon,authenticated;

create or replace function public.hold_slots(
  p_slot_ids uuid[],
  p_token_hash text,
  p_pricing_mode text,
  p_unit_price_cents integer,
  p_double_price_cents integer
)
returns table (booking_id uuid, hold_expires_at timestamptz, size text, price_cents integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids uuid[] := array(select distinct unnest(p_slot_ids) order by 1);
  v_found integer;
  v_editions integer;
  v_edition uuid;
  v_blocked integer;
  v_edition_unit integer;
  v_edition_double integer;
  v_model text;
  v_size text;
  v_price integer;
  v_booking uuid;
  v_expires timestamptz;
begin
  if coalesce(cardinality(v_ids), 0) not in (1, 2) then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
  end if;
  if p_pricing_mode is null or p_pricing_mode not in ('launch', 'test')
     or p_unit_price_cents is null or p_unit_price_cents <= 0
     or (p_double_price_cents is not null and p_double_price_cents <= 0) then
    raise exception using errcode = 'INS05', message = 'invalid_pricing';
  end if;

  perform 1 from public.slots s where s.id = any (v_ids) order by s.id for update;

  select count(*), count(distinct s.edition_id), (array_agg(s.edition_id))[1], count(*) filter (where s.blocked_at is not null)
    into v_found, v_editions, v_edition, v_blocked
  from public.slots s
  where s.id = any (v_ids);

  if v_found <> cardinality(v_ids) then
    raise exception using errcode = 'INS01', message = 'slot_not_found';
  end if;
  if v_editions <> 1 then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
  end if;
  if not private.edition_is_bookable(v_edition) then
    raise exception using errcode = 'INS02', message = 'edition_closed';
  end if;
  if v_blocked > 0 then
    raise exception using errcode = 'INS03', message = 'slot_unavailable';
  end if;

  select e.unit_price_cents, e.double_unit_price_cents, e.product_model
    into v_edition_unit, v_edition_double, v_model
  from public.editions e
  where e.id = v_edition;

  if v_model='square_v1' and (cardinality(v_ids)<>1 or p_unit_price_cents<>39900 or p_double_price_cents is not null) then
    raise exception using errcode='INS05',message='invalid_pricing';
  end if;
  if p_pricing_mode = 'launch'
     and (p_unit_price_cents <> v_edition_unit or p_double_price_cents is distinct from v_edition_double) then
    raise exception using errcode = 'INS05', message = 'invalid_pricing';
  end if;
  if v_model<>'square_v1' and p_pricing_mode = 'test'
     and (p_unit_price_cents >= v_edition_unit
          or (p_double_price_cents is not null and v_edition_double is not null and p_double_price_cents >= v_edition_double)) then
    raise exception using errcode = 'INS05', message = 'invalid_pricing';
  end if;

  if cardinality(v_ids) = 2 then
    if p_double_price_cents is null or v_edition_double is null or not exists (
      select 1 from public.slot_pairs p
      where (p.left_slot_id = v_ids[1] and p.right_slot_id = v_ids[2])
         or (p.left_slot_id = v_ids[2] and p.right_slot_id = v_ids[1])
    ) then
      raise exception using errcode = 'INS04', message = 'invalid_selection';
    end if;
    v_size := 'double';
    v_price := p_double_price_cents;
  else
    v_size := 'standard';
    v_price := p_unit_price_cents;
  end if;

  update public.bookings b
     set status = 'released', updated_at = now()
   where b.status = 'pending'
     and b.hold_expires_at <= now()
     and b.id in (
       select bs.booking_id from public.booking_slots bs
       where bs.slot_id = any (v_ids) and bs.released_at is null
     );

  begin
    insert into public.bookings (edition_id, size, price_cents, pricing_mode, status, hold_token_hash, hold_expires_at)
    values (v_edition, v_size, v_price, p_pricing_mode, 'pending', p_token_hash, now() + interval '15 minutes')
    returning id, hold_expires_at into v_booking, v_expires;

    insert into public.booking_slots (booking_id, slot_id)
    select v_booking, unnest(v_ids);
  exception when unique_violation then
    raise exception using errcode = 'INS03', message = 'slot_unavailable';
  end;

  return query select v_booking, v_expires, v_size, v_price;
end;
$$;

-- Explicit array typing also satisfies the database function linter.
create or replace function public.hold_cart(p_token_hash text, p_items jsonb, p_pricing_mode text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_cart uuid; v_item jsonb; v_ids uuid[]; v_hold record; v_zones uuid[] := array[]::uuid[]; v_zone uuid; v_edition public.editions;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 4 then
  raise exception using errcode='INS04', message='Choose one to four areas';
 end if;
 -- Lock the union in the same order as single-area holds. Any failed member rolls back ALL holds.
 perform 1 from public.slots s where s.id in (
  select slot.value::uuid from jsonb_array_elements(p_items) i, jsonb_array_elements_text(i->'slot_ids') slot
 ) order by s.id for update;
 insert into public.reservation_carts(token_hash) values(p_token_hash) returning id into v_cart;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_edition from public.editions where id=(v_item->>'edition_id')::uuid;
  v_zone := v_edition.zone_id;
  if v_zone is null or v_zone=any(v_zones) then raise exception using errcode='INS04',message='Duplicate or missing area'; end if;
  v_zones := array_append(v_zones,v_zone);
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_item->'slot_ids');
  if exists(select 1 from public.slots where id=any(v_ids) and edition_id<>v_edition.id) then
   raise exception using errcode='INS04',message='Wrong campaign';
  end if;
  if v_edition.product_model='square_v1' and (v_item->>'mode' is distinct from 'standard' or cardinality(v_ids)<>1) then
   raise exception using errcode='INS04',message='One square ad per area';
  end if;
  if v_item->>'mode' in ('full_side','both_sides') then
   select * into v_hold from public.hold_postcard(v_ids,v_item->>'mode',v_item->>'token_hash',p_pricing_mode);
  else
   if (v_item->>'mode'='standard' and cardinality(v_ids)<>1) or (v_item->>'mode'='double' and cardinality(v_ids)<>2)
      or v_item->>'mode' not in ('standard','double') then
    raise exception using errcode='INS04',message='Invalid size';
   end if;
   select * into v_hold from public.hold_slots(v_ids,v_item->>'token_hash',p_pricing_mode,
    case when v_edition.product_model='square_v1' then 39900 when p_pricing_mode='test' then 100 else v_edition.unit_price_cents end,
    case when v_edition.product_model='square_v1' then null when p_pricing_mode='test' then 200 else v_edition.double_unit_price_cents end);
  end if;
  update public.bookings set cart_id=v_cart where id=v_hold.booking_id;
 end loop;
 return v_cart;
end $$;
revoke all on function public.hold_cart(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.hold_cart(text,jsonb,text) to service_role;


notify pgrst, 'reload schema';

-- Blocked positions never reduce the ten-reservation threshold for new campaigns.
create or replace function private.edition_is_full(p_edition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists(select 1 from public.editions where id=p_edition_id and product_model='square_v1') then
   (select count(*)=10 from public.slots s where s.edition_id=p_edition_id)
   and (select count(*)=10 from public.booking_slots bs join public.bookings b on b.id=bs.booking_id
    join public.slots s on s.id=bs.slot_id and s.edition_id=b.edition_id
    where b.edition_id=p_edition_id and bs.released_at is null and b.status not in ('pending','released','cancelled')
    and b.size='standard' and b.price_cents=39900 and b.category_id is not null)
  else exists (select 1 from public.slots s where s.edition_id = p_edition_id and s.blocked_at is null)
     and not exists (
       select 1 from public.slots s
       where s.edition_id = p_edition_id and s.blocked_at is null
         and not exists (
           select 1 from public.booking_slots bs
           join public.bookings b on b.id = bs.booking_id
           where bs.slot_id = s.id and bs.released_at is null and b.status not in ('pending', 'released', 'cancelled')
         )
     ) end;
$$;
