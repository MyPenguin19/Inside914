-- Front/back campaign prices apply to new holds. Existing agreed amounts are retained.
alter table public.editions add column back_unit_price_cents integer not null default 34900
 check (back_unit_price_cents between 1 and 99999999);
-- All active square campaigns adopt the owner-requested prices, including former $1 campaigns.
update public.editions set unit_price_cents=39900, back_unit_price_cents=34900, updated_at=now()
 where product_model='square_v1' and archived_at is null and status not in ('completed','cancelled');

-- Freeze both offered prices for each new hold. A NULL price_side identifies pre-release
-- reservations (and legacy service imports); their original agreed amount remains immutable.
alter table public.bookings add column front_price_cents integer,
 add column back_price_cents integer,
 add column price_side text check (price_side in ('front','back'));
alter table public.bookings add constraint booking_side_prices_valid check (
 price_side is null or (front_price_cents between 1 and 99999999 and front_price_cents is not null
 and back_price_cents between 1 and 99999999 and back_price_cents is not null
 and price_cents=case price_side when 'back' then back_price_cents else front_price_cents end));


CREATE OR REPLACE FUNCTION public.admin_create_square_campaign(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 perform private.require_admin();
 if coalesce((p->>'unit_price_cents')::integer,0) not between 1 and 99999999 or coalesce((p->>'back_unit_price_cents')::integer,34900) not between 1 and 99999999 or p->>'double_price_cents' is not null
  or private.square_slots(p->>'layout_template') is null then
  raise exception using errcode='MVP01',message='invalid_square_price';
 end if;
 v_id:=public.admin_create_campaign(p,private.square_slots(p->>'layout_template'));
 update public.editions set product_model='square_v1',category_exclusivity=false,back_unit_price_cents=coalesce((p->>'back_unit_price_cents')::integer,34900) where id=v_id;
 perform private.log_event('campaign.square_product','campaign',v_id::text,jsonb_build_object('price_cents',(p->>'unit_price_cents')::integer,'back_price_cents',coalesce((p->>'back_unit_price_cents')::integer,34900),'paid_positions',10));
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_update_campaign(p_id uuid, p jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before public.editions;
  v_after public.editions;
  v_has_bookings boolean;
  v_zone uuid;
begin
  perform private.require_admin();
  select * into v_before from public.editions where id = p_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if v_before.archived_at is not null or v_before.status in ('cancelled', 'completed') then
    raise exception using errcode = 'ADM04', message = 'campaign_finished';
  end if;
  v_has_bookings := exists (select 1 from public.bookings b where b.edition_id = p_id and b.status not in ('released', 'cancelled'))
                    or exists (select 1 from public.bookings b where b.edition_id = p_id and b.status in ('released', 'cancelled') and b.confirmed_at is not null);

  v_zone := case when p ? 'zone_id' then (p->>'zone_id')::uuid else v_before.zone_id end;
  if v_zone is distinct from v_before.zone_id then
    if not private.campaign_area_changeable(p_id) then
      raise exception using errcode='ADM04', message='campaign_area_locked';
    end if;
    perform 1 from public.zones where id=v_zone for key share;
    if not found then raise exception using errcode='ADM03', message='zone_not_found'; end if;
    insert into private.campaign_operations values(p_id,'change_area',txid_current(),auth.uid());
  end if;

  -- An unchanged area is sent by the edit form, including when a reservation
  -- arrived since the form loaded. A different area was already rejected above.
  if v_has_bookings
     and (p - 'name' - 'target_quantity' - 'unit_price_cents' - 'back_unit_price_cents' - 'zone_id') <> '{}'::jsonb then
    raise exception using errcode = 'ADM04', message = 'locked_by_reservations';
  end if;

  update public.editions e set
    zone_id = v_zone,
    name = coalesce(p ->> 'name', e.name),
    unit_price_cents = case when p ? 'unit_price_cents' then (p->>'unit_price_cents')::integer else e.unit_price_cents end,
    back_unit_price_cents = case when p ? 'back_unit_price_cents' then (p->>'back_unit_price_cents')::integer else e.back_unit_price_cents end,
    target_quantity = coalesce((p ->> 'target_quantity')::integer, e.target_quantity),
    issue_month = coalesce((p ->> 'issue_month')::date, e.issue_month),
    reservations_open_at = case when p ? 'reservations_open_at' then (p ->> 'reservations_open_at')::timestamptz else e.reservations_open_at end,
    artwork_deadline = coalesce((p ->> 'reservation_deadline')::timestamptz, e.artwork_deadline),
    artwork_due_at = coalesce((p ->> 'artwork_due_at')::timestamptz, e.artwork_due_at),
    mailing_window_start = coalesce((p ->> 'mailing_window_start')::date, e.mailing_window_start),
    mailing_window_end = coalesce((p ->> 'mailing_window_end')::date, e.mailing_window_end),
    mail_date = coalesce((p ->> 'mailing_window_start')::date, e.mail_date),
    updated_at = now()
  where e.id = p_id
  returning * into v_after;

  if (v_after.target_quantity is not null and v_after.target_quantity <= 0)
     or (v_after.reservations_open_at is not null and v_after.reservations_open_at >= v_after.artwork_deadline)
     or (v_after.artwork_due_at is not null and v_after.artwork_due_at < v_after.artwork_deadline)
     or (v_after.mailing_window_start is not null and v_after.artwork_due_at is not null and v_after.mailing_window_start < v_after.artwork_due_at::date)
     or extract(day from v_after.issue_month) <> 1 then
    raise exception using errcode = 'ADM03', message = 'dates_out_of_order';
  end if;

  delete from private.campaign_operations where edition_id=p_id and operation='change_area' and transaction_id=txid_current();
  perform private.log_event('campaign.updated', 'campaign', p_id::text,
    jsonb_build_object('changes', p, 'before', to_jsonb(v_before) - 'created_at', 'after', to_jsonb(v_after) - 'created_at'));
  return 'updated';
exception when unique_violation then
  raise exception using errcode = 'ADM04', message = 'campaign_exists_for_month';
end;
$function$;

CREATE OR REPLACE FUNCTION public.hold_slots(p_slot_ids uuid[], p_token_hash text, p_pricing_mode text, p_unit_price_cents integer, p_double_price_cents integer)
 RETURNS TABLE(booking_id uuid, hold_expires_at timestamp with time zone, size text, price_cents integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  v_side text;
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

  select side into v_side from public.slots where id=v_ids[1];
  select case when e.product_model='square_v1' and v_side='back' then e.back_unit_price_cents else e.unit_price_cents end, e.double_unit_price_cents, e.product_model
    into v_edition_unit, v_edition_double, v_model
  from public.editions e
  where e.id = v_edition for share;

  if v_model='square_v1' and (cardinality(v_ids)<>1 or p_unit_price_cents<>v_edition_unit or p_double_price_cents is not null) then
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
    insert into public.bookings (edition_id, size, price_cents, pricing_mode, status, hold_token_hash, hold_expires_at, price_side)
    values (v_edition, v_size, v_price, p_pricing_mode, 'pending', p_token_hash, now() + interval '15 minutes', case when v_model='square_v1' then v_side end)
    returning id, hold_expires_at into v_booking, v_expires;

    insert into public.booking_slots (booking_id, slot_id)
    select v_booking, unnest(v_ids);
  exception when unique_violation then
    raise exception using errcode = 'INS03', message = 'slot_unavailable';
  end;

  return query select v_booking, v_expires, v_size, v_price;
end;
$function$;

CREATE OR REPLACE FUNCTION public.hold_cart(p_token_hash text, p_items jsonb, p_pricing_mode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  select * into v_edition from public.editions where id=(v_item->>'edition_id')::uuid for share;
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
    case when v_edition.product_model='square_v1' then case when (select side from public.slots where id=v_ids[1])='back' then v_edition.back_unit_price_cents else v_edition.unit_price_cents end when p_pricing_mode='test' then 100 else v_edition.unit_price_cents end,
    case when v_edition.product_model='square_v1' then null when p_pricing_mode='test' then 200 else v_edition.double_unit_price_cents end);
  end if;
  update public.bookings set cart_id=v_cart where id=v_hold.booking_id;
 end loop;
 -- A shared window starts only after all selected positions have been atomically claimed.
 update public.bookings set hold_expires_at=least(now()+interval '30 minutes',
  (select min(e.artwork_deadline) from public.editions e join public.bookings b on b.edition_id=e.id where b.cart_id=v_cart))
 where cart_id=v_cart;
 return v_cart;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_square_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
declare e public.editions; expected integer;
begin
 select * into e from public.editions where id=new.edition_id for share;
 if tg_op='UPDATE' and new.edition_id<>old.edition_id and (e.product_model='square_v1' or exists(select 1 from public.editions where id=old.edition_id and product_model='square_v1')) then
  raise exception using errcode='MVP03',message='square_booking_campaign_is_fixed';
 end if;
 if e.product_model='square_v1' and (new.size<>'standard' or new.price_cents<=0 or coalesce(new.claimed_slot_count,1)<>1) then
  raise exception using errcode='MVP03',message='square_booking_requires_one_ad';
 end if;
 if tg_op='INSERT' and e.product_model='square_v1' then
  if new.price_side is not null then
   new.front_price_cents:=e.unit_price_cents;
   new.back_price_cents:=e.back_unit_price_cents;
  end if;
  expected:=case when new.price_side='back' then e.back_unit_price_cents else e.unit_price_cents end;
  if new.price_cents is distinct from expected then raise exception using errcode='INS05',message='invalid_pricing'; end if;
 end if;
 if tg_op='UPDATE' then
  if (new.front_price_cents,new.back_price_cents) is distinct from (old.front_price_cents,old.back_price_cents) then
   raise exception using errcode='INS05',message='agreed_price_is_immutable';
  end if;
  if new.price_side is distinct from old.price_side then
   -- A different tier is selectable only before any payment authorization begins.
   if old.price_side is null or new.price_side is null or old.status<>'pending' or new.status<>'pending'
    or old.hold_expires_at<=clock_timestamp() or old.confirmed_at is not null
    or exists(select 1 from public.bookings b where (b.id=old.id or (old.cart_id is not null and b.cart_id=old.cart_id))
      and (b.stripe_customer_id is not null or b.stripe_setup_intent_id is not null or b.stripe_payment_method_id is not null
       or exists(select 1 from public.payment_consents pc where pc.booking_id=b.id))) then
    raise exception using errcode='INS05',message='price_change_requires_new_hold';
   end if;
   if not exists(select 1 from public.booking_slots bs join public.slots s on s.id=bs.slot_id
    where bs.booking_id=old.id and bs.released_at is null and s.side=new.price_side) then
    raise exception using errcode='INS05',message='invalid_pricing';
   end if;
   new.price_cents:=case new.price_side when 'back' then old.back_price_cents else old.front_price_cents end;
  elsif new.price_cents is distinct from old.price_cents then
   raise exception using errcode='INS05',message='agreed_price_is_immutable';
  end if;
 end if;
 return new;
end $$;

create or replace function private.check_square_claim() returns trigger language plpgsql security definer set search_path='' as $$
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
 if b.price_side is not null and not exists(select 1 from public.booking_slots bs join public.slots s on s.id=bs.slot_id
  where bs.booking_id=v_id and bs.released_at is null and s.side=b.price_side) then
  raise exception using errcode='INS05',message='position_price_mismatch';
 end if;
 return null;
end $$;

create or replace function public.change_cart_position(
  p_cart_hash text, p_booking_id uuid, p_expected_slot uuid, p_slot_id uuid
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  b public.bookings;
  e public.editions;
  target public.slots;
  current_slot uuid;
begin
  if p_expected_slot is null or p_slot_id is null or not exists (
    select 1 from public.bookings owned join public.reservation_carts c on c.id=owned.cart_id
    where owned.id=p_booking_id and c.token_hash=p_cart_hash
  ) then raise exception using errcode='INS04', message='hold_unavailable'; end if;

  -- Match hold_slots/hold_cart's slot-first lock order. The expected slot makes
  -- concurrent edits from stale tabs fail instead of silently replacing a newer choice.
  perform 1 from public.slots where id in (p_expected_slot,p_slot_id) order by id for update;
  -- Serialize price-sensitive cart changes against checkout writes to any member.
  perform 1 from public.bookings where cart_id=(select cart_id from public.bookings where id=p_booking_id) order by id for update;
  select b0.* into b from public.bookings b0 join public.reservation_carts c on c.id=b0.cart_id
    where b0.id=p_booking_id and c.token_hash=p_cart_hash for update of b0;
  if not found or b.status<>'pending' or b.hold_expires_at is null or b.hold_expires_at<=clock_timestamp() then
    raise exception using errcode='INS04', message='hold_unavailable';
  end if;
  select * into e from public.editions where id=b.edition_id for share;
  if e.product_model<>'square_v1' or b.size<>'standard' or
     (select count(*) from public.booking_slots where booking_id=b.id and released_at is null)<>1 then
    raise exception using errcode='INS04', message='invalid_selection';
  end if;
  select slot_id into current_slot from public.booking_slots where booking_id=b.id and released_at is null;
  if current_slot is distinct from p_expected_slot then
    raise exception using errcode='INS04', message='position_changed';
  end if;
  if current_slot=p_slot_id then return 'unchanged'; end if;
  -- The existing campaign_layout_before_open trigger permits only approved
  -- layouts to enter the open state; keep that private registry's grants intact.
  if not private.edition_is_bookable(e.id) or e.artwork_deadline<=clock_timestamp() then
    raise exception using errcode='INS02', message='edition_closed';
  end if;
  select * into target from public.slots where id=p_slot_id;
  if not found or target.edition_id<>b.edition_id then
    raise exception using errcode='INS04', message='invalid_selection';
  end if;
  if target.blocked_at is not null then
    raise exception using errcode='INS03', message='slot_unavailable';
  end if;

  update public.bookings set status='released',updated_at=now()
    where status='pending' and hold_expires_at<=clock_timestamp() and id in (
      select booking_id from public.booking_slots where slot_id=p_slot_id and released_at is null
    );
  begin
    update public.booking_slots set slot_id=p_slot_id
      where booking_id=b.id and slot_id=current_slot and released_at is null;
  exception when unique_violation then
    raise exception using errcode='INS03', message='slot_unavailable';
  end;
  -- The guard calculates the new amount from this hold's immutable tier snapshots.
  -- Any failed authorization check rolls back the claim move as well.
  if b.price_side is not null and target.side<>b.price_side then
   update public.bookings set price_side=target.side where id=b.id;
  end if;
  -- Booking identity, expiry, artwork, contact and other cart members are retained.
  return 'changed';
end $$;

create or replace view public.slot_availability with (security_invoker = true) as
select
  s.id as slot_id,
  z.slug as zone_slug,
  z.name as zone_name,
  z.household_count,
  e.id as edition_id,
  e.issue_month,
  e.artwork_deadline,
  case when e.product_model='square_v1' and s.side='back' then e.back_unit_price_cents else e.unit_price_cents end as unit_price_cents,
  s.side,
  s.label,
  s.x_in,
  s.y_in,
  s.width_in,
  s.height_in,
  (b.bookable and c.claim = 'free' and s.blocked_at is null) as available,
  case
    when c.claim <> 'free' then c.claim
    when s.blocked_at is not null then 'blocked'
    when b.bookable then 'available'
    else 'closed'
  end as occupancy
from public.slots s
join public.editions e on e.id = s.edition_id
join public.zones z on z.id = e.zone_id
cross join lateral (select private.slot_claim(s.id) as claim) c
cross join lateral (select private.edition_is_bookable(e.id) as bookable) b
where e.status in ('open', 'closed');

-- Replaced functions preserve existing service/admin-only grants; no public write access.
notify pgrst,'reload schema';
