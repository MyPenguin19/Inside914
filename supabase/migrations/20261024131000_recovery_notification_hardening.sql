-- Phase 6.15D / stage B. Serialize duplicate recovery requests without changing existing access.
create function public.prepare_reservation_recovery(p_booking uuid,p_hash text)
returns table(recovery_id uuid,expires_at timestamptz,created boolean)
language plpgsql security definer set search_path='' as $$
declare r public.reservation_recoveries;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_recovery'; end if;
 perform 1 from public.bookings where id=p_booking and confirmed_at is not null and status not in ('pending','released') for update;
 if not found then return; end if;
 select * into r from public.reservation_recoveries x where x.booking_id=p_booking and x.used_at is null
 and x.created_at>now()-interval '1 minute' and x.expires_at>now()+interval '1 minute' order by x.created_at desc limit 1;
 if found then return query select r.id,r.expires_at,false;return; end if;
 insert into public.reservation_recoveries(booking_id,token_hash,expires_at) values(p_booking,p_hash,now()+interval '15 minutes') returning * into r;
 return query select r.id,r.expires_at,true;
end $$;
revoke all on function public.prepare_reservation_recovery(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_reservation_recovery(uuid,text) to service_role;

create or replace function public.refresh_operational_alerts() returns void language plpgsql security definer set search_path='' as $$
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
 select 'email:'||d.id,case when d.logical_key like 'owner-alert:%' then 'owner_email' else 'email' end,'Transactional email needs investigation',case when o.booking_id is not null then '/admin/advertisers/'||o.booking_id else '/admin' end
 from public.email_deliveries d left join public.email_outbox o on o.id=d.outbox_id
 where d.status='investigation' or (d.status='failed' and (d.attempts>=3 or not d.retry_safe))
 on conflict(logical_key) do nothing;
 insert into public.operational_alerts(logical_key,kind,title,href)
 select 'email-preparation:'||o.id,'email','Reservation email could not be prepared','/admin/advertisers/'||o.booking_id
 from public.email_outbox o where o.status='investigation' or (o.status='failed' and o.last_error='email_preparation_failed')
 on conflict(logical_key) do nothing;
end $$;
revoke all on function public.refresh_operational_alerts() from public,anon,authenticated;
grant execute on function public.refresh_operational_alerts() to service_role;


notify pgrst,'reload schema';

create or replace function public.extend_cart_hold(p_hash text) returns timestamptz language plpgsql security definer set search_path='' as $$
declare cart uuid; expires timestamptz; deadline timestamptz; created timestamptz; extensions integer; old_expiry timestamptz;
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
 old_expiry:=expires;
 expires:=least(expires+interval '15 minutes',created+interval '45 minutes',deadline);
 if expires<=now() then raise exception 'hold_expired'; end if;
 if expires<=old_expiry then raise exception 'campaign_deadline_reached'; end if;
 update public.reservation_carts set hold_extensions=1 where id=cart;
 update public.bookings set hold_expires_at=expires,hold_extensions=1,updated_at=now() where cart_id=cart;
 return expires;
end $$;
revoke all on function public.extend_cart_hold(text) from public,anon,authenticated;
grant execute on function public.extend_cart_hold(text) to service_role;
notify pgrst,'reload schema';
