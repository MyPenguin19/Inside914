-- Campaign pricing, lifecycle management and explicitly authorized V1 → V2 upgrades.
-- Additive: no existing campaign, reservation, artwork or price is migrated here.
alter table public.editions add column archived_at timestamptz;
alter table public.editions add constraint archived_campaign_finished check (archived_at is null or status in ('cancelled','completed'));
alter table public.editions drop constraint square_campaign_terms;
alter table public.editions add constraint square_campaign_terms check (
 product_model<>'square_v1' or (unit_price_cents between 1 and 99999999 and double_unit_price_cents is null
 and not category_exclusivity and layout_template in ('amazingmail-9x6-ten-square-draft','amazingmail-9x6-v2')));
alter table public.zone_charges drop constraint zone_charges_amount_cents_check;
alter table public.zone_charges add constraint zone_charges_amount_cents_check check(amount_cents between 1 and 99999999);

-- A transaction-scoped capability, inaccessible to API roles. This is not a user-settable GUC.
create table private.campaign_operations (
 edition_id uuid not null, operation text not null check(operation in ('upgrade','delete')),
 transaction_id bigint not null, admin_id uuid not null, primary key(edition_id,operation,transaction_id)
);
alter table private.campaign_operations enable row level security;
revoke all on private.campaign_operations from public,anon,authenticated,service_role;
create function private.campaign_operation(p_id uuid,p_operation text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.campaign_operations where edition_id=p_id and operation=p_operation
 and transaction_id=txid_current() and admin_id=auth.uid())
$$;
revoke all on function private.campaign_operation(uuid,text) from public,anon,authenticated,service_role;

-- Immutable pre-upgrade inputs retain source IDs, original crops, consent and proof metadata.
-- Existing proof/storage files are never overwritten or deleted by an upgrade.
create table private.campaign_layout_history (
 id uuid primary key default gen_random_uuid(), edition_id uuid not null,
 from_layout text not null,to_layout text not null, snapshot jsonb not null,
 upgraded_at timestamptz not null default now(), upgraded_by uuid not null,
 unique(edition_id,from_layout,to_layout)
);
alter table private.campaign_layout_history enable row level security;
revoke all on private.campaign_layout_history from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_create_square_campaign(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 perform private.require_admin();
 if coalesce((p->>'unit_price_cents')::integer,0) not between 1 and 99999999 or p->>'double_price_cents' is not null
  or private.square_slots(p->>'layout_template') is null then
  raise exception using errcode='MVP01',message='invalid_square_price';
 end if;
 v_id:=public.admin_create_campaign(p,private.square_slots(p->>'layout_template'));
 update public.editions set product_model='square_v1',category_exclusivity=false where id=v_id;
 perform private.log_event('campaign.square_product','campaign',v_id::text,jsonb_build_object('price_cents',(p->>'unit_price_cents')::integer,'paid_positions',10));
 return v_id;
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
begin
  perform private.require_admin();
  select * into v_before from public.editions where id = p_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if v_before.archived_at is not null or v_before.status in ('cancelled', 'completed') then
    raise exception using errcode = 'ADM04', message = 'campaign_finished';
  end if;
  v_has_bookings := exists (select 1 from public.bookings b where b.edition_id = p_id and b.status not in ('released', 'cancelled'))
                    or exists (select 1 from public.bookings b where b.edition_id = p_id and b.status in ('released', 'cancelled') and b.confirmed_at is not null);

  if v_before.status <> 'draft' and v_has_bookings
     and (p - 'name' - 'target_quantity' - 'unit_price_cents') <> '{}'::jsonb then
    raise exception using errcode = 'ADM04', message = 'locked_by_reservations';
  end if;

  update public.editions e set
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

  perform private.log_event('campaign.updated', 'campaign', p_id::text,
    jsonb_build_object('changes', p, 'before', to_jsonb(v_before) - 'created_at', 'after', to_jsonb(v_after) - 'created_at'));
  return 'updated';
exception when unique_violation then
  raise exception using errcode = 'ADM04', message = 'campaign_exists_for_month';
end;
$function$;

CREATE OR REPLACE FUNCTION private.edition_is_bookable(p_edition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select e.status = 'open' and e.archived_at is null
       and e.reservations_paused_at is null
       and (e.reservations_open_at is null or now() >= e.reservations_open_at)
       and now() < e.artwork_deadline
    from public.editions e
    where e.id = p_edition_id
  ), false);
$function$;

CREATE OR REPLACE FUNCTION private.edition_is_full(p_edition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when exists(select 1 from public.editions where id=p_edition_id and product_model='square_v1') then
   (select count(*)=10 from public.slots s where s.edition_id=p_edition_id)
   and (select count(*)=10 from public.booking_slots bs join public.bookings b on b.id=bs.booking_id
    join public.slots s on s.id=bs.slot_id and s.edition_id=b.edition_id
    where b.edition_id=p_edition_id and bs.released_at is null and b.status not in ('pending','released','cancelled')
    and b.size='standard' and b.price_cents>0)
  else exists (select 1 from public.slots s where s.edition_id = p_edition_id and s.blocked_at is null)
     and not exists (
       select 1 from public.slots s
       where s.edition_id = p_edition_id and s.blocked_at is null
         and not exists (
           select 1 from public.booking_slots bs
           join public.bookings b on b.id = bs.booking_id
           where bs.slot_id = s.id and bs.released_at is null and b.status not in ('pending', 'released', 'cancelled')
         )
     ) end;
$function$;

CREATE OR REPLACE FUNCTION public.hold_slots(p_slot_ids uuid[], p_token_hash text, p_pricing_mode text, p_unit_price_cents integer, p_double_price_cents integer)
 RETURNS TABLE(booking_id uuid, hold_expires_at timestamp with time zone, size text, price_cents integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_ids uuid[] := array(select distinct unnest(p_slot_ids) order by 1);
  v_found integer;
  v_editions integer;
  v_edition uuid;
  v_blocked integer;
  v_edition_unit integer;
  v_edition_double integer;
  v_model text;
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

  select e.unit_price_cents, e.double_unit_price_cents, e.product_model
    into v_edition_unit, v_edition_double, v_model
  from public.editions e
  where e.id = v_edition for share;

  if v_model='square_v1' and (cardinality(v_ids)<>1 or p_unit_price_cents<>v_edition_unit or p_double_price_cents is not null) then
    raise exception using errcode='INS05',message='invalid_pricing';
  end if;
  if p_pricing_mode = 'launch'
     and (p_unit_price_cents <> v_edition_unit or p_double_price_cents is distinct from v_edition_double) then
    raise exception using errcode = 'INS05', message = 'invalid_pricing';
  end if;
  if v_model<>'square_v1' and p_pricing_mode = 'test'
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
$function$;

CREATE OR REPLACE FUNCTION public.hold_cart(p_token_hash text, p_items jsonb, p_pricing_mode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_cart uuid; v_item jsonb; v_ids uuid[]; v_hold record; v_zones uuid[] := array[]::uuid[]; v_zone uuid; v_edition public.editions;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 4 then
  raise exception using errcode='INS04', message='Choose one to four areas';
 end if;
 -- Lock the union in the same order as single-area holds. Any failed member rolls back ALL holds.
 perform 1 from public.slots s where s.id in (
  select slot.value::uuid from jsonb_array_elements(p_items) i, jsonb_array_elements_text(i->'slot_ids') slot
 ) order by s.id for update;
 insert into public.reservation_carts(token_hash) values(p_token_hash) returning id into v_cart;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_edition from public.editions where id=(v_item->>'edition_id')::uuid;
  v_zone := v_edition.zone_id;
  if v_zone is null or v_zone=any(v_zones) then raise exception using errcode='INS04',message='Duplicate or missing area'; end if;
  v_zones := array_append(v_zones,v_zone);
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(v_item->'slot_ids');
  if exists(select 1 from public.slots where id=any(v_ids) and edition_id<>v_edition.id) then
   raise exception using errcode='INS04',message='Wrong campaign';
  end if;
  if v_edition.product_model='square_v1' and (v_item->>'mode' is distinct from 'standard' or cardinality(v_ids)<>1) then
   raise exception using errcode='INS04',message='One square ad per area';
  end if;
  if v_item->>'mode' in ('full_side','both_sides') then
   select * into v_hold from public.hold_postcard(v_ids,v_item->>'mode',v_item->>'token_hash',p_pricing_mode);
  else
   if (v_item->>'mode'='standard' and cardinality(v_ids)<>1) or (v_item->>'mode'='double' and cardinality(v_ids)<>2)
      or v_item->>'mode' not in ('standard','double') then
    raise exception using errcode='INS04',message='Invalid size';
   end if;
   select * into v_hold from public.hold_slots(v_ids,v_item->>'token_hash',p_pricing_mode,
    case when v_edition.product_model='square_v1' then v_edition.unit_price_cents when p_pricing_mode='test' then 100 else v_edition.unit_price_cents end,
    case when v_edition.product_model='square_v1' then null when p_pricing_mode='test' then 200 else v_edition.double_unit_price_cents end);
  end if;
  update public.bookings set cart_id=v_cart where id=v_hold.booking_id;
 end loop;
 return v_cart;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_square_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare square boolean; price integer;
begin
 select product_model='square_v1',unit_price_cents into square,price from public.editions where id=new.edition_id for share;
 if tg_op='UPDATE' and new.edition_id<>old.edition_id and (square or exists(select 1 from public.editions where id=old.edition_id and product_model='square_v1')) then
  raise exception using errcode='MVP03',message='square_booking_campaign_is_fixed';
 end if;
 if square and (new.size<>'standard' or new.price_cents<=0 or coalesce(new.claimed_slot_count,1)<>1) then
  raise exception using errcode='MVP03',message='square_booking_requires_one_ad';
 end if;
 if square and tg_op='INSERT' and new.price_cents is distinct from price then
  raise exception using errcode='INS05',message='invalid_pricing';
 end if;
 if tg_op='UPDATE' and new.price_cents is distinct from old.price_cents then
  raise exception using errcode='INS05',message='agreed_price_is_immutable';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.check_zone_collection_before_house(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.editions; n integer;
begin
 select * into e from public.editions where id=p_id for update;
 if not found or e.product_model<>'square_v1' or e.status<>'closed' or e.archived_at is not null or e.reservations_paused_at is not null then raise exception 'zone_must_be_closed'; end if;
 if not exists(select 1 from private.approved_layout_templates where template_key=e.layout_template) then raise exception 'printer_layout_not_approved'; end if;
 if e.mailing_window_start is null or e.mailing_window_end is null or e.mailing_window_end<e.mailing_window_start then raise exception 'mailing_window_required'; end if;
 if not exists(select 1 from public.mailing_evidence where edition_id=p_id and kind='final_proof' and published_at is not null and storage_path is not null) then raise exception 'approved_final_proof_required'; end if;
 perform 1 from public.bookings where edition_id=p_id order by id for update;
 perform 1 from public.slots where edition_id=p_id order by id for update;
 perform 1 from public.booking_artwork where booking_id in(select id from public.bookings where edition_id=p_id) for update;
 select count(*) into n from public.slots where edition_id=p_id and blocked_at is null;
 if n<>10 then raise exception 'ten_positions_required'; end if;
 select count(*) into n from public.bookings where edition_id=p_id and status not in ('pending','released','cancelled');
 if n<>10 then raise exception 'ten_confirmed_required'; end if;
 if exists(select 1 from public.bookings b left join public.booking_artwork a on a.booking_id=b.id
 where b.edition_id=p_id and b.status not in ('pending','released','cancelled') and (
 b.status<>'reserved' or b.confirmed_at is null or b.size<>'standard' or b.price_cents<=0 or b.flagged_at is not null
 or b.stripe_customer_id is null or b.stripe_payment_method_id is null or b.stripe_setup_status in ('failed','canceled')
 or b.stripe_customer_id like 'cus_devtest_%' or b.stripe_payment_method_id like 'pm_devtest_%'
 or (select count(*) from public.booking_slots bs join public.slots s on s.id=bs.slot_id where bs.booking_id=b.id and bs.released_at is null and s.edition_id=p_id and s.blocked_at is null)<>1
 or a.id is null or a.status<>'ready' or a.review_status<>'approved' or not private.artwork_crop_valid(a)
 or not exists(select 1 from public.payment_consents c where c.booking_id=b.id and c.amount_cents=b.price_cents and c.currency='usd' and c.terms_version='square-zones-v1')
 )) then raise exception 'reservation_not_ready'; end if;
 if (select count(distinct bs.slot_id) from public.booking_slots bs join public.bookings b on b.id=bs.booking_id where b.edition_id=p_id and b.status='reserved' and bs.released_at is null)<>10 then raise exception 'inventory_conflict'; end if;
end $function$;

CREATE OR REPLACE FUNCTION private.square_mail_ready(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.editions e join private.approved_layout_templates t on t.template_key=e.layout_template
 where e.id=p_id and e.product_model='square_v1' and e.status in('approved_to_print','printed','mailed','completed')
 and e.reservations_paused_at is null and e.mailing_window_start is not null and e.mailing_window_end>=e.mailing_window_start)
 and (select count(*)=10 from public.slots where edition_id=p_id and blocked_at is null)
 and (select count(*)=10 from public.bookings where edition_id=p_id and status not in('pending','released','cancelled'))
 and (select count(distinct bs.slot_id)=10 from public.bookings b join public.booking_slots bs on bs.booking_id=b.id and bs.released_at is null
 join public.slots s on s.id=bs.slot_id and s.edition_id=p_id and s.blocked_at is null
 join public.booking_artwork a on a.booking_id=b.id
 join public.zone_charges c on c.booking_id=b.id and c.edition_id=p_id
 where b.edition_id=p_id and b.status='charged' and b.price_cents>0 and b.size='standard' and b.flagged_at is null
 and c.status='succeeded' and c.amount_cents=b.price_cents and c.payment_intent_id is not null
 and a.status='ready' and a.review_status='approved' and private.artwork_print_resolution(a)
 and exists(select 1 from public.payment_consents pc where pc.id=c.consent_id and pc.booking_id=b.id and pc.amount_cents=b.price_cents and pc.currency='usd' and pc.terms_version='square-zones-v1'))
 and private.current_square_proof(p_id)
$function$;

CREATE OR REPLACE FUNCTION public.admin_prepare_zone_collection(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.require_admin();
 perform 1 from public.editions where id=p_id for update;
 if not exists(select 1 from public.zone_charges where edition_id=p_id) then
  perform private.check_zone_collection(p_id);
  insert into public.zone_charges(booking_id,edition_id,consent_id,amount_cents,customer_id,payment_method_id,created_by)
  select b.id,b.edition_id,c.id,b.price_cents,b.stripe_customer_id,b.stripe_payment_method_id,auth.uid()
  from public.bookings b cross join lateral(select id from public.payment_consents where booking_id=b.id and amount_cents=b.price_cents and currency='usd' and terms_version='square-zones-v1' order by consented_at desc limit 1)c
  where b.edition_id=p_id and b.status='reserved';
  update public.editions set status='approved_to_print',updated_at=now() where id=p_id;
  insert into public.admin_events(admin_user_id,event_type,target_type,target_id,details) values(auth.uid(),'zone_collection_authorized','campaign',p_id,jsonb_build_object('reservations',10,'total_cents',(select sum(amount_cents) from public.zone_charges where edition_id=p_id)));
 end if;
 return (select jsonb_agg(to_jsonb(c) order by c.id) from public.zone_charges c where edition_id=p_id);
end $function$;

CREATE OR REPLACE FUNCTION private.current_square_proof(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.house_artwork h join storage.objects o on o.bucket_id='house-artwork' and o.name=h.storage_path
 where exists(select 1 from public.mailing_evidence m where m.edition_id=p_id and m.kind='final_proof'
 and m.published_at is not null and m.storage_path is not null
 and not exists(select 1 from private.campaign_layout_history h, jsonb_array_elements(h.snapshot->'evidence') old_proof where h.edition_id=p_id and old_proof->>'id'=m.id::text)
 and m.uploaded_at >= coalesce((select max(upgraded_at) from private.campaign_layout_history where edition_id=p_id),'epoch'::timestamptz)
 and m.uploaded_at>=h.updated_at
 and m.uploaded_at >= coalesce((select max(a.updated_at) from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=p_id and b.status not in('pending','released','cancelled')),'epoch'::timestamptz)))
$function$;

CREATE OR REPLACE FUNCTION private.guard_square_campaign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if old.product_model='square_v1' and (new.product_model,new.zone_id,new.layout_template) is distinct from (old.product_model,old.zone_id,old.layout_template) then
  if not (private.campaign_operation(old.id,'upgrade') and new.product_model=old.product_model and new.zone_id=old.zone_id
    and old.layout_template='amazingmail-9x6-ten-square-draft' and new.layout_template='amazingmail-9x6-v2') then
   raise exception using errcode='MVP01',message='square_campaign_is_fixed';
  end if;
 end if;
 if old.product_model<>new.product_model and (old.status<>'draft' or exists(select 1 from public.bookings where edition_id=old.id)) then
  raise exception using errcode='MVP01',message='square_campaign_requires_unused_draft';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_square_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.editions;
begin
 if tg_op='UPDATE' and (new.edition_id,new.side,new.label,new.x_in,new.y_in,new.width_in,new.height_in)
  is not distinct from (old.edition_id,old.side,old.label,old.x_in,old.y_in,old.width_in,old.height_in) then return new; end if;
 select * into e from public.editions where id=coalesce(old.edition_id,new.edition_id) for update;
 if e.product_model='square_v1' then
  if tg_op='DELETE' and private.campaign_operation(e.id,'delete') then return old; end if;
  if tg_op='UPDATE' and private.campaign_operation(e.id,'upgrade') and new.id=old.id
   and (new.edition_id,new.side,new.label) is not distinct from (old.edition_id,old.side,old.label)
   and exists(select 1 from jsonb_to_recordset(private.square_slots('amazingmail-9x6-v2')) as r(side text,label text,x numeric,y numeric,width numeric,height numeric)
    where (new.side,new.label,new.x_in,new.y_in,new.width_in,new.height_in)=(r.side,r.label,r.x,r.y,r.width,r.height)) then return new; end if;
  raise exception using errcode='MVP02',message='square_inventory_is_fixed';
 end if;
 if tg_op='DELETE' then return old; end if;
 select * into e from public.editions where id=new.edition_id for update;
 if e.product_model='square_v1' or
 (private.square_slots(e.layout_template) is not null and (new.x_in+new.width_in>9 or new.y_in+new.height_in>6)) or
 (private.square_slots(e.layout_template) is null and new.x_in+new.width_in>6.5) then
  raise exception using errcode='MVP02',message='invalid_slot_geometry';
 end if;
 return new;
end $function$;

-- Deletion eligibility is checked again inside the transaction, not trusted from the UI.
create function private.campaign_deletable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.editions where id=p_id and status='draft' and archived_at is null)
 and not exists(select 1 from public.bookings where edition_id=p_id)
 and not exists(select 1 from public.payment_consents where edition_id=p_id)
 and not exists(select 1 from public.zone_charges where edition_id=p_id)
 and not exists(select 1 from public.mailing_evidence where edition_id=p_id)
 and not exists(select 1 from private.campaign_layout_history where edition_id=p_id)
$$;
create function public.admin_campaign_management(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.editions;
begin
 perform private.require_admin();
 select * into strict e from public.editions where id=p_id;
 return jsonb_build_object('can_delete',private.campaign_deletable(p_id),'can_archive',e.archived_at is null and e.status in('cancelled','completed'));
end $$;

create function private.guard_campaign_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.campaign_operation(old.id,'delete') or not private.campaign_deletable(old.id) then
  raise exception using errcode='ADM04',message='campaign_not_deletable';
 end if;
 return old;
end $$;
create trigger campaign_delete_guard before delete on public.editions for each row execute function private.guard_campaign_delete();

create function public.admin_delete_campaign(p_id uuid,p_confirmation text) returns text language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if p_confirmation is distinct from 'DELETE CAMPAIGN' then raise exception 'confirmation_required'; end if;
 perform 1 from public.editions where id=p_id for update;
 if not found then return 'already'; end if;
 if not private.campaign_deletable(p_id) then raise exception 'campaign_not_deletable'; end if;
 insert into private.campaign_operations values(p_id,'delete',txid_current(),auth.uid());
 perform private.log_event('campaign.deleted','campaign',p_id::text,
   jsonb_build_object('campaign',(select to_jsonb(e) from public.editions e where id=p_id),'slots',(select jsonb_agg(to_jsonb(s)) from public.slots s where edition_id=p_id)));
 -- Only unoccupied inventory is removed. Financial/artwork records are protected by RESTRICT FKs.
 delete from public.slots where edition_id=p_id;
 delete from public.editions where id=p_id;
 delete from private.campaign_operations where edition_id=p_id and transaction_id=txid_current();
 return 'deleted';
end $$;

create function public.admin_archive_campaign(p_id uuid,p_confirmation text) returns text language plpgsql security definer set search_path='' as $$
declare e public.editions;
begin
 perform private.require_admin();
 if p_confirmation is distinct from 'ARCHIVE CAMPAIGN' then raise exception 'confirmation_required'; end if;
 select * into e from public.editions where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if e.archived_at is not null then return 'already'; end if;
 if e.status not in('cancelled','completed') then raise exception 'finish_campaign_before_archive'; end if;
 update public.editions set archived_at=now(),updated_at=now() where id=p_id;
 perform private.log_event('campaign.archived','campaign',p_id::text,jsonb_build_object('status',e.status));
 return 'archived';
end $$;

create function private.campaign_layout_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'edition',(select to_jsonb(e) from public.editions e where id=p_id),
 'slots',coalesce((select jsonb_agg(to_jsonb(s) order by side,label) from public.slots s where edition_id=p_id),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(to_jsonb(b) order by id) from public.bookings b where edition_id=p_id),'[]'::jsonb),
 'claims',coalesce((select jsonb_agg(to_jsonb(bs) order by bs.booking_id,bs.slot_id) from public.booking_slots bs join public.bookings b on b.id=bs.booking_id where b.edition_id=p_id),'[]'::jsonb),
 'artwork',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=p_id),'[]'::jsonb),
 'house_artwork',(select to_jsonb(h) from public.house_artwork h),
 'evidence',coalesce((select jsonb_agg(to_jsonb(m) order by id) from public.mailing_evidence m where edition_id=p_id),'[]'::jsonb))
$$;

create function public.admin_layout_upgrade_preview(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.editions; actual jsonb; reasons text[]:=array[]::text[];
begin
 perform private.require_admin();
 select * into e from public.editions where id=p_id;
 if not found then raise exception 'not_found'; end if;
 if e.layout_template='amazingmail-9x6-v2' then return jsonb_build_object('already',true,'eligible',false,'reasons',array['Already V2']); end if;
 if e.product_model<>'square_v1' or e.layout_template is distinct from 'amazingmail-9x6-ten-square-draft' then reasons:=array_append(reasons,'Only a V1 ten-position campaign can be upgraded.'); end if;
 if e.archived_at is not null or e.status not in('draft','open','closed') then reasons:=array_append(reasons,'Campaign must be an unarchived draft, paused open campaign, or closed campaign.'); end if;
 if e.status='open' and e.reservations_paused_at is null then reasons:=array_append(reasons,'Pause reservations explicitly before upgrading.'); end if;
 if exists(select 1 from public.bookings where edition_id=p_id and status='pending' and hold_expires_at>now()) then reasons:=array_append(reasons,'Wait for active holds to expire or complete.'); end if;
 if exists(select 1 from public.zone_charges where edition_id=p_id)
 or exists(select 1 from public.bookings where edition_id=p_id and status not in('pending','reserved','released','cancelled'))
 or exists(select 1 from public.mailing_evidence where edition_id=p_id and kind in('printer_confirmation','postal_acceptance','mailing_confirmation')) then
  reasons:=array_append(reasons,'Payment or mailing activity prevents a layout upgrade.');
 end if;
 select jsonb_agg(jsonb_build_object('side',side,'label',label,'x',x_in,'y',y_in,'width',width_in,'height',height_in) order by side,label) into actual from public.slots where edition_id=p_id;
 if actual is distinct from private.square_slots('amazingmail-9x6-ten-square-draft') then reasons:=array_append(reasons,'All ten V1 positions must match the registered inventory.'); end if;
 return jsonb_build_object('eligible',cardinality(reasons)=0,'already',false,'reasons',reasons,
 'fingerprint',md5(private.campaign_layout_snapshot(p_id)::text),
 'mapping',(select jsonb_agg(jsonb_build_object('slot_id',s.id,'label',s.label,'side',s.side,'from',jsonb_build_object('x',s.x_in,'y',s.y_in,'width',s.width_in,'height',s.height_in),'to',r.value) order by s.side,s.label)
  from public.slots s join jsonb_array_elements(private.square_slots('amazingmail-9x6-v2')) r on r.value->>'label'=s.label and r.value->>'side'=s.side where s.edition_id=p_id),
 'warning','Slot and reservation IDs, agreed prices, saved cards and original artwork stay unchanged. Every artwork approval and prior final-proof readiness must be renewed. Existing proof files remain historical evidence. No campaign is opened and no payment is requested.');
end $$;

create function public.admin_upgrade_campaign_layout(p_id uuid,p_fingerprint text,p_confirmation text) returns text language plpgsql security definer set search_path='' as $$
declare e public.editions; preview jsonb;
begin
 perform private.require_admin();
 if p_confirmation is distinct from 'UPGRADE TO V2' then raise exception 'confirmation_required'; end if;
 select * into e from public.editions where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if e.layout_template='amazingmail-9x6-v2' then return 'already'; end if;
 perform 1 from public.bookings where edition_id=p_id order by id for update;
 perform 1 from public.slots where edition_id=p_id order by id for update;
 perform 1 from public.booking_artwork where booking_id in(select id from public.bookings where edition_id=p_id) order by id for update;
 perform 1 from public.mailing_evidence where edition_id=p_id order by id for update;
 perform 1 from public.house_artwork for share;
 preview:=public.admin_layout_upgrade_preview(p_id);
 if not (preview->>'eligible')::boolean then raise exception 'layout_upgrade_blocked'; end if;
 if p_fingerprint is distinct from preview->>'fingerprint' then raise exception 'layout_preview_stale'; end if;
 insert into private.campaign_layout_history(edition_id,from_layout,to_layout,snapshot,upgraded_by)
 values(p_id,e.layout_template,'amazingmail-9x6-v2',private.campaign_layout_snapshot(p_id),auth.uid());
 insert into private.campaign_operations values(p_id,'upgrade',txid_current(),auth.uid());
 update public.editions set layout_template='amazingmail-9x6-v2',updated_at=now() where id=p_id;
 update public.slots s set x_in=r.x,y_in=r.y,width_in=r.width,height_in=r.height
 from jsonb_to_recordset(private.square_slots('amazingmail-9x6-v2')) as r(side text,label text,x numeric,y numeric,width numeric,height numeric)
 where s.edition_id=p_id and s.label=r.label and s.side=r.side;
 update public.booking_artwork set review_status='pending',reviewed_at=null,reviewed_by=null,
 review_note='Layout upgraded to V2; review the new placement and approve again.',updated_at=now()
 where booking_id in(select id from public.bookings where edition_id=p_id and status not in('pending','released','cancelled'));
 perform private.log_event('campaign.layout_upgraded','campaign',p_id::text,jsonb_build_object('from',e.layout_template,'to','amazingmail-9x6-v2','mapping',preview->'mapping'));
 delete from private.campaign_operations where edition_id=p_id and transaction_id=txid_current();
 return 'upgraded';
end $$;

revoke all on function private.campaign_deletable(uuid),private.guard_campaign_delete(),private.campaign_layout_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_campaign_management(uuid),public.admin_delete_campaign(uuid,text),public.admin_archive_campaign(uuid,text),public.admin_layout_upgrade_preview(uuid),public.admin_upgrade_campaign_layout(uuid,text,text) from public,anon,service_role;
grant execute on function public.admin_campaign_management(uuid),public.admin_delete_campaign(uuid,text),public.admin_archive_campaign(uuid,text),public.admin_layout_upgrade_preview(uuid),public.admin_upgrade_campaign_layout(uuid,text,text) to authenticated;

-- The payment ledger is a frozen copy of the booking's accepted consent, never the latest catalog price.
create function private.guard_zone_charge_amount() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.amount_cents,new.booking_id,new.edition_id,new.consent_id) is distinct from
   (old.amount_cents,old.booking_id,old.edition_id,old.consent_id) then raise exception 'charge_authorization_is_immutable'; end if;
 if not exists(select 1 from public.bookings b join public.payment_consents c on c.booking_id=b.id
   where b.id=new.booking_id and b.edition_id=new.edition_id and b.price_cents=new.amount_cents
   and c.id=new.consent_id and c.edition_id=new.edition_id and c.amount_cents=b.price_cents
   and c.currency='usd' and c.terms_version='square-zones-v1') then raise exception 'charge_consent_mismatch'; end if;
 return new;
end $$;
revoke all on function private.guard_zone_charge_amount() from public,anon,authenticated,service_role;
create trigger zone_charge_amount_guard before insert or update of amount_cents,booking_id,edition_id,consent_id
 on public.zone_charges for each row execute function private.guard_zone_charge_amount();
