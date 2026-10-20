-- Square reservations now select a position and individual artwork per area.
-- Preserve historical bookings, layout approval, fixed prices and collection gates.
create or replace function private.guard_campaign_categories()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.product_model='square_v1' then
    if new.category_exclusivity then raise exception using errcode='CAT01',message='square_categories_retired'; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.category_exclusivity = new.category_exclusivity then return new; end if;
  if tg_op = 'UPDATE' and old.category_exclusivity then
    raise exception using errcode = 'CAT01', message = 'category_exclusivity_cannot_be_disabled';
  end if;
  if new.category_exclusivity and (new.status <> 'draft' or exists (
    select 1 from public.bookings where edition_id = new.id
  )) then
    raise exception using errcode = 'CAT01', message = 'categories_require_unused_draft';
  end if;
  return new;
end;
$$;
create or replace function private.require_booking_category()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare b public.bookings; required boolean;
begin
  select * into b from public.bookings where id = new.id;
  if not found then return null; end if;
  -- Retain historical category labels; they no longer restrict square inventory.
  if exists(select 1 from public.editions where id=b.edition_id and product_model='square_v1') then return null; end if;
  select category_exclusivity into required from public.editions where id = b.edition_id;
  if required and b.status not in ('released', 'cancelled') and b.category_id is null then
    raise exception using errcode = 'CAT03', message = 'category_required';
  end if;
  if not required and b.category_id is not null then
    raise exception using errcode = 'CAT03', message = 'campaign_categories_not_enabled';
  end if;
  return null;
end;
$$;
alter table public.editions drop constraint square_campaign_terms;
alter table public.editions add constraint square_campaign_terms check (
 product_model <> 'square_v1' or (unit_price_cents=39900 and double_unit_price_cents is null
 and not category_exclusivity and layout_template='amazingmail-9x6-ten-square-draft')) not valid;
update public.editions set category_exclusivity=false where product_model='square_v1';
set constraints all immediate;
alter table public.editions validate constraint square_campaign_terms;
set constraints all deferred;
create or replace function public.admin_create_square_campaign(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform private.require_admin();
 if (p->>'unit_price_cents')::integer is distinct from 39900 or p->>'double_price_cents' is not null
  or p->>'layout_template' is distinct from 'amazingmail-9x6-ten-square-draft' then
  raise exception using errcode='MVP01',message='square_price_is_fixed';
 end if;
 v_id:=public.admin_create_campaign(p,private.square_slots());
 update public.editions set product_model='square_v1',category_exclusivity=false where id=v_id;
 perform private.log_event('campaign.square_product','campaign',v_id::text,jsonb_build_object('price_cents',39900,'paid_positions',10));
 return v_id;
end $$;
create or replace function private.square_cart_artwork_ready(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookings where cart_id=c)
 and not exists(
 select 1 from public.bookings b left join public.booking_artwork a on a.booking_id=b.id
 where b.cart_id=c and (a.id is null or a.status<>'ready'
 or a.crop_x is null or a.crop_y is null or a.crop_width is null or a.crop_height is null or a.zoom is null
 or a.width_px is null or a.height_px is null or a.crop_width<=0 or a.crop_height<=0
 or a.crop_x<0 or a.crop_y<0 or a.crop_x+a.crop_width>a.width_px or a.crop_y+a.crop_height>a.height_px
 or abs(a.crop_width-a.crop_height)>1))
$$;
create or replace function private.edition_is_full(p_edition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists(select 1 from public.editions where id=p_edition_id and product_model='square_v1') then
   (select count(*)=10 from public.slots s where s.edition_id=p_edition_id)
   and (select count(*)=10 from public.booking_slots bs join public.bookings b on b.id=bs.booking_id
    join public.slots s on s.id=bs.slot_id and s.edition_id=b.edition_id
    where b.edition_id=p_edition_id and bs.released_at is null and b.status not in ('pending','released','cancelled')
    and b.size='standard' and b.price_cents=39900)
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
$$;
create or replace function private.check_zone_collection(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.editions; n integer;
begin
 select * into e from public.editions where id=p_id for update;
 if not found or e.product_model<>'square_v1' or e.status<>'closed' or e.reservations_paused_at is not null then raise exception 'zone_must_be_closed'; end if;
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
 b.status<>'reserved' or b.confirmed_at is null or b.size<>'standard' or b.price_cents<>39900 or b.flagged_at is not null
 or b.stripe_customer_id is null or b.stripe_payment_method_id is null or b.stripe_setup_status in ('failed','canceled')
 or b.stripe_customer_id like 'cus_devtest_%' or b.stripe_payment_method_id like 'pm_devtest_%'
 or (select count(*) from public.booking_slots bs join public.slots s on s.id=bs.slot_id where bs.booking_id=b.id and bs.released_at is null and s.edition_id=p_id and s.blocked_at is null)<>1
 or a.id is null or a.status<>'ready' or a.review_status<>'approved' or a.crop_width is null or a.crop_height is null or a.crop_width<=0 or abs(a.crop_width-a.crop_height)>1 or a.crop_x is null or a.crop_y is null or a.zoom is null
 or not exists(select 1 from public.payment_consents c where c.booking_id=b.id and c.amount_cents=39900 and c.currency='usd' and c.terms_version='square-zones-v1')
 )) then raise exception 'reservation_not_ready'; end if;
 if (select count(distinct bs.slot_id) from public.booking_slots bs join public.bookings b on b.id=bs.booking_id where b.edition_id=p_id and b.status='reserved' and bs.released_at is null)<>10 then raise exception 'inventory_conflict'; end if;
end $$;
notify pgrst, 'reload schema';
