-- Task 8: advertiser details, Stripe saved-card references, future-charge consent, atomic
-- reservation confirmation, account-free access tokens, webhook idempotency and an email outbox.
-- Extends the existing bookings model; no new reservation or payment model. No charges exist here.

-- Contact details for the business behind a booking (one per booking; reused if they go back).
create table public.booking_contacts (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  business_name text not null check (length(business_name) between 1 and 120),
  contact_name text not null check (length(contact_name) between 1 and 120),
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null check (phone ~ '^\+1[2-9][0-9]{9}$'), -- E.164, US/Canada numbers
  website text check (website is null or website ~ '^https?://'),
  category text check (category is null or length(category) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stripe references only (never card data), plus the confirmation outcome.
alter table public.bookings
  add column stripe_customer_id text check (stripe_customer_id ~ '^cus_'),
  add column stripe_setup_intent_id text unique check (stripe_setup_intent_id ~ '^seti_'),
  add column stripe_payment_method_id text check (stripe_payment_method_id ~ '^pm_'),
  add column reference text unique check (reference ~ '^IN914-[A-HJ-NP-Z2-9]{6}$'),
  add column confirmed_at timestamptz,
  add check (status <> 'reserved' or (confirmed_at is not null and reference is not null
                                       and stripe_payment_method_id is not null));

-- What the customer agreed to, when, and for how much (computed by the server, never the browser).
create table public.payment_consents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  edition_id uuid not null references public.editions (id) on delete restrict,
  stripe_setup_intent_id text not null check (stripe_setup_intent_id ~ '^seti_'),
  amount_cents integer not null check (amount_cents in (50000, 90000)),
  currency text not null default 'usd' check (currency = 'usd'),
  terms_version text not null,
  consented_at timestamptz not null default now(),
  unique (booking_id, stripe_setup_intent_id)
);

create index payment_consents_edition_id_idx on public.payment_consents (edition_id);

-- Account-free reservation links. Only a SHA-256 of the token is stored.
create table public.booking_access_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index booking_access_tokens_booking_id_idx on public.booking_access_tokens (booking_id);

-- Stripe webhook deliveries already handled (duplicate deliveries are ignored).
create table public.stripe_events (
  id text primary key check (id ~ '^evt_'),
  type text not null,
  received_at timestamptz not null default now()
);

-- Transactional email outbox: one row per (booking, kind), so retries can never send twice.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('reservation_confirmed')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  provider_message_id text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (booking_id, kind)
);

create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status in ('pending', 'failed');

alter table public.booking_contacts enable row level security;
alter table public.payment_consents enable row level security;
alter table public.booking_access_tokens enable row level security;
alter table public.stripe_events enable row level security;
alter table public.email_outbox enable row level security;

create policy "admins manage booking contacts" on public.booking_contacts
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins read payment consents" on public.payment_consents
  for select to authenticated using ((select private.is_admin()));
create policy "admins read access tokens" on public.booking_access_tokens
  for select to authenticated using ((select private.is_admin()));
create policy "admins read stripe events" on public.stripe_events
  for select to authenticated using ((select private.is_admin()));
create policy "admins manage email outbox" on public.email_outbox
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.booking_contacts, public.payment_consents, public.booking_access_tokens,
  public.stripe_events, public.email_outbox from anon;

-- Confirms a pending hold as a reservation, all or nothing. Called by the server only after it has
-- verified with Stripe that the SetupIntent succeeded. Idempotent: confirming twice is a no-op.
-- Never confirms an expired hold: an expired hold is released (its slots freed) instead.
-- Returns: confirmed | already_confirmed | hold_expired | not_pending | inventory_lost |
--          edition_closed | artwork_missing | contact_missing | consent_missing | wrong_setup_intent
create function public.confirm_booking(
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
  if v_live_slots <> (case v_booking.size when 'double' then 2 else 1 end) then
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
