-- Task 12: (1) tell "held" (someone is mid-checkout) apart from "reserved" on the public postcard,
-- without exposing whose booking it is; (2) rate-limit hold attempts per visitor.
-- Booking status semantics are unchanged: "taken" still means a live claim whose booking is not
-- an expired pending hold, exactly as private.slot_is_taken() defines it.

-- 'free' | 'held' | 'reserved'. Security definer so anon learns only the state, never the booking.
create function private.slot_claim(p_slot_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when b.status = 'pending' then 'held' else 'reserved' end
    from public.booking_slots bs
    join public.bookings b on b.id = bs.booking_id
    where bs.slot_id = p_slot_id
      and bs.released_at is null
      and not (b.status = 'pending' and b.hold_expires_at <= now())
    limit 1
  ), 'free');
$$;

revoke execute on function private.slot_claim(uuid) from public;
grant execute on function private.slot_claim(uuid) to anon, authenticated, service_role;

-- Same columns as before (slot_pairs depends on them), plus "occupancy" at the end:
-- 'available' | 'held' | 'reserved' | 'closed' (edition not open, or past its deadline).
create or replace view public.slot_availability with (security_invoker = true) as
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
  (e.status = 'open' and now() < e.artwork_deadline and c.claim = 'free') as available,
  case
    when c.claim <> 'free' then c.claim
    when e.status = 'open' and now() < e.artwork_deadline then 'available'
    else 'closed'
  end as occupancy
from public.slots s
join public.editions e on e.id = s.edition_id
join public.zones z on z.id = e.zone_id
cross join lateral (select private.slot_claim(s.id) as claim) c
where e.status in ('open', 'closed');

grant select on public.slot_availability to anon, authenticated;

-- Hold attempts per visitor (an HMAC of the client address, never the address itself).
-- Private schema + RLS with no policies: unreachable through the API.
create table private.hold_attempts (
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now()
);

create index hold_attempts_visitor_idx on private.hold_attempts (visitor_hash, attempted_at);
create index hold_attempts_attempted_at_idx on private.hold_attempts (attempted_at);
alter table private.hold_attempts enable row level security;
revoke all on private.hold_attempts from public, anon, authenticated;

-- Records one attempt and returns true while the visitor is under p_max attempts per window.
-- Old rows (over a day) are pruned as it goes.
create function public.note_hold_attempt(p_visitor_hash text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$'
     or p_max is null or p_max < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_input';
  end if;

  -- One visitor's parallel requests queue here, so they can't all slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_hash, 0));

  delete from private.hold_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_recent
  from private.hold_attempts
  where visitor_hash = p_visitor_hash
    and attempted_at > now() - make_interval(secs => p_window_seconds);

  if v_recent >= p_max then
    return false;
  end if;

  insert into private.hold_attempts (visitor_hash) values (p_visitor_hash);
  return true;
end;
$$;

revoke execute on function public.note_hold_attempt(text, integer, integer) from public, anon, authenticated;
grant execute on function public.note_hold_attempt(text, integer, integer) to service_role;
