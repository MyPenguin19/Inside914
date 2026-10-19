-- Private reservation groups. Existing bookings remain the per-area source of truth.
create table public.reservation_carts (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 created_at timestamptz not null default now()
);
alter table public.reservation_carts enable row level security;
revoke all on public.reservation_carts from anon, authenticated;
grant all on public.reservation_carts to service_role;
alter table public.bookings add column cart_id uuid references public.reservation_carts(id);
create index bookings_cart_id_idx on public.bookings(cart_id) where cart_id is not null;

create function public.hold_cart(p_token_hash text, p_items jsonb, p_pricing_mode text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_cart uuid; v_item jsonb; v_ids uuid[]; v_hold record; v_zones uuid[] := '{}'; v_zone uuid; v_edition public.editions;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 4 then
  raise exception using errcode='INS04', message='Choose one to four areas';
 end if;
 -- Lock the union in the same order as single-area holds. Any failed member rolls back ALL holds.
 perform 1 from public.slots s where s.id in (
  select value::uuid from jsonb_array_elements(p_items) i, jsonb_array_elements_text(i->'slot_ids')
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
  if v_item->>'mode' in ('full_side','both_sides') then
   select * into v_hold from public.hold_postcard(v_ids,v_item->>'mode',v_item->>'token_hash',p_pricing_mode);
  else
   if (v_item->>'mode'='standard' and cardinality(v_ids)<>1) or (v_item->>'mode'='double' and cardinality(v_ids)<>2)
      or v_item->>'mode' not in ('standard','double') then
    raise exception using errcode='INS04',message='Invalid size';
   end if;
   select * into v_hold from public.hold_slots(v_ids,v_item->>'token_hash',p_pricing_mode,
    case when p_pricing_mode='test' then 100 else v_edition.unit_price_cents end,
    case when p_pricing_mode='test' then 200 else v_edition.double_unit_price_cents end);
  end if;
  update public.bookings set cart_id=v_cart where id=v_hold.booking_id;
 end loop;
 return v_cart;
end $$;
revoke all on function public.hold_cart(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.hold_cart(text,jsonb,text) to service_role;

create function public.confirm_cart(p_cart_id uuid, p_setup_intent_id text, p_payment_method_id text, p_references jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare b public.bookings; leader public.bookings;
begin
 perform 1 from public.reservation_carts where id=p_cart_id for update;
 if not found then return 'not_pending'; end if;
 perform 1 from public.bookings where cart_id=p_cart_id order by id for update;
 select * into leader from public.bookings where cart_id=p_cart_id and stripe_setup_intent_id=p_setup_intent_id;
 if not found then return 'wrong_setup_intent'; end if;
 if not exists(select 1 from public.bookings where cart_id=p_cart_id and status<>'reserved') then return 'already_confirmed'; end if;
 for b in select * from public.bookings where cart_id=p_cart_id loop
  if b.status<>'pending' then return 'not_pending'; end if;
  if b.hold_expires_at is null or b.hold_expires_at<=now() then return 'hold_expired'; end if;
  if not private.edition_is_bookable(b.edition_id) then return 'edition_closed'; end if;
  if (select count(*) from public.booking_slots where booking_id=b.id and released_at is null)<>
     coalesce(b.claimed_slot_count,case b.size when 'double' then 2 else 1 end) then return 'inventory_lost'; end if;
  if not exists(select 1 from public.booking_artwork where booking_id=b.id and status='ready' and crop_width is not null) then return 'artwork_missing'; end if;
  if not exists(select 1 from public.booking_contacts where booking_id=b.id) then return 'contact_missing'; end if;
  if not exists(select 1 from public.payment_consents where booking_id=b.id and stripe_setup_intent_id=p_setup_intent_id
   and amount_cents=b.price_cents and pricing_mode=b.pricing_mode and currency='usd') then return 'consent_missing'; end if;
  if nullif(p_references->>b.id::text,'') is null then raise exception 'Missing reference'; end if;
 end loop;
 update public.bookings set status='reserved',stripe_customer_id=leader.stripe_customer_id,
  stripe_payment_method_id=p_payment_method_id,reference=p_references->>id::text,confirmed_at=now(),hold_expires_at=null,updated_at=now()
 where cart_id=p_cart_id;
 insert into public.email_outbox(booking_id,kind) select id,'reservation_confirmed' from public.bookings where cart_id=p_cart_id
 on conflict(booking_id,kind) do nothing;
 return 'confirmed';
end $$;
revoke all on function public.confirm_cart(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_cart(uuid,text,text,jsonb) to service_role;

create or replace function public.confirm_booking(
  p_booking_id uuid,
  p_setup_intent_id text,
  p_payment_method_id text,
  p_reference text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_live_slots integer;
  v_open boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    return 'not_pending';
  end if;
  if v_booking.cart_id is not null then return 'not_pending'; end if;
  if v_booking.status = 'reserved' and v_booking.stripe_setup_intent_id = p_setup_intent_id then
    return 'already_confirmed';
  end if;
  if v_booking.status <> 'pending' then
    return 'not_pending';
  end if;
  if v_booking.stripe_setup_intent_id is distinct from p_setup_intent_id then
    return 'wrong_setup_intent';
  end if;
  if v_booking.hold_expires_at <= now() then
    update public.bookings set status = 'released', updated_at = now() where id = p_booking_id;
    return 'hold_expired';
  end if;

  select count(*) into v_live_slots
  from public.booking_slots where booking_id = p_booking_id and released_at is null;
  if v_live_slots <> coalesce(v_booking.claimed_slot_count, case v_booking.size when 'double' then 2 else 1 end) then
    return 'inventory_lost';
  end if;

  select e.status = 'open' and now() < e.artwork_deadline into v_open
  from public.editions e where e.id = v_booking.edition_id;
  if not v_open then
    return 'edition_closed';
  end if;

  if not exists (
    select 1 from public.booking_artwork a
    where a.booking_id = p_booking_id and a.status = 'ready' and a.crop_width is not null
  ) then
    return 'artwork_missing';
  end if;
  if not exists (select 1 from public.booking_contacts c where c.booking_id = p_booking_id) then
    return 'contact_missing';
  end if;
  if not exists (
    select 1 from public.payment_consents pc
    where pc.booking_id = p_booking_id
      and pc.stripe_setup_intent_id = p_setup_intent_id
      and pc.amount_cents = v_booking.price_cents
  ) then
    return 'consent_missing';
  end if;

  update public.bookings
     set status = 'reserved',
         stripe_payment_method_id = p_payment_method_id,
         reference = p_reference,
         confirmed_at = now(),
         hold_expires_at = null,
         updated_at = now()
   where id = p_booking_id;

  insert into public.email_outbox (booking_id, kind) values (p_booking_id, 'reservation_confirmed')
  on conflict (booking_id, kind) do nothing;

  return 'confirmed';
end;
$$;

revoke execute on function public.confirm_booking(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_booking(uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
