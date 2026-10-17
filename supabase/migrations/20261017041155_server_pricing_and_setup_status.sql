-- Task 13: (1) the hold price comes from the server's explicit pricing configuration (TEST $1/$2
-- or LAUNCH), passed to hold_slots() by the service role, and every booking records which pricing
-- applied next to the price it stores; (2) bookings record the SetupIntent status Stripe reports.
-- Existing bookings keep their prices; they are marked 'launch' (they were priced from the edition).

alter table public.bookings
  add column pricing_mode text not null default 'launch' check (pricing_mode in ('launch', 'test')),
  add column stripe_setup_status text
    check (stripe_setup_status in ('succeeded', 'failed', 'canceled')),
  add column stripe_setup_status_at timestamptz;

-- No unpriced path remains: the old two-argument version is removed.
drop function public.hold_slots(uuid[], text);

-- Holds 1 slot (standard) or 2 compatible slots (double) for 15 minutes, all or nothing, at the
-- price the server passes. Guards: 'launch' must equal the edition's prices; 'test' must be lower
-- than them (a test price can never exceed what the edition charges).
-- Errors: INS01 slot_not_found, INS02 edition_closed, INS03 slot_unavailable,
--         INS04 invalid_selection, INS05 invalid_pricing.
create function public.hold_slots(
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
  v_bookable boolean;
  v_edition_unit integer;
  v_edition_double integer;
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

  -- Lock the requested slots in id order, so overlapping concurrent requests queue instead of deadlocking.
  perform 1 from public.slots s where s.id = any (v_ids) order by s.id for update;

  select count(*), count(distinct s.edition_id), (array_agg(s.edition_id))[1]
    into v_found, v_editions, v_edition
  from public.slots s
  where s.id = any (v_ids);

  if v_found <> cardinality(v_ids) then
    raise exception using errcode = 'INS01', message = 'slot_not_found';
  end if;
  if v_editions <> 1 then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
  end if;

  select e.status = 'open' and now() < e.artwork_deadline, e.unit_price_cents, e.double_unit_price_cents
    into v_bookable, v_edition_unit, v_edition_double
  from public.editions e
  where e.id = v_edition;

  if not v_bookable then
    raise exception using errcode = 'INS02', message = 'edition_closed';
  end if;

  if p_pricing_mode = 'launch'
     and (p_unit_price_cents <> v_edition_unit or p_double_price_cents is distinct from v_edition_double) then
    raise exception using errcode = 'INS05', message = 'invalid_pricing';
  end if;
  if p_pricing_mode = 'test'
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

  -- Expired pending holds on these slots are released here (the trigger frees their claims).
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
    -- Both inserts roll back together: no partial double holds.
    raise exception using errcode = 'INS03', message = 'slot_unavailable';
  end;

  return query select v_booking, v_expires, v_size, v_price;
end;
$$;

revoke execute on function public.hold_slots(uuid[], text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hold_slots(uuid[], text, text, integer, integer) to service_role;
