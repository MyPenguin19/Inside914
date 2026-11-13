-- Correct the area on unused drafts through the audited admin RPC only.
-- No campaign, reservation, payment, layout or customer record is changed by this migration.
alter table private.campaign_operations drop constraint campaign_operations_operation_check;
alter table private.campaign_operations add constraint campaign_operations_operation_check
 check(operation in ('upgrade','delete','change_area'));

create function private.campaign_area_changeable(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.campaign_deletable(p_id)
 and not exists(select 1 from public.advertiser_invitations where edition_id=p_id)
 and not exists(select 1 from public.printer_order_events where edition_id=p_id)
$$;
revoke all on function private.campaign_area_changeable(uuid) from public,anon,authenticated,service_role;

create or replace function public.admin_campaign_management(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.editions;
begin
 perform private.require_admin();
 select * into strict e from public.editions where id=p_id;
 return jsonb_build_object(
  'can_delete',private.campaign_deletable(p_id),
  'can_archive',e.archived_at is null and e.status in('cancelled','completed'),
  'can_change_area',private.campaign_area_changeable(p_id));
end $$;

CREATE OR REPLACE FUNCTION private.guard_square_campaign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.zone_id is distinct from old.zone_id and not (
   private.campaign_operation(old.id,'change_area') and private.campaign_area_changeable(old.id)
   and new.status='draft' and new.archived_at is null
 ) then raise exception using errcode='ADM04',message='campaign_area_locked'; end if;
 if old.product_model='square_v1' and (new.product_model,new.zone_id,new.layout_template) is distinct from (old.product_model,old.zone_id,old.layout_template) then
  if not ((private.campaign_operation(old.id,'change_area') and new.product_model=old.product_model and new.layout_template=old.layout_template)
    or (private.campaign_operation(old.id,'upgrade') and new.product_model=old.product_model and new.zone_id=old.zone_id
    and old.layout_template='amazingmail-9x6-ten-square-draft' and new.layout_template='amazingmail-9x6-v2')) then
   raise exception using errcode='MVP01',message='square_campaign_is_fixed';
  end if;
 end if;
 if old.product_model<>new.product_model and (old.status<>'draft' or exists(select 1 from public.bookings where edition_id=old.id)) then
  raise exception using errcode='MVP01',message='square_campaign_requires_unused_draft';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_update_campaign(p_id uuid, p jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before public.editions;
  v_after public.editions;
  v_has_bookings boolean;
  v_zone uuid;
begin
  perform private.require_admin();
  select * into v_before from public.editions where id = p_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if v_before.archived_at is not null or v_before.status in ('cancelled', 'completed') then
    raise exception using errcode = 'ADM04', message = 'campaign_finished';
  end if;
  v_has_bookings := exists (select 1 from public.bookings b where b.edition_id = p_id and b.status not in ('released', 'cancelled'))
                    or exists (select 1 from public.bookings b where b.edition_id = p_id and b.status in ('released', 'cancelled') and b.confirmed_at is not null);

  v_zone := case when p ? 'zone_id' then (p->>'zone_id')::uuid else v_before.zone_id end;
  if v_zone is distinct from v_before.zone_id then
    if not private.campaign_area_changeable(p_id) then
      raise exception using errcode='ADM04', message='campaign_area_locked';
    end if;
    perform 1 from public.zones where id=v_zone for key share;
    if not found then raise exception using errcode='ADM03', message='zone_not_found'; end if;
    insert into private.campaign_operations values(p_id,'change_area',txid_current(),auth.uid());
  end if;

  -- An unchanged area is sent by the edit form, including when a reservation
  -- arrived since the form loaded. A different area was already rejected above.
  if v_has_bookings
     and (p - 'name' - 'target_quantity' - 'unit_price_cents' - 'zone_id') <> '{}'::jsonb then
    raise exception using errcode = 'ADM04', message = 'locked_by_reservations';
  end if;

  update public.editions e set
    zone_id = v_zone,
    name = coalesce(p ->> 'name', e.name),
    unit_price_cents = case when p ? 'unit_price_cents' then (p->>'unit_price_cents')::integer else e.unit_price_cents end,
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

  delete from private.campaign_operations where edition_id=p_id and operation='change_area' and transaction_id=txid_current();
  perform private.log_event('campaign.updated', 'campaign', p_id::text,
    jsonb_build_object('changes', p, 'before', to_jsonb(v_before) - 'created_at', 'after', to_jsonb(v_after) - 'created_at'));
  return 'updated';
exception when unique_violation then
  raise exception using errcode = 'ADM04', message = 'campaign_exists_for_month';
end;
$function$;

-- Existing public RPC signatures and authenticated-only grants remain unchanged.
notify pgrst, 'reload schema';
