-- Task 5: reservations and a 15-minute slot hold that can never double-book.
-- Two layers: hold_slot() locks the slot row so concurrent holds run one at a time, and a
-- unique partial index guarantees at most one active reservation per slot regardless.

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots (id) on delete restrict,
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

-- Active = still occupies the slot. 'rejected' keeps the slot so the advertiser can resubmit once.
create unique index reservations_one_active_per_slot on public.reservations (slot_id)
  where status in ('pending', 'reserved', 'submitted', 'approved', 'rejected', 'charge_failed', 'charged');

alter table public.reservations enable row level security;

create policy "admins manage reservations" on public.reservations
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.reservations from anon;

-- Is a slot occupied? Expired pending holds don't count. Security definer so the public
-- catalog can show availability without anon reading reservations; lives in the unexposed
-- private schema, so it is not callable over the REST API.
create function private.slot_is_taken(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reservations r
    where r.slot_id = p_slot_id
      and r.status in ('pending', 'reserved', 'submitted', 'approved', 'rejected', 'charge_failed', 'charged')
      and not (r.status = 'pending' and r.hold_expires_at <= now())
  );
$$;

grant usage on schema private to anon;
revoke execute on function private.slot_is_taken(uuid) from public;
grant execute on function private.slot_is_taken(uuid) to anon, authenticated;

-- Places a 15-minute hold. Called only by the server (secret key) after input validation.
-- Errors: INS01 slot_not_found, INS02 edition_closed, INS03 slot_unavailable.
create function public.hold_slot(p_slot_id uuid, p_token_hash text)
returns table (reservation_id uuid, hold_expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bookable boolean;
begin
  -- Row lock serializes concurrent holds on the same slot.
  select e.status = 'open' and now() < e.artwork_deadline
    into v_bookable
  from public.slots s
  join public.editions e on e.id = s.edition_id
  where s.id = p_slot_id
  for update of s;

  if not found then
    raise exception using errcode = 'INS01', message = 'slot_not_found';
  end if;
  if not v_bookable then
    raise exception using errcode = 'INS02', message = 'edition_closed';
  end if;

  update public.reservations r
     set status = 'released', updated_at = now()
   where r.slot_id = p_slot_id and r.status = 'pending' and r.hold_expires_at <= now();

  begin
    return query
      insert into public.reservations as r (slot_id, status, hold_token_hash, hold_expires_at)
      values (p_slot_id, 'pending', p_token_hash, now() + interval '15 minutes')
      returning r.id, r.hold_expires_at;
  exception when unique_violation then
    raise exception using errcode = 'INS03', message = 'slot_unavailable';
  end;
end;
$$;

revoke execute on function public.hold_slot(uuid, text) from public, anon, authenticated;
grant execute on function public.hold_slot(uuid, text) to service_role;

-- Availability now also accounts for active reservations. Same columns as before.
create or replace view public.slot_availability with (security_invoker = true) as
select
  s.id as slot_id,
  z.slug as zone_slug,
  z.name as zone_name,
  e.id as edition_id,
  e.issue_month,
  e.artwork_deadline,
  s.side,
  s.label,
  s.x_in,
  s.y_in,
  s.width_in,
  s.height_in,
  s.price_cents,
  (e.status = 'open' and now() < e.artwork_deadline and not private.slot_is_taken(s.id)) as available
from public.slots s
join public.editions e on e.id = s.edition_id
join public.zones z on z.id = e.zone_id
where e.status in ('open', 'closed');
