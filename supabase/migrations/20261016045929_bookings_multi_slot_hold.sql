-- Task 6: a booking holds one standard unit or two horizontally adjacent units (double size),
-- atomically. bookings own the customer's hold and price; booking_slots claim slots.
-- Replaces Task 5's single-slot reservations table and hold_slot() (both unused; table empty).

-- Pricing lives on the edition. double_unit_price_cents null = double size not offered.
alter table public.editions
  add column unit_price_cents integer not null default 50000 check (unit_price_cents > 0),
  add column double_unit_price_cents integer check (double_unit_price_cents > 0);

drop view public.slot_availability;
alter table public.slots drop column price_cents;

drop function public.hold_slot(uuid, text);
drop function private.slot_is_taken(uuid);
drop table public.reservations;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete restrict,
  size text not null check (size in ('standard', 'double')),
  price_cents integer not null check (price_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'reserved', 'submitted', 'approved', 'rejected',
                      'charge_failed', 'charged', 'released', 'cancelled')),
  -- SHA-256 (hex) of the random hold token; the token itself is never stored.
  hold_token_hash text not null unique check (hold_token_hash ~ '^[0-9a-f]{64}$'),
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'pending' or hold_expires_at is not null)
);

create index bookings_edition_id_idx on public.bookings (edition_id);

create table public.booking_slots (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  slot_id uuid not null references public.slots (id) on delete restrict,
  released_at timestamptz,
  primary key (booking_id, slot_id)
);

create index booking_slots_slot_id_idx on public.booking_slots (slot_id);
-- At most one live claim per slot, whatever code path writes it.
create unique index booking_slots_one_active_claim on public.booking_slots (slot_id)
  where released_at is null;

-- A released or cancelled booking frees its slots in the same transaction.
create function private.release_booking_slots()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.booking_slots
     set released_at = now()
   where booking_id = new.id and released_at is null;
  return new;
end;
$$;

create trigger bookings_release_slots
  after update of status on public.bookings
  for each row
  when (new.status in ('released', 'cancelled') and old.status is distinct from new.status)
  execute function private.release_booking_slots();

alter table public.bookings enable row level security;
alter table public.booking_slots enable row level security;

create policy "admins manage bookings" on public.bookings
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins manage booking slots" on public.booking_slots
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.bookings, public.booking_slots from anon;

-- Occupied = a live claim whose booking is not an expired pending hold.
create function private.slot_is_taken(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.booking_slots bs
    join public.bookings b on b.id = bs.booking_id
    where bs.slot_id = p_slot_id
      and bs.released_at is null
      and not (b.status = 'pending' and b.hold_expires_at <= now())
  );
$$;

revoke execute on function private.slot_is_taken(uuid) from public;
grant usage on schema private to service_role;
grant execute on function private.slot_is_taken(uuid) to anon, authenticated, service_role;

create view public.slot_availability with (security_invoker = true) as
select
  s.id as slot_id,
  z.slug as zone_slug,
  z.name as zone_name,
  z.household_count,
  e.id as edition_id,
  e.issue_month,
  e.artwork_deadline,
  e.unit_price_cents,
  s.side,
  s.label,
  s.x_in,
  s.y_in,
  s.width_in,
  s.height_in,
  (e.status = 'open' and now() < e.artwork_deadline and not private.slot_is_taken(s.id)) as available
from public.slots s
join public.editions e on e.id = s.edition_id
join public.zones z on z.id = e.zone_id
where e.status in ('open', 'closed');

-- The only definition of "double-size compatible": same edition, side, row, height and width,
-- with the right unit starting exactly where the left one ends. Used by the UI and by hold_slots().
create view public.slot_pairs with (security_invoker = true) as
select
  l.slot_id as left_slot_id,
  r.slot_id as right_slot_id,
  l.edition_id,
  l.side,
  e.double_unit_price_cents,
  (l.available and r.available) as available
from public.slot_availability l
join public.slot_availability r
  on r.edition_id = l.edition_id
 and r.side = l.side
 and r.y_in = l.y_in
 and r.height_in = l.height_in
 and r.width_in = l.width_in
 and r.x_in = l.x_in + l.width_in
join public.editions e on e.id = l.edition_id
where e.double_unit_price_cents is not null;

grant select on public.slot_availability, public.slot_pairs to anon, authenticated;

-- Holds 1 slot (standard) or 2 compatible slots (double) for 15 minutes, all or nothing.
-- Errors: INS01 slot_not_found, INS02 edition_closed, INS03 slot_unavailable, INS04 invalid_selection.
create function public.hold_slots(p_slot_ids uuid[], p_token_hash text)
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
  v_size text;
  v_price integer;
  v_booking uuid;
  v_expires timestamptz;
begin
  if coalesce(cardinality(v_ids), 0) not in (1, 2) then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
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

  select e.status = 'open' and now() < e.artwork_deadline,
         case when cardinality(v_ids) = 1 then e.unit_price_cents else e.double_unit_price_cents end
    into v_bookable, v_price
  from public.editions e
  where e.id = v_edition;

  if not v_bookable then
    raise exception using errcode = 'INS02', message = 'edition_closed';
  end if;

  if cardinality(v_ids) = 2 then
    if v_price is null or not exists (
      select 1 from public.slot_pairs p
      where (p.left_slot_id = v_ids[1] and p.right_slot_id = v_ids[2])
         or (p.left_slot_id = v_ids[2] and p.right_slot_id = v_ids[1])
    ) then
      raise exception using errcode = 'INS04', message = 'invalid_selection';
    end if;
    v_size := 'double';
  else
    v_size := 'standard';
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
    insert into public.bookings (edition_id, size, price_cents, status, hold_token_hash, hold_expires_at)
    values (v_edition, v_size, v_price, 'pending', p_token_hash, now() + interval '15 minutes')
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

revoke execute on function public.hold_slots(uuid[], text) from public, anon, authenticated;
grant execute on function public.hold_slots(uuid[], text) to service_role;
