-- Canceling a confirmed reservation now (1) tells the customer and (2) removes their saved card.
--
-- 1. admin_cancel_booking() queues a 'reservation_cancelled' email in the SAME transaction as the
--    cancellation (the outbox's unique (booking_id, kind) means it can only ever be sent once).
--    Only for reservations that were confirmed: an unfinished hold never got a confirmation, so
--    it gets no cancellation either.
-- 2. bookings.card_removed_at records that the card was detached in Stripe. The app detaches it
--    right after the cancel; the email-outbox cron retries any cancelled booking whose card is
--    still attached. Stripe calls never happen inside the database.

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
  check (kind in ('reservation_confirmed', 'reservation_cancelled'));

alter table public.bookings add column card_removed_at timestamptz;

-- Finds cancelled bookings whose saved card still needs removing (for the retry job).
create index bookings_card_removal_due_idx on public.bookings (cancelled_at)
  where status = 'cancelled' and stripe_payment_method_id is not null and card_removed_at is null;

create or replace function public.admin_cancel_booking(p_booking_id uuid, p_reason text)
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

  if v.status = 'reserved' then
    insert into public.email_outbox (booking_id, kind) values (p_booking_id, 'reservation_cancelled')
    on conflict (booking_id, kind) do nothing;
  end if;

  perform private.log_event('booking.cancelled', 'booking', p_booking_id::text,
    jsonb_build_object('from', v.status, 'reason', p_reason, 'slots_released', v_released, 'size', v.size, 'price_cents', v.price_cents,
      'customer_notified', v.status = 'reserved'));
  return 'done';
end;
$$;
