-- Phase 6.15B. Account-free requests/recovery, deduplicated owner attention, bounded cart holds.
create table public.reservation_recoveries (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'), expires_at timestamptz not null,
 used_at timestamptz, created_at timestamptz not null default now()
);
alter table public.reservation_recoveries enable row level security;
revoke all on public.reservation_recoveries from anon,authenticated;
grant all on public.reservation_recoveries to service_role;
create index reservation_recoveries_booking on public.reservation_recoveries(booking_id);

create table public.customer_requests (
 id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id) on delete cascade,
 kind text not null check(kind in ('artwork_change','cancellation')),message text not null check(length(message) between 1 and 1000),
 status text not null default 'open' check(status in ('open','resolved','declined')),
 created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references auth.users(id),response text
);
create unique index customer_requests_open on public.customer_requests(booking_id,kind) where status='open';
alter table public.customer_requests enable row level security;
revoke all on public.customer_requests from anon,authenticated;
grant select on public.customer_requests to authenticated;
grant all on public.customer_requests to service_role;
create policy "admins read customer requests" on public.customer_requests for select to authenticated using((select private.is_admin()));

create table public.operational_alerts (
 id uuid primary key default gen_random_uuid(),logical_key text not null unique,kind text not null,title text not null,
 href text not null check(href like '/admin%'),created_at timestamptz not null default now(),resolved_at timestamptz,
 delivery_id uuid references public.email_deliveries(id) on delete set null
);
alter table public.operational_alerts enable row level security;
revoke all on public.operational_alerts from anon,authenticated;
grant select on public.operational_alerts to authenticated;
grant all on public.operational_alerts to service_role;
create policy "admins read operational alerts" on public.operational_alerts for select to authenticated using((select private.is_admin()));

create function public.consume_reservation_recovery(p_hash text,p_session_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.reservation_recoveries;
begin
 select * into r from public.reservation_recoveries where token_hash=p_hash for update;
 if not found or r.used_at is not null or r.expires_at<=now() then return null; end if;
 insert into public.booking_access_tokens(booking_id,token_hash,expires_at) values(r.booking_id,p_session_hash,now()+interval '180 days');
 update public.reservation_recoveries set used_at=now() where id=r.id;
 return r.booking_id;
end $$;
revoke all on function public.consume_reservation_recovery(text,text) from public,anon,authenticated;
grant execute on function public.consume_reservation_recovery(text,text) to service_role;

create function public.submit_customer_request(p_hash text,p_kind text,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.bookings; e public.editions; result uuid;
begin
 select booking.* into b from public.bookings booking join public.booking_access_tokens t on t.booking_id=booking.id
 where t.token_hash=p_hash and t.revoked_at is null and t.expires_at>now();
 if not found or b.status in ('pending','released','cancelled') then raise exception 'reservation_unavailable'; end if;
 select * into e from public.editions where id=b.edition_id for share;
 if p_kind='artwork_change' and (e.status not in ('open','closed') or now()>=coalesce(e.artwork_due_at,e.artwork_deadline)
   or exists(select 1 from public.zone_charges where edition_id=e.id)) then raise exception 'artwork_locked'; end if;
 if p_kind not in ('artwork_change','cancellation') or length(trim(p_message)) not between 1 and 1000 then raise exception 'invalid_request'; end if;
 select * into b from public.bookings where id=b.id for update;
 if b.status in ('pending','released','cancelled') then raise exception 'reservation_unavailable'; end if;
 select id into result from public.customer_requests where booking_id=b.id and kind=p_kind and status='open';
 if result is not null then return result; end if;
 if (select count(*) from public.customer_requests where booking_id=b.id and created_at>now()-interval '1 day')>=5 then raise exception 'request_limit'; end if;
 insert into public.customer_requests(booking_id,kind,message) values(b.id,p_kind,trim(p_message)) returning id into result;
 insert into public.operational_alerts(logical_key,kind,title,href)
 values('request:'||result,p_kind,case when p_kind='artwork_change' then 'Artwork change requested' else 'Cancellation requested' end,'/admin/advertisers/'||b.id);
 return result;
end $$;
revoke all on function public.submit_customer_request(text,text,text) from public,anon,authenticated;
grant execute on function public.submit_customer_request(text,text,text) to service_role;

create function public.admin_resolve_customer_request(p_id uuid,p_status text,p_response text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.customer_requests;
begin
 perform private.require_admin();
 if p_status not in ('resolved','declined') or length(trim(p_response)) not between 1 and 1000 then raise exception 'invalid_resolution'; end if;
 select * into r from public.customer_requests where id=p_id for update;
 if not found or r.status<>'open' then return; end if;
 update public.customer_requests set status=p_status,response=trim(p_response),resolved_at=now(),resolved_by=auth.uid() where id=p_id;
 update public.operational_alerts set resolved_at=now() where logical_key='request:'||p_id;
 perform private.log_event('customer_request.'||p_status,'booking',r.booking_id::text,jsonb_build_object('request_id',p_id,'response',trim(p_response)));
end $$;
revoke all on function public.admin_resolve_customer_request(uuid,text,text) from public,anon;
grant execute on function public.admin_resolve_customer_request(uuid,text,text) to authenticated;

create function private.notify_reservation_confirmed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='reserved' and old.status is distinct from new.status then
  insert into public.operational_alerts(logical_key,kind,title,href) values
   ('reservation:'||new.id,'reservation','New confirmed reservation','/admin/advertisers/'||new.id),
   ('review:'||new.id,'artwork','Artwork requires review','/admin/artwork?campaign='||new.edition_id)
   on conflict(logical_key) do nothing;
 end if;
 return new;
end $$;
create trigger notify_reservation_confirmed after update of status on public.bookings for each row execute function private.notify_reservation_confirmed();

alter table public.artwork_uploads add column cleanup_failures integer not null default 0;
create function public.note_artwork_cleanup_failure(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.artwork_uploads set cleanup_failures=cleanup_failures+1 where id=p_id and status='deleting';
 insert into public.operational_alerts(logical_key,kind,title,href)
 select 'cleanup:'||id,'cleanup','Artwork cleanup repeatedly failed','/admin/settings' from public.artwork_uploads where id=p_id and cleanup_failures>=3
 on conflict(logical_key) do nothing;
end $$;
revoke all on function public.note_artwork_cleanup_failure(uuid) from public,anon,authenticated;
grant execute on function public.note_artwork_cleanup_failure(uuid) to service_role;

create function public.refresh_operational_alerts() returns void language plpgsql security definer set search_path='' as $$
declare e record; filled integer;
begin
 for e in select id,name,artwork_deadline,status from public.editions where archived_at is null and status in ('open','closed','approved_to_print') loop
  select count(*) into filled from public.booking_slots s join public.bookings b on b.id=s.booking_id
  where b.edition_id=e.id and b.status not in ('pending','released','cancelled') and s.released_at is null;
  if filled=10 then
   insert into public.operational_alerts(logical_key,kind,title,href) values('full:'||e.id,'preparation','Campaign full: review artwork, payment and printer preparation','/admin/campaigns/'||e.id) on conflict(logical_key) do nothing;
  elsif e.artwork_deadline<=now() then
   insert into public.operational_alerts(logical_key,kind,title,href) values('deadline:'||e.id||':'||e.artwork_deadline,'deadline','Campaign deadline passed: extend or cancel','/admin/campaigns/'||e.id||'#status-title') on conflict(logical_key) do nothing;
  elsif e.artwork_deadline<=now()+interval '3 days' then
   insert into public.operational_alerts(logical_key,kind,title,href) values('soon:'||e.id||':'||e.artwork_deadline,'deadline','Campaign deadline approaching','/admin/campaigns/'||e.id) on conflict(logical_key) do nothing;
  end if;
 end loop;
 insert into public.operational_alerts(logical_key,kind,title,href)
 select 'email:'||d.id,'email','Transactional email needs investigation',case when o.booking_id is not null then '/admin/advertisers/'||o.booking_id else '/admin' end
 from public.email_deliveries d left join public.email_outbox o on o.id=d.outbox_id
 where d.status='investigation' or (d.status='failed' and d.attempts>=3)
 on conflict(logical_key) do nothing;
end $$;
revoke all on function public.refresh_operational_alerts() from public,anon,authenticated;
grant execute on function public.refresh_operational_alerts() to service_role;

create function public.admin_acknowledge_alert(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 update public.operational_alerts set resolved_at=now() where id=p_id and resolved_at is null;
 perform private.log_event('alert.acknowledged','operational_alert',p_id::text,'{}'::jsonb);
end $$;
revoke all on function public.admin_acknowledge_alert(uuid) from public,anon;
grant execute on function public.admin_acknowledge_alert(uuid) to authenticated;

alter table public.reservation_carts add column hold_extensions integer not null default 0 check(hold_extensions between 0 and 1);
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
 -- A shared window starts only after all selected positions have been atomically claimed.
 update public.bookings set hold_expires_at=least(now()+interval '30 minutes',
  (select min(e.artwork_deadline) from public.editions e join public.bookings b on b.edition_id=e.id where b.cart_id=v_cart))
 where cart_id=v_cart;
 return v_cart;
end $function$;

create function public.extend_cart_hold(p_hash text) returns timestamptz language plpgsql security definer set search_path='' as $$
declare cart uuid; expires timestamptz; deadline timestamptz; created timestamptz; extensions integer;
begin
 select id into cart from public.reservation_carts where token_hash=p_hash;
 if cart is null then select cart_id into cart from public.bookings where hold_token_hash=p_hash; end if;
 if cart is null then raise exception 'hold_unavailable'; end if;
 -- Same slot-first ordering as hold_cart and normal holds; no resurrection of expired claims.
 perform 1 from public.slots s join public.booking_slots bs on bs.slot_id=s.id join public.bookings b on b.id=bs.booking_id
 where b.cart_id=cart order by s.id for update of s;
 perform 1 from public.bookings where cart_id=cart order by id for update;
 select c.hold_extensions,c.created_at into extensions,created from public.reservation_carts c where id=cart for update;
 select min(b.hold_expires_at),min(e.artwork_deadline) into expires,deadline from public.bookings b join public.editions e on e.id=b.edition_id where b.cart_id=cart;
 if expires is null or expires<=now() or exists(select 1 from public.bookings b where b.cart_id=cart and (b.status<>'pending' or not private.edition_is_bookable(b.edition_id))) then raise exception 'hold_expired'; end if;
 if extensions>=1 then raise exception 'extension_limit'; end if;
 if expires>now()+interval '5 minutes' then raise exception 'extension_too_early'; end if;
 expires:=least(expires+interval '15 minutes',created+interval '45 minutes',deadline);
 if expires<=now() then raise exception 'hold_expired'; end if;
 update public.reservation_carts set hold_extensions=1 where id=cart;
 update public.bookings set hold_expires_at=expires,hold_extensions=1,updated_at=now() where cart_id=cart;
 return expires;
end $$;
revoke all on function public.extend_cart_hold(text) from public,anon,authenticated;
grant execute on function public.extend_cart_hold(text) to service_role;
notify pgrst,'reload schema';
