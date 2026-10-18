-- Launch Phase 6A: what happens at a campaign's reservation deadline (spec D2, D3).
--
-- 1. private.edition_is_full(): every sellable (unblocked) space is claimed by a confirmed
--    reservation. The one definition of "full".
-- 2. approve_for_print now also requires a full campaign (D3: full or cancel).
-- 3. close_past_deadline_campaigns(): the daily job closes open campaigns whose deadline passed.
--    Audited as a system event (admin_events.admin_user_id is now nullable for these).
-- 4. admin_extend_deadline(): reopens a campaign with a later deadline (and, if needed, later
--    artwork/mailing dates), even with reservations. Customers aren't emailed.
-- 5. Cancelling a campaign WITH reservations is allowed only once its deadline has passed and it
--    isn't full: every live reservation is cancelled in the same transaction, and each confirmed
--    one gets a 'campaign_cancelled_not_full' email. The app then removes the saved cards.

alter table public.admin_events alter column admin_user_id drop not null;
alter table public.admin_events add constraint admin_events_system_or_admin
  check (admin_user_id is not null or event_type like 'system.%');

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('reservation_confirmed', 'reservation_cancelled', 'campaign_cancelled_not_full'));

create function private.edition_is_full(p_edition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.slots s where s.edition_id = p_edition_id and s.blocked_at is null)
     and not exists (
       select 1 from public.slots s
       where s.edition_id = p_edition_id and s.blocked_at is null
         and not exists (
           select 1 from public.booking_slots bs
           join public.bookings b on b.id = bs.booking_id
           where bs.slot_id = s.id and bs.released_at is null and b.status not in ('pending', 'released', 'cancelled')
         )
     );
$$;
revoke execute on function private.edition_is_full(uuid) from public;
grant execute on function private.edition_is_full(uuid) to authenticated, service_role;

-- For the daily job (service role only): closes every open campaign whose deadline has passed.
create function public.close_past_deadline_campaigns()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_count integer := 0;
begin
  for v in
    select id, private.edition_is_full(id) as is_full from public.editions
    where status = 'open' and artwork_deadline <= now()
    for update
  loop
    update public.editions set status = 'closed', updated_at = now() where id = v.id;
    insert into public.admin_events (admin_user_id, event_type, target_type, target_id, details)
    values (null, 'system.campaign_auto_closed', 'campaign', v.id::text, jsonb_build_object('reason', 'deadline_passed', 'full', v.is_full));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.close_past_deadline_campaigns() from public, anon, authenticated;
grant execute on function public.close_past_deadline_campaigns() to service_role;

-- Gives an open or closed campaign a later reservation deadline (optionally later artwork and
-- mailing dates too, which reservations otherwise lock) and reopens it if it was closed.
create function public.admin_extend_deadline(p_id uuid, p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.editions;
  v_after public.editions;
  v_deadline timestamptz := (p ->> 'reservation_deadline')::timestamptz;
begin
  perform private.require_admin();
  select * into v_before from public.editions where id = p_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if v_before.status not in ('open', 'closed') then raise exception using errcode = 'ADM04', message = 'cannot_extend_from_' || v_before.status; end if;
  if v_deadline is null or v_deadline <= now() then raise exception using errcode = 'ADM03', message = 'deadline_must_be_future'; end if;
  if v_deadline <= v_before.artwork_deadline then raise exception using errcode = 'ADM03', message = 'deadline_must_be_later'; end if;
  if v_before.status = 'closed' and exists (
    select 1 from public.editions o where o.zone_id = v_before.zone_id and o.id <> p_id and o.status = 'open'
  ) then raise exception using errcode = 'ADM04', message = 'another_open_campaign_in_area'; end if;

  update public.editions e set
    artwork_deadline = v_deadline,
    artwork_due_at = coalesce((p ->> 'artwork_due_at')::timestamptz, e.artwork_due_at),
    mailing_window_start = coalesce((p ->> 'mailing_window_start')::date, e.mailing_window_start),
    mailing_window_end = coalesce((p ->> 'mailing_window_end')::date, e.mailing_window_end),
    mail_date = coalesce((p ->> 'mailing_window_start')::date, e.mail_date),
    status = 'open',
    updated_at = now()
  where e.id = p_id
  returning * into v_after;

  if (v_after.reservations_open_at is not null and v_after.reservations_open_at >= v_after.artwork_deadline)
     or (v_after.artwork_due_at is not null and v_after.artwork_due_at < v_after.artwork_deadline)
     or (v_after.mailing_window_start is not null and v_after.artwork_due_at is not null and v_after.mailing_window_start < v_after.artwork_due_at::date)
     or (v_after.mailing_window_end is not null and v_after.mailing_window_start is not null and v_after.mailing_window_end < v_after.mailing_window_start) then
    raise exception using errcode = 'ADM03', message = 'dates_out_of_order';
  end if;

  perform private.log_event('campaign.deadline_extended', 'campaign', p_id::text,
    jsonb_build_object('from_status', v_before.status, 'before', jsonb_build_object('deadline', v_before.artwork_deadline, 'artwork_due_at', v_before.artwork_due_at,
      'mailing_window_start', v_before.mailing_window_start, 'mailing_window_end', v_before.mailing_window_end),
      'after', jsonb_build_object('deadline', v_after.artwork_deadline, 'artwork_due_at', v_after.artwork_due_at,
      'mailing_window_start', v_after.mailing_window_start, 'mailing_window_end', v_after.mailing_window_end)));
  return 'done';
end;
$$;
revoke execute on function public.admin_extend_deadline(uuid, jsonb) from public, anon;
grant execute on function public.admin_extend_deadline(uuid, jsonb) to authenticated;

-- Same lifecycle as before, with two changes: approve_for_print requires a full campaign, and
-- cancel may cancel reservations when the deadline passed without the campaign filling.
create or replace function public.admin_set_campaign_status(p_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.editions;
  v_next text;
  v_confirmed integer;
  v_cancelled integer := 0;
  v_notified integer := 0;
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
    if v.status not in ('draft', 'open', 'closed') then raise exception using errcode = 'ADM04', message = 'cannot_cancel_from_' || v.status; end if;
    if v_confirmed > 0 then
      -- Only the D2 case: the deadline passed and the campaign didn't fill.
      if v.artwork_deadline > now() then raise exception using errcode = 'ADM04', message = 'has_reservations'; end if;
      if private.edition_is_full(p_id) then raise exception using errcode = 'ADM04', message = 'campaign_is_full'; end if;
    end if;
    -- Confirmed reservations are told why; holds still in progress are just released.
    insert into public.email_outbox (booking_id, kind)
    select b.id, 'campaign_cancelled_not_full' from public.bookings b where b.edition_id = p_id and b.status = 'reserved'
    on conflict (booking_id, kind) do nothing;
    get diagnostics v_notified = row_count;
    update public.bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancellation_reason = 'Campaign cancelled: not fully reserved by its deadline', updated_at = now()
     where edition_id = p_id and status in ('pending', 'reserved'); -- bookings_release_slots frees the claims
    get diagnostics v_cancelled = row_count;
    update public.editions set status = 'cancelled', updated_at = now() where id = p_id;
    v_next := 'cancelled';
  elsif p_action = 'approve_for_print' then
    if v.status = 'approved_to_print' then return 'already'; end if;
    if v.status <> 'closed' then raise exception using errcode = 'ADM04', message = 'close_reservations_first'; end if;
    if not private.edition_is_full(p_id) then raise exception using errcode = 'ADM04', message = 'not_full'; end if;
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

  perform private.log_event('campaign.' || p_action, 'campaign', p_id::text,
    jsonb_build_object('from', v.status, 'paused', v.reservations_paused_at is not null, 'to', v_next)
    || case when p_action = 'cancel' then jsonb_build_object('reservations_cancelled', v_cancelled, 'customers_notified', v_notified) else '{}'::jsonb end);
  return 'done';
end;
$$;
