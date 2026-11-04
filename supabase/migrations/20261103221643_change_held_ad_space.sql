-- Move one pending cart member's claim in place. Never release the old claim first:
-- a conflict rolls back the entire change, including expired-claim cleanup.
create function public.change_cart_position(
  p_cart_hash text, p_booking_id uuid, p_expected_slot uuid, p_slot_id uuid
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  b public.bookings;
  e public.editions;
  target public.slots;
  current_slot uuid;
begin
  if p_expected_slot is null or p_slot_id is null or not exists (
    select 1 from public.bookings owned join public.reservation_carts c on c.id=owned.cart_id
    where owned.id=p_booking_id and c.token_hash=p_cart_hash
  ) then raise exception using errcode='INS04', message='hold_unavailable'; end if;

  -- Match hold_slots/hold_cart's slot-first lock order. The expected slot makes
  -- concurrent edits from stale tabs fail instead of silently replacing a newer choice.
  perform 1 from public.slots where id in (p_expected_slot,p_slot_id) order by id for update;
  select b0.* into b from public.bookings b0 join public.reservation_carts c on c.id=b0.cart_id
    where b0.id=p_booking_id and c.token_hash=p_cart_hash for update of b0;
  if not found or b.status<>'pending' or b.hold_expires_at is null or b.hold_expires_at<=clock_timestamp() then
    raise exception using errcode='INS04', message='hold_unavailable';
  end if;
  select * into e from public.editions where id=b.edition_id for share;
  if e.product_model<>'square_v1' or b.size<>'standard' or
     (select count(*) from public.booking_slots where booking_id=b.id and released_at is null)<>1 then
    raise exception using errcode='INS04', message='invalid_selection';
  end if;
  select slot_id into current_slot from public.booking_slots where booking_id=b.id and released_at is null;
  if current_slot is distinct from p_expected_slot then
    raise exception using errcode='INS04', message='position_changed';
  end if;
  if current_slot=p_slot_id then return 'unchanged'; end if;
  -- The existing campaign_layout_before_open trigger permits only approved
  -- layouts to enter the open state; keep that private registry's grants intact.
  if not private.edition_is_bookable(e.id) or e.artwork_deadline<=clock_timestamp() then
    raise exception using errcode='INS02', message='edition_closed';
  end if;
  select * into target from public.slots where id=p_slot_id;
  if not found or target.edition_id<>b.edition_id then
    raise exception using errcode='INS04', message='invalid_selection';
  end if;
  if target.blocked_at is not null then
    raise exception using errcode='INS03', message='slot_unavailable';
  end if;

  update public.bookings set status='released',updated_at=now()
    where status='pending' and hold_expires_at<=clock_timestamp() and id in (
      select booking_id from public.booking_slots where slot_id=p_slot_id and released_at is null
    );
  begin
    update public.booking_slots set slot_id=p_slot_id
      where booking_id=b.id and slot_id=current_slot and released_at is null;
  exception when unique_violation then
    raise exception using errcode='INS03', message='slot_unavailable';
  end;
  -- Booking identity, original price/expiry, artwork, contact and the rest of the
  -- cart are unchanged. Existing claim/collection constraint triggers still apply.
  return 'changed';
end $$;
revoke all on function public.change_cart_position(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.change_cart_position(text,uuid,uuid,uuid) to service_role;
