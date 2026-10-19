alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check(kind in ('reservation_confirmed','reservation_cancelled','campaign_cancelled_not_full','payment_needed','payment_receipt'));
create or replace function public.record_zone_payment(p_charge uuid,p_intent text,p_status text,p_event text,p_created bigint,p_failure text default null) returns text language plpgsql security definer set search_path='' as $$
declare c public.zone_charges;
begin
 select * into c from public.zone_charges where id=p_charge for update;
 if not found or (c.payment_intent_id is not null and c.payment_intent_id<>p_intent) then raise exception 'intent_mismatch'; end if;
 if p_status not in ('processing','requires_action','requires_payment_method','succeeded','canceled') then raise exception 'invalid_payment_status'; end if;
 insert into public.zone_payment_events(id,charge_id) values(p_event,p_charge) on conflict do nothing;
 if not found then return 'duplicate'; end if;
 if c.status='succeeded' or (p_status<>'succeeded' and p_created<c.last_event_at) then return 'stale'; end if;
 update public.zone_charges set payment_intent_id=p_intent,status=p_status,last_event_at=p_created,failure_code=left(p_failure,100),updated_at=now(),
 recovery_expires_at=case when p_status in ('requires_action','requires_payment_method') then coalesce(recovery_expires_at,now()+interval '3 days') else recovery_expires_at end,
 recovery_hash=case when p_status='succeeded' then null else recovery_hash end where id=p_charge;
 update public.bookings set status=case when p_status='succeeded' then 'charged' when p_status in ('requires_action','requires_payment_method','canceled') then 'charge_failed' else status end where id=c.booking_id;
 if p_status in ('succeeded','requires_action','requires_payment_method') then
  insert into public.email_outbox(booking_id,kind) values(c.booking_id,case when p_status='succeeded' then 'payment_receipt' else 'payment_needed' end) on conflict(booking_id,kind) do nothing;
 end if;
 insert into public.admin_events(admin_user_id,event_type,target_type,target_id,details) values(null,'zone_payment_'||p_status,'booking',c.booking_id,jsonb_build_object('charge_id',c.id,'amount_cents',c.amount_cents));
 return 'recorded';
end $$;

create function private.guard_collection_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.zone_charges where booking_id=coalesce(old.booking_id,new.booking_id)) then raise exception 'collection_inventory_frozen'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_collection_claim before insert or update or delete on public.booking_slots for each row execute function private.guard_collection_claim();
create function private.guard_collection_art_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.zone_charges where booking_id=old.booking_id) and new.review_status is distinct from old.review_status then raise exception 'collection_artwork_frozen'; end if;
 return new;
end $$;
create trigger guard_collection_art_review before update on public.booking_artwork for each row execute function private.guard_collection_art_review();
revoke all on function private.guard_collection_claim(),private.guard_collection_art_review() from public,anon,authenticated;
