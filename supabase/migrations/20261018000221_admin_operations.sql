-- Task 14.2: admin operations foundation. Additive: no existing column, status value or function
-- signature used by the live app is removed or renamed.
--
-- Every admin mutation is an admin_* function: security definer, executable by `authenticated`,
-- first checks the caller is an admin (private.require_admin), locks what it changes, is
-- idempotent, and writes an admin_events row in the same transaction.

------------------------------------------------------------------------------------------------
-- Audit log
------------------------------------------------------------------------------------------------
create table public.admin_events (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z_.]+$'),
  target_type text not null check (target_type in ('campaign', 'slot', 'booking', 'artwork', 'evidence')),
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_events_target_idx on public.admin_events (target_type, target_id, created_at desc);
create index admin_events_created_idx on public.admin_events (created_at desc);
alter table public.admin_events enable row level security;
create policy "admins read admin events" on public.admin_events
  for select to authenticated using ((select private.is_admin()));
revoke all on public.admin_events from anon;
revoke insert, update, delete on public.admin_events from authenticated;

create function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode = 'ADM01', message = 'not_admin';
  end if;
  return auth.uid();
end;
$$;

create function private.log_event(p_type text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_events (admin_user_id, event_type, target_type, target_id, details)
  values (auth.uid(), p_type, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

revoke execute on function private.require_admin() from public;
revoke execute on function private.log_event(text, text, text, jsonb) from public;
grant execute on function private.require_admin() to authenticated;
grant execute on function private.log_event(text, text, text, jsonb) to authenticated;

------------------------------------------------------------------------------------------------
-- Campaigns (editions)
------------------------------------------------------------------------------------------------
alter table public.editions
  add column name text check (name is null or length(name) between 1 and 120),
  add column target_quantity integer check (target_quantity is null or target_quantity > 0),
  add column layout_template text check (layout_template is null or layout_template ~ '^[a-z0-9-]{1,60}$'),
  add column reservations_open_at timestamptz,
  add column reservations_paused_at timestamptz,
  add column artwork_due_at timestamptz,
  add column mailing_window_start date,
  add column mailing_window_end date,
  add column updated_at timestamptz not null default now(),
  add check (mailing_window_end is null or mailing_window_start is null or mailing_window_end >= mailing_window_start);

-- Additive: 'mailed' and 'completed' join the existing values.
alter table public.editions drop constraint editions_status_check;
alter table public.editions add constraint editions_status_check
  check (status in ('draft', 'open', 'closed', 'approved_to_print', 'printed', 'mailed', 'completed', 'cancelled'));

-- THE rule for "can a new hold be placed in this edition?" (was copied into the view and
-- hold_slots). confirm_booking keeps its own rule (open + before deadline), so a hold already in
-- checkout may still confirm while reservations are paused.
create function private.edition_is_bookable(p_edition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.status = 'open'
       and e.reservations_paused_at is null
       and (e.reservations_open_at is null or now() >= e.reservations_open_at)
       and now() < e.artwork_deadline
    from public.editions e
    where e.id = p_edition_id
  ), false);
$$;
revoke execute on function private.edition_is_bookable(uuid) from public;
grant execute on function private.edition_is_bookable(uuid) to anon, authenticated, service_role;

------------------------------------------------------------------------------------------------
-- Inventory blocks
------------------------------------------------------------------------------------------------
alter table public.slots
  add column blocked_at timestamptz,
  add column blocked_by uuid references auth.users (id) on delete set null,
  add column blocked_reason text check (blocked_reason is null or length(blocked_reason) between 1 and 500);

-- Same columns as before plus 'blocked' as an occupancy value. A block is never a sale.
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

grant select on public.slot_availability to anon, authenticated;

-- hold_slots: same signature and behavior, plus: blocked slots can't be held, and bookability
-- comes from private.edition_is_bookable (so pausing stops new holds).
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

  select e.unit_price_cents, e.double_unit_price_cents
    into v_edition_unit, v_edition_double
  from public.editions e
  where e.id = v_edition;

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

------------------------------------------------------------------------------------------------
-- Reservations: notes, flags, cancellation record
------------------------------------------------------------------------------------------------
alter table public.bookings
  add column flagged_at timestamptz,
  add column flagged_by uuid references auth.users (id) on delete set null,
  add column flag_reason text check (flag_reason is null or length(flag_reason) between 1 and 500),
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users (id) on delete set null,
  add column cancellation_reason text check (cancellation_reason is null or length(cancellation_reason) between 1 and 500);

create table public.booking_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index booking_notes_booking_idx on public.booking_notes (booking_id, created_at desc);
alter table public.booking_notes enable row level security;
create policy "admins read booking notes" on public.booking_notes
  for select to authenticated using ((select private.is_admin()));
revoke all on public.booking_notes from anon;
revoke insert, update, delete on public.booking_notes from authenticated;

------------------------------------------------------------------------------------------------
-- Artwork review (content approval; print readiness is NOT assessed here)
------------------------------------------------------------------------------------------------
alter table public.booking_artwork
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'changes_requested')),
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or length(review_note) between 1 and 1000);

-- Decision history, kept even if the artwork row is later replaced.
create table public.artwork_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  artwork_id uuid references public.booking_artwork (id) on delete set null,
  storage_path text not null,
  decision text not null check (decision in ('approved', 'rejected', 'changes_requested')),
  note text check (note is null or length(note) between 1 and 1000),
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index artwork_reviews_booking_idx on public.artwork_reviews (booking_id, created_at desc);
alter table public.artwork_reviews enable row level security;
create policy "admins read artwork reviews" on public.artwork_reviews
  for select to authenticated using ((select private.is_admin()));
revoke all on public.artwork_reviews from anon;
revoke insert, update, delete on public.artwork_reviews from authenticated;

------------------------------------------------------------------------------------------------
-- Mailing evidence (private files)
------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mailing-evidence', 'mailing-evidence', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
-- No storage policies: only the server (after requireAdmin) can read or write these files.

create table public.mailing_evidence (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete restrict,
  kind text not null check (kind in ('printer_confirmation', 'final_proof', 'postal_acceptance', 'mailing_confirmation', 'other')),
  title text not null check (length(title) between 1 and 200),
  storage_path text unique check (storage_path is null or storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'),
  content_type text check (content_type is null or content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer check (byte_size is null or byte_size between 1 and 10485760),
  quantity_printed integer check (quantity_printed is null or quantity_printed >= 0),
  quantity_accepted integer check (quantity_accepted is null or quantity_accepted >= 0),
  event_date date,
  notes text check (notes is null or length(notes) <= 2000),
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null
);
create index mailing_evidence_edition_idx on public.mailing_evidence (edition_id, uploaded_at desc);
alter table public.mailing_evidence enable row level security;
create policy "admins read mailing evidence" on public.mailing_evidence
  for select to authenticated using ((select private.is_admin()));
revoke all on public.mailing_evidence from anon;
revoke insert, update, delete on public.mailing_evidence from authenticated;

------------------------------------------------------------------------------------------------
-- Admin operations
------------------------------------------------------------------------------------------------

-- Errors: ADM01 not_admin · ADM02 not_found · ADM03 invalid_input · ADM04 not_allowed (with a reason).

-- Creates a DRAFT campaign and its inventory (slots from a layout template chosen by the server).
create function public.admin_create_campaign(p jsonb, p_slots jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_zone uuid := (p ->> 'zone_id')::uuid;
  v_open timestamptz := (p ->> 'reservations_open_at')::timestamptz;
  v_deadline timestamptz := (p ->> 'reservation_deadline')::timestamptz;
  v_artwork timestamptz := (p ->> 'artwork_due_at')::timestamptz;
  v_win_start date := (p ->> 'mailing_window_start')::date;
  v_win_end date := (p ->> 'mailing_window_end')::date;
  v_month date := (p ->> 'issue_month')::date;
begin
  perform private.require_admin();
  if not exists (select 1 from public.zones z where z.id = v_zone) then
    raise exception using errcode = 'ADM03', message = 'zone_not_found';
  end if;
  if v_month is null or extract(day from v_month) <> 1
     or v_deadline is null or v_artwork is null or v_win_start is null or v_win_end is null
     or coalesce((p ->> 'target_quantity')::integer, 0) <= 0
     or coalesce((p ->> 'unit_price_cents')::integer, 0) <= 0
     or ((p ->> 'double_price_cents') is not null and (p ->> 'double_price_cents')::integer <= 0)
     or length(coalesce(p ->> 'name', '')) not between 1 and 120
     or (p ->> 'layout_template') !~ '^[a-z0-9-]{1,60}$'
     or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) not between 1 and 64 then
    raise exception using errcode = 'ADM03', message = 'invalid_input';
  end if;
  -- Logical order: opens < reservation deadline <= artwork due <= mailing window start <= end.
  if (v_open is not null and v_open >= v_deadline) or v_artwork < v_deadline or v_win_start < v_artwork::date or v_win_end < v_win_start then
    raise exception using errcode = 'ADM03', message = 'dates_out_of_order';
  end if;

  insert into public.editions (zone_id, issue_month, artwork_deadline, mail_date, status, unit_price_cents, double_unit_price_cents,
                               name, target_quantity, layout_template, reservations_open_at, artwork_due_at, mailing_window_start, mailing_window_end)
  values (v_zone, v_month, v_deadline, v_win_start, 'draft', (p ->> 'unit_price_cents')::integer, (p ->> 'double_price_cents')::integer,
          p ->> 'name', (p ->> 'target_quantity')::integer, p ->> 'layout_template', v_open, v_artwork, v_win_start, v_win_end)
  returning id into v_id;

  insert into public.slots (edition_id, side, label, x_in, y_in, width_in, height_in)
  select v_id, s ->> 'side', s ->> 'label', (s ->> 'x')::numeric, (s ->> 'y')::numeric, (s ->> 'width')::numeric, (s ->> 'height')::numeric
  from jsonb_array_elements(p_slots) s;

  perform private.log_event('campaign.created', 'campaign', v_id::text, p || jsonb_build_object('slots', jsonb_array_length(p_slots)));
  return v_id;
exception when unique_violation then
  raise exception using errcode = 'ADM04', message = 'campaign_exists_for_month';
end;
$$;

-- Edits a campaign. Drafts (and campaigns with no bookings at all) can change everything below;
-- once anyone has booked, only the name and target quantity can change here.
create function public.admin_update_campaign(p_id uuid, p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.editions;
  v_after public.editions;
  v_has_bookings boolean;
begin
  perform private.require_admin();
  select * into v_before from public.editions where id = p_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if v_before.status in ('cancelled', 'completed') then
    raise exception using errcode = 'ADM04', message = 'campaign_finished';
  end if;
  v_has_bookings := exists (select 1 from public.bookings b where b.edition_id = p_id and b.status not in ('released', 'cancelled'))
                    or exists (select 1 from public.bookings b where b.edition_id = p_id and b.status in ('released', 'cancelled') and b.confirmed_at is not null);

  if v_before.status <> 'draft' and v_has_bookings
     and (p - 'name' - 'target_quantity') <> '{}'::jsonb then
    raise exception using errcode = 'ADM04', message = 'locked_by_reservations';
  end if;

  update public.editions e set
    name = coalesce(p ->> 'name', e.name),
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

  perform private.log_event('campaign.updated', 'campaign', p_id::text,
    jsonb_build_object('changes', p, 'before', to_jsonb(v_before) - 'created_at', 'after', to_jsonb(v_after) - 'created_at'));
  return 'updated';
exception when unique_violation then
  raise exception using errcode = 'ADM04', message = 'campaign_exists_for_month';
end;
$$;

-- Lifecycle: open, pause, resume, close, cancel, approve_for_print, mark_printed, mark_mailed,
-- complete. Returns 'done' or 'already' (idempotent). Never cancels or charges reservations.
create function public.admin_set_campaign_status(p_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.editions;
  v_next text;
  v_confirmed integer;
begin
  perform private.require_admin();
  select * into v from public.editions where id = p_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  select count(*) into v_confirmed from public.bookings b where b.edition_id = p_id and b.status not in ('pending', 'released', 'cancelled');

  if p_action = 'open' then
    if v.status = 'open' then return 'already'; end if;
    if v.status not in ('draft', 'closed') then raise exception using errcode = 'ADM04', message = 'cannot_open_from_' || v.status; end if;
    if v.artwork_deadline <= now() then raise exception using errcode = 'ADM04', message = 'deadline_passed'; end if;
    if v.layout_template is null and v.status = 'draft' then raise exception using errcode = 'ADM04', message = 'no_layout'; end if;
    if not exists (select 1 from public.slots s where s.edition_id = p_id) then raise exception using errcode = 'ADM04', message = 'no_inventory'; end if;
    if v.unit_price_cents is null or v.unit_price_cents <= 0 then raise exception using errcode = 'ADM04', message = 'no_pricing'; end if;
    if exists (select 1 from public.editions o where o.zone_id = v.zone_id and o.id <> p_id and o.status = 'open') then
      raise exception using errcode = 'ADM04', message = 'another_open_campaign_in_area';
    end if;
    v_next := 'open';
    update public.editions set status = 'open', reservations_paused_at = null, updated_at = now() where id = p_id;
  elsif p_action = 'pause' then
    if v.status <> 'open' then raise exception using errcode = 'ADM04', message = 'not_open'; end if;
    if v.reservations_paused_at is not null then return 'already'; end if;
    update public.editions set reservations_paused_at = now(), updated_at = now() where id = p_id;
    v_next := 'open (paused)';
  elsif p_action = 'resume' then
    if v.status <> 'open' then raise exception using errcode = 'ADM04', message = 'not_open'; end if;
    if v.reservations_paused_at is null then return 'already'; end if;
    if v.artwork_deadline <= now() then raise exception using errcode = 'ADM04', message = 'deadline_passed'; end if;
    update public.editions set reservations_paused_at = null, updated_at = now() where id = p_id;
    v_next := 'open';
  elsif p_action = 'close' then
    if v.status = 'closed' then return 'already'; end if;
    if v.status <> 'open' then raise exception using errcode = 'ADM04', message = 'not_open'; end if;
    update public.editions set status = 'closed', updated_at = now() where id = p_id;
    v_next := 'closed';
  elsif p_action = 'cancel' then
    if v.status = 'cancelled' then return 'already'; end if;
    if v_confirmed > 0 then raise exception using errcode = 'ADM04', message = 'has_reservations'; end if;
    if v.status not in ('draft', 'open', 'closed') then raise exception using errcode = 'ADM04', message = 'cannot_cancel_from_' || v.status; end if;
    update public.editions set status = 'cancelled', updated_at = now() where id = p_id;
    v_next := 'cancelled';
  elsif p_action = 'approve_for_print' then
    if v.status = 'approved_to_print' then return 'already'; end if;
    if v.status <> 'closed' then raise exception using errcode = 'ADM04', message = 'close_reservations_first'; end if;
    if exists (
      select 1 from public.bookings b
      left join public.booking_artwork a on a.booking_id = b.id
      where b.edition_id = p_id and b.status not in ('pending', 'released', 'cancelled')
        and (a.id is null or a.review_status <> 'approved')
    ) then raise exception using errcode = 'ADM04', message = 'artwork_not_all_approved'; end if;
    update public.editions set status = 'approved_to_print', updated_at = now() where id = p_id;
    v_next := 'approved_to_print';
  elsif p_action = 'mark_printed' then
    if v.status = 'printed' then return 'already'; end if;
    if v.status <> 'approved_to_print' then raise exception using errcode = 'ADM04', message = 'not_approved_to_print'; end if;
    if not exists (select 1 from public.mailing_evidence m where m.edition_id = p_id and m.kind = 'printer_confirmation') then
      raise exception using errcode = 'ADM04', message = 'needs_printer_confirmation';
    end if;
    update public.editions set status = 'printed', updated_at = now() where id = p_id;
    v_next := 'printed';
  elsif p_action = 'mark_mailed' then
    if v.status = 'mailed' then return 'already'; end if;
    if v.status <> 'printed' then raise exception using errcode = 'ADM04', message = 'not_printed'; end if;
    if not exists (select 1 from public.mailing_evidence m where m.edition_id = p_id and m.kind in ('postal_acceptance', 'mailing_confirmation')) then
      raise exception using errcode = 'ADM04', message = 'needs_mailing_evidence';
    end if;
    update public.editions set status = 'mailed', updated_at = now() where id = p_id;
    v_next := 'mailed';
  elsif p_action = 'complete' then
    if v.status = 'completed' then return 'already'; end if;
    if v.status <> 'mailed' then raise exception using errcode = 'ADM04', message = 'not_mailed'; end if;
    update public.editions set status = 'completed', updated_at = now() where id = p_id;
    v_next := 'completed';
  else
    raise exception using errcode = 'ADM03', message = 'unknown_action';
  end if;

  perform private.log_event('campaign.' || p_action, 'campaign', p_id::text, jsonb_build_object('from', v.status, 'paused', v.reservations_paused_at is not null, 'to', v_next));
  return 'done';
end;
$$;

-- Blocks an unclaimed slot (not a sale) or unblocks an admin block.
create function public.admin_set_slot_block(p_slot_id uuid, p_block boolean, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.slots;
begin
  perform private.require_admin();
  select * into v from public.slots where id = p_slot_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if p_block then
    if v.blocked_at is not null then return 'already'; end if;
    if length(coalesce(p_reason, '')) not between 1 and 500 then raise exception using errcode = 'ADM03', message = 'reason_required'; end if;
    if private.slot_claim(p_slot_id) <> 'free' then raise exception using errcode = 'ADM04', message = 'slot_occupied'; end if;
    update public.slots set blocked_at = now(), blocked_by = auth.uid(), blocked_reason = p_reason where id = p_slot_id;
  else
    if v.blocked_at is null then return 'already'; end if;
    update public.slots set blocked_at = null, blocked_by = null, blocked_reason = null where id = p_slot_id;
  end if;
  perform private.log_event(case when p_block then 'slot.blocked' else 'slot.unblocked' end, 'slot', p_slot_id::text,
    jsonb_build_object('edition_id', v.edition_id, 'label', v.label, 'reason', coalesce(p_reason, v.blocked_reason)));
  return 'done';
end;
$$;

-- Cancels an UNPAID reservation or hold: all of its slots are released together (trigger on
-- bookings), history and the reason are kept. Bookings with any payment state are refused.
create function public.admin_cancel_booking(p_booking_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings;
  v_released integer;
begin
  perform private.require_admin();
  if length(coalesce(p_reason, '')) not between 1 and 500 then raise exception using errcode = 'ADM03', message = 'reason_required'; end if;
  select * into v from public.bookings where id = p_booking_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if v.status = 'cancelled' then return 'already'; end if;
  if v.status = 'released' then raise exception using errcode = 'ADM04', message = 'already_released'; end if;
  if v.status in ('charged', 'charge_failed') then raise exception using errcode = 'ADM04', message = 'payment_state_needs_resolution'; end if;

  select count(*) into v_released from public.booking_slots where booking_id = p_booking_id and released_at is null;
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason, updated_at = now()
   where id = p_booking_id; -- bookings_release_slots frees every claim in this same transaction

  perform private.log_event('booking.cancelled', 'booking', p_booking_id::text,
    jsonb_build_object('from', v.status, 'reason', p_reason, 'slots_released', v_released, 'size', v.size, 'price_cents', v.price_cents));
  return 'done';
end;
$$;

create function public.admin_add_booking_note(p_booking_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if not exists (select 1 from public.bookings where id = p_booking_id) then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if length(coalesce(trim(p_body), '')) not between 1 and 2000 then raise exception using errcode = 'ADM03', message = 'note_required'; end if;
  insert into public.booking_notes (booking_id, author_id, body) values (p_booking_id, auth.uid(), trim(p_body)) returning id into v_id;
  perform private.log_event('booking.note_added', 'booking', p_booking_id::text, jsonb_build_object('note_id', v_id));
  return v_id;
end;
$$;

-- p_reason null clears the flag.
create function public.admin_flag_booking(p_booking_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings;
begin
  perform private.require_admin();
  select * into v from public.bookings where id = p_booking_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if p_reason is null then
    if v.flagged_at is null then return 'already'; end if;
    update public.bookings set flagged_at = null, flagged_by = null, flag_reason = null where id = p_booking_id;
  else
    if length(trim(p_reason)) not between 1 and 500 then raise exception using errcode = 'ADM03', message = 'reason_required'; end if;
    update public.bookings set flagged_at = now(), flagged_by = auth.uid(), flag_reason = trim(p_reason) where id = p_booking_id;
  end if;
  perform private.log_event(case when p_reason is null then 'booking.unflagged' else 'booking.flagged' end, 'booking', p_booking_id::text,
    jsonb_build_object('reason', p_reason, 'previous', v.flag_reason));
  return 'done';
end;
$$;

-- Content review of ONE artwork row (a new upload is a new row, so approval never carries over).
create function public.admin_review_artwork(p_artwork_id uuid, p_decision text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.booking_artwork;
  v_booking public.bookings;
begin
  perform private.require_admin();
  if p_decision not in ('approved', 'rejected', 'changes_requested') then raise exception using errcode = 'ADM03', message = 'invalid_decision'; end if;
  if p_decision <> 'approved' and length(coalesce(trim(p_note), '')) not between 1 and 1000 then
    raise exception using errcode = 'ADM03', message = 'reason_required';
  end if;
  select * into v from public.booking_artwork where id = p_artwork_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if v.status <> 'ready' or v.crop_width is null then raise exception using errcode = 'ADM04', message = 'artwork_incomplete'; end if;
  select * into v_booking from public.bookings where id = v.booking_id;
  if v_booking.status in ('released', 'cancelled') then raise exception using errcode = 'ADM04', message = 'booking_ended'; end if;
  if v.review_status = p_decision and v.review_note is not distinct from nullif(trim(p_note), '') then return 'already'; end if;

  update public.booking_artwork
     set review_status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_artwork_id;
  insert into public.artwork_reviews (booking_id, artwork_id, storage_path, decision, note, admin_user_id)
  values (v.booking_id, v.id, v.storage_path, p_decision, nullif(trim(p_note), ''), auth.uid());
  perform private.log_event('artwork.' || p_decision, 'artwork', p_artwork_id::text,
    jsonb_build_object('booking_id', v.booking_id, 'from', v.review_status, 'note', nullif(trim(p_note), '')));
  return 'done';
end;
$$;

-- Records evidence after the server has stored the (validated) file privately; never publishes.
create function public.admin_add_evidence(p_edition_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
begin
  perform private.require_admin();
  if not exists (select 1 from public.editions where id = p_edition_id) then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  insert into public.mailing_evidence (id, edition_id, kind, title, storage_path, content_type, byte_size, quantity_printed, quantity_accepted, event_date, notes, uploaded_by)
  values (v_id, p_edition_id, p ->> 'kind', p ->> 'title', p ->> 'storage_path', p ->> 'content_type', (p ->> 'byte_size')::integer,
          (p ->> 'quantity_printed')::integer, (p ->> 'quantity_accepted')::integer, (p ->> 'event_date')::date, nullif(p ->> 'notes', ''), auth.uid());
  perform private.log_event('evidence.uploaded', 'evidence', v_id::text, jsonb_build_object('edition_id', p_edition_id, 'kind', p ->> 'kind', 'title', p ->> 'title'));
  return v_id;
exception when check_violation or not_null_violation or invalid_text_representation then
  raise exception using errcode = 'ADM03', message = 'invalid_input';
end;
$$;

create function public.admin_publish_evidence(p_id uuid, p_publish boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.mailing_evidence;
begin
  perform private.require_admin();
  select * into v from public.mailing_evidence where id = p_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if p_publish = (v.published_at is not null) then return 'already'; end if;
  update public.mailing_evidence
     set published_at = case when p_publish then now() end, published_by = case when p_publish then auth.uid() end
   where id = p_id;
  perform private.log_event(case when p_publish then 'evidence.published' else 'evidence.unpublished' end, 'evidence', p_id::text,
    jsonb_build_object('edition_id', v.edition_id, 'kind', v.kind));
  return 'done';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_create_campaign(jsonb, jsonb)', 'admin_update_campaign(uuid, jsonb)', 'admin_set_campaign_status(uuid, text)',
    'admin_set_slot_block(uuid, boolean, text)', 'admin_cancel_booking(uuid, text)', 'admin_add_booking_note(uuid, text)',
    'admin_flag_booking(uuid, text)', 'admin_review_artwork(uuid, text, text)', 'admin_add_evidence(uuid, jsonb)',
    'admin_publish_evidence(uuid, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
