-- Full-side products use the same exclusive live slot claims as standard/double ads.
-- Prices are per edition (one geographic area). No catalog records or layout approvals are added.
alter table public.bookings drop constraint bookings_size_check;
alter table public.bookings add constraint bookings_size_check
  check (size in ('standard', 'double', 'full_side', 'both_sides'));
alter table public.bookings add column claimed_slot_count integer;
alter table public.bookings add constraint bookings_claimed_slot_count_check check (
  (size in ('standard', 'double') and claimed_slot_count is null)
  or (size in ('full_side', 'both_sides') and claimed_slot_count > 0 and claimed_slot_count is not null)
);

create function public.hold_postcard(
  p_slot_ids uuid[], p_size text, p_token_hash text, p_pricing_mode text
)
returns table (booking_id uuid, hold_expires_at timestamptz, size text, price_cents integer)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_ids uuid[] := array(select distinct unnest(p_slot_ids) order by 1);
  v_expected uuid[];
  v_edition uuid;
  v_side text;
  v_booking uuid;
  v_expires timestamptz;
  v_price integer;
begin
  if p_size is null or p_size not in ('full_side', 'both_sides')
     or coalesce(cardinality(v_ids), 0) = 0 or cardinality(v_ids) > 256
     or cardinality(v_ids) <> cardinality(p_slot_ids) then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
  end if;
  if p_pricing_mode is null or p_pricing_mode not in ('launch', 'test') then
    raise exception using errcode = 'INS05', message = 'invalid_pricing';
  end if;
  select s.edition_id, s.side into v_edition, v_side from public.slots s where s.id = v_ids[1];
  if not found then raise exception using errcode = 'INS01', message = 'slot_not_found'; end if;

  -- Same deterministic lock order as hold_slots: competing product sizes cannot oversell.
  perform 1 from public.slots s where s.edition_id = v_edition
    and (p_size = 'both_sides' or s.side = v_side) order by s.id for update;
  select array_agg(s.id order by s.id) into v_expected from public.slots s
    where s.edition_id = v_edition and (p_size = 'both_sides' or s.side = v_side);
  if v_ids is distinct from v_expected or (p_size = 'both_sides' and
    (select count(distinct s.side) from public.slots s where s.id = any(v_ids)) <> 2) then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
  end if;
  if not private.edition_is_bookable(v_edition) then
    raise exception using errcode = 'INS02', message = 'edition_closed';
  end if;
  if exists(select 1 from public.slots s where s.id = any(v_ids) and s.blocked_at is not null) then
    raise exception using errcode = 'INS03', message = 'slot_unavailable';
  end if;
  -- Fixed approved product prices, including local tests. The browser cannot supply an amount.
  v_price := case p_size when 'full_side' then 160000 else 290000 end;
  update public.bookings b set status = 'released', updated_at = now()
    where b.status = 'pending' and b.hold_expires_at <= now() and b.id in (
      select bs.booking_id from public.booking_slots bs where bs.slot_id = any(v_ids) and bs.released_at is null
    );
  begin
    insert into public.bookings (edition_id, size, price_cents, pricing_mode, status,
      hold_token_hash, hold_expires_at, claimed_slot_count)
    values (v_edition, p_size, v_price, p_pricing_mode, 'pending', p_token_hash,
      now() + interval '15 minutes', cardinality(v_ids))
    returning id, hold_expires_at into v_booking, v_expires;
    insert into public.booking_slots (booking_id, slot_id) select v_booking, unnest(v_ids);
  exception when unique_violation then
    raise exception using errcode = 'INS03', message = 'slot_unavailable';
  end;
  return query select v_booking, v_expires, p_size, v_price;
end;
$$;
revoke execute on function public.hold_postcard(uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.hold_postcard(uuid[], text, text, text) to service_role;

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
