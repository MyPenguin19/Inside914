-- Additive collection ledger. Exactly one PaymentIntent per booking; recovery reuses it.
create table public.zone_charges (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.bookings(id),
 edition_id uuid not null references public.editions(id),
 consent_id uuid not null references public.payment_consents(id),
 amount_cents integer not null check(amount_cents=39900),
 customer_id text not null, payment_method_id text not null,
 payment_intent_id text unique,
 status text not null default 'pending' check(status in ('pending','processing','requires_action','requires_payment_method','succeeded','canceled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 recovery_hash text unique, recovery_expires_at timestamptz,
 last_event_at bigint not null default 0,
 failure_code text
);
alter table public.zone_charges enable row level security;
revoke all on public.zone_charges from anon,authenticated;
grant select on public.zone_charges to authenticated;
create policy zone_charges_admin_read on public.zone_charges for select to authenticated using(exists(select 1 from public.admins where user_id=auth.uid()));
create table public.zone_payment_events(id text primary key,charge_id uuid not null references public.zone_charges(id),created_at timestamptz not null default now());
alter table public.zone_payment_events enable row level security;
revoke all on public.zone_payment_events from anon,authenticated;
grant all on public.zone_charges,public.zone_payment_events to service_role;

create function private.check_zone_collection(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
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
 if (select count(distinct category_id) from public.bookings where edition_id=p_id and status='reserved')<>10 then raise exception 'category_conflict'; end if;
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
revoke all on function private.check_zone_collection(uuid) from public,anon,authenticated;

create function public.admin_collection_preview(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if exists(select 1 from public.zone_charges where edition_id=p_id) then return jsonb_build_object('ready',true,'existing',true); end if;
 begin perform private.check_zone_collection(p_id);
 exception when others then return jsonb_build_object('ready',false,'reason',sqlerrm); end;
 return jsonb_build_object('ready',true,'existing',false);
end $$;

create function public.admin_prepare_zone_collection(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 perform 1 from public.editions where id=p_id for update;
 if not exists(select 1 from public.zone_charges where edition_id=p_id) then
  perform private.check_zone_collection(p_id);
  insert into public.zone_charges(booking_id,edition_id,consent_id,amount_cents,customer_id,payment_method_id,created_by)
  select b.id,b.edition_id,c.id,39900,b.stripe_customer_id,b.stripe_payment_method_id,auth.uid()
  from public.bookings b cross join lateral(select id from public.payment_consents where booking_id=b.id and amount_cents=39900 and currency='usd' and terms_version='square-zones-v1' order by consented_at desc limit 1)c
  where b.edition_id=p_id and b.status='reserved';
  update public.editions set status='approved_to_print',updated_at=now() where id=p_id;
  insert into public.admin_events(admin_user_id,event_type,target_type,target_id,details) values(auth.uid(),'zone_collection_authorized','edition',p_id,jsonb_build_object('reservations',10,'amount_per_reservation',39900));
 end if;
 return (select jsonb_agg(to_jsonb(c) order by c.id) from public.zone_charges c where edition_id=p_id);
end $$;
revoke all on function public.admin_collection_preview(uuid),public.admin_prepare_zone_collection(uuid) from public,anon;
grant execute on function public.admin_collection_preview(uuid),public.admin_prepare_zone_collection(uuid) to authenticated;

-- Signed webhook processing is transactional: duplicates and success cannot roll back.
create function public.record_zone_payment(p_charge uuid,p_intent text,p_status text,p_event text,p_created bigint,p_failure text default null) returns text language plpgsql security definer set search_path='' as $$
declare c public.zone_charges;
begin
 select * into c from public.zone_charges where id=p_charge for update;
 if not found or (c.payment_intent_id is not null and c.payment_intent_id<>p_intent) then raise exception 'intent_mismatch'; end if;
 if p_status not in ('processing','requires_action','requires_payment_method','succeeded','canceled') then raise exception 'invalid_payment_status'; end if;
 insert into public.zone_payment_events(id,charge_id) values(p_event,p_charge) on conflict do nothing;
 if not found then return 'duplicate'; end if;
 if c.status='succeeded' or p_created<c.last_event_at then return 'stale'; end if;
 update public.zone_charges set payment_intent_id=p_intent,status=p_status,last_event_at=p_created,failure_code=left(p_failure,100),updated_at=now(),
 recovery_expires_at=case when p_status in ('requires_action','requires_payment_method') then coalesce(recovery_expires_at,now()+interval '3 days') else recovery_expires_at end,
 recovery_hash=case when p_status='succeeded' then null else recovery_hash end where id=p_charge;
 update public.bookings set status=case when p_status='succeeded' then 'charged' when p_status in ('requires_action','requires_payment_method','canceled') then 'charge_failed' else status end where id=c.booking_id;
 insert into public.admin_events(admin_user_id,event_type,target_type,target_id,details) values(null,'zone_payment_'||p_status,'booking',c.booking_id,jsonb_build_object('charge_id',c.id,'amount_cents',c.amount_cents));
 return 'recorded';
end $$;
revoke all on function public.record_zone_payment(uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.record_zone_payment(uuid,text,text,text,bigint,text) to service_role;

-- Freeze authorized scope while network calls run. Deleting local fixtures must
-- explicitly remove their charge ledger first; customer/admin cancellation cannot.
create function private.guard_collection_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.zone_charges where booking_id=old.id) then
  if tg_op='DELETE' then raise exception 'collection_requires_resolution'; end if;
  if (new.edition_id,new.price_cents,new.category_id,new.stripe_customer_id,new.stripe_payment_method_id) is distinct from (old.edition_id,old.price_cents,old.category_id,old.stripe_customer_id,old.stripe_payment_method_id) or new.status in ('cancelled','released','pending') then raise exception 'collection_requires_resolution'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_collection_booking before update or delete on public.bookings for each row execute function private.guard_collection_booking();
create function private.guard_collection_edition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.zone_charges where edition_id=old.id) then
  if new.status not in ('approved_to_print','printed','mailed','completed') then raise exception 'collection_requires_resolution'; end if;
  if new.status in ('printed','mailed','completed') and exists(select 1 from public.zone_charges where edition_id=old.id and status<>'succeeded') then raise exception 'zone_payments_incomplete'; end if;
 end if;
 return new;
end $$;
create trigger guard_collection_edition before update on public.editions for each row execute function private.guard_collection_edition();
revoke all on function private.guard_collection_booking(),private.guard_collection_edition() from public,anon,authenticated;
