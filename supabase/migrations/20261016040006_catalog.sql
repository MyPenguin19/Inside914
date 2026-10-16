-- Catalog: zones, monthly editions, the slot grid on each 6.5" x 12" side, and admins.
-- Anon users never read these tables directly; they read public.slot_availability.

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  household_count integer not null check (household_count >= 0),
  created_at timestamptz not null default now()
);

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones (id) on delete restrict,
  issue_month date not null check (extract(day from issue_month) = 1),
  artwork_deadline timestamptz not null,
  mail_date date,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed', 'approved_to_print', 'printed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (zone_id, issue_month)
);

create index editions_zone_id_idx on public.editions (zone_id);

-- Positions and sizes in inches from the top-left of the side; must fit the 6.5 x 12 piece.
create table public.slots (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  side text not null check (side in ('front', 'back')),
  label text not null check (length(label) between 1 and 40),
  x_in numeric(5, 3) not null check (x_in >= 0),
  y_in numeric(5, 3) not null check (y_in >= 0),
  width_in numeric(5, 3) not null check (width_in > 0),
  height_in numeric(5, 3) not null check (height_in > 0),
  price_cents integer not null check (price_cents > 0),
  created_at timestamptz not null default now(),
  unique (edition_id, side, label),
  check (x_in + width_in <= 6.5),
  check (y_in + height_in <= 12)
);

create index slots_edition_id_idx on public.slots (edition_id);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Security definer so policies can check admin membership without recursing into admins' RLS.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.zones enable row level security;
alter table public.editions enable row level security;
alter table public.slots enable row level security;
alter table public.admins enable row level security;

create policy "admins manage zones" on public.zones
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage editions" on public.editions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage slots" on public.slots
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- Admin rows are created with the service role; a signed-in user may only see their own row.
create policy "users read own admin row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Public catalog. Intentionally NOT security_invoker: it runs as the owner so anon can see
-- open/closed editions' slots and availability without any grant on the base tables.
-- Exposes no booking or contact data. Task 5 adds the reservation check to "available".
create view public.slot_availability as
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
  (e.status = 'open' and now() < e.artwork_deadline) as available
from public.slots s
join public.editions e on e.id = s.edition_id
join public.zones z on z.id = e.zone_id
where e.status in ('open', 'closed');

revoke all on public.zones, public.editions, public.slots, public.admins from anon;
revoke all on public.slot_availability from anon, authenticated;
grant select on public.slot_availability to anon, authenticated;
