-- Advertiser ownership is separate from administrator roles and from private hold tokens.
create table public.advertiser_bookings (
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index advertiser_bookings_user_idx on public.advertiser_bookings(user_id);
alter table public.advertiser_bookings enable row level security;
revoke all on public.advertiser_bookings from anon,authenticated;
grant select on public.advertiser_bookings to authenticated;
grant all on public.advertiser_bookings to service_role;
create policy advertiser_own_links on public.advertiser_bookings for select to authenticated using(user_id=(select auth.uid()));

create table public.advertiser_artwork_drafts (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique,
 base_updated_at timestamptz,
 status text not null default 'uploading' check(status in ('uploading','ready','applied')),
 content_type text, byte_size integer, width_px integer, height_px integer,
 created_at timestamptz not null default now()
);
create index advertiser_artwork_drafts_booking_idx on public.advertiser_artwork_drafts(booking_id);
create index advertiser_artwork_drafts_user_idx on public.advertiser_artwork_drafts(user_id);
alter table public.advertiser_artwork_drafts enable row level security;
revoke all on public.advertiser_artwork_drafts from anon,authenticated;
grant all on public.advertiser_artwork_drafts to service_role;

create function private.claim_advertiser_bookings() returns integer
language plpgsql security definer set search_path='' as $$
declare v_email text; v_count integer;
begin
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and coalesce(is_anonymous,false)=false;
 if v_email is null then raise exception 'Verified email required'; end if;
 insert into public.advertiser_bookings(booking_id,user_id)
 select b.id,auth.uid() from public.bookings b join public.booking_contacts c on c.booking_id=b.id
 where lower(c.email)=v_email and b.status not in ('pending','released')
 on conflict(booking_id) do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function private.claim_advertiser_bookings() from public,anon;
grant execute on function private.claim_advertiser_bookings() to authenticated;
create function public.claim_advertiser_bookings() returns integer language sql security invoker set search_path='' as $$ select private.claim_advertiser_bookings(); $$;
revoke all on function public.claim_advertiser_bookings() from public,anon;
grant execute on function public.claim_advertiser_bookings() to authenticated;

-- Locks follow admin's booking-then-campaign ordering. Never permit edits after payment/print cutoff.
create function private.advertiser_editable(p_booking uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b public.bookings; e public.editions;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null) or
 not exists(select 1 from public.advertiser_bookings where booking_id=p_booking and user_id=auth.uid()) then raise exception 'Reservation unavailable'; end if;
 select * into b from public.bookings where id=p_booking for update;
 select * into e from public.editions where id=b.edition_id for update;
 if b.status<>'reserved' or e.status not in ('open','closed') or now()>=coalesce(e.artwork_due_at,e.artwork_deadline) then raise exception 'Reservation is locked; contact support'; end if;
end $$;
revoke all on function private.advertiser_editable(uuid) from public,anon,authenticated;

create function private.advertiser_manage(p_booking uuid,p_action text,p jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare d public.advertiser_artwork_drafts; old_art public.booking_artwork; e public.editions;
begin
 perform private.advertiser_editable(p_booking);
 if p_action='contact' then
  if length(trim(p->>'business_name')) not between 1 and 120 or length(trim(p->>'contact_name')) not between 1 and 120 then raise exception 'Invalid contact'; end if;
  -- Email is deliberately immutable here: it must not reassign the reservation or its receipts.
  update public.booking_contacts set business_name=trim(p->>'business_name'),contact_name=trim(p->>'contact_name'),phone=p->>'phone',website=nullif(p->>'website',''),category=nullif(p->>'category',''),updated_at=now() where booking_id=p_booking;
 elsif p_action='cancel' then
  select ed.* into e from public.editions ed join public.bookings b on b.edition_id=ed.id where b.id=p_booking;
  if now()>=e.artwork_deadline then raise exception 'Cancellation deadline passed'; end if;
  update public.bookings set status='cancelled',cancelled_at=now(),cancellation_reason='Canceled by advertiser',updated_at=now() where id=p_booking;
  insert into public.email_outbox(booking_id,kind) values(p_booking,'reservation_cancelled') on conflict(booking_id,kind) do nothing;
 elsif p_action='artwork' then
  select * into d from public.advertiser_artwork_drafts where id=(p->>'draft_id')::uuid and booking_id=p_booking and user_id=auth.uid() and status='ready' for update;
  if not found then raise exception 'Upload unavailable'; end if;
  select * into old_art from public.booking_artwork where booking_id=p_booking for update;
  if old_art.updated_at is distinct from d.base_updated_at then raise exception 'Artwork changed in another session; upload again'; end if;
  if (p->>'x')::numeric is null or (p->>'y')::numeric is null or (p->>'width')::numeric is null or (p->>'height')::numeric is null or (p->>'zoom')::numeric is null or
     (p->>'x')::numeric<0 or (p->>'y')::numeric<0 or (p->>'width')::numeric<=0 or (p->>'height')::numeric<=0 or
     (p->>'x')::numeric+(p->>'width')::numeric>d.width_px+1 or (p->>'y')::numeric+(p->>'height')::numeric>d.height_px+1 or (p->>'zoom')::numeric not between 1 and 4 then raise exception 'Invalid crop'; end if;
  perform set_config('inside914.advertiser_artwork_booking',p_booking::text,true);
  insert into public.booking_artwork(booking_id,storage_path,status,content_type,byte_size,width_px,height_px,crop_x,crop_y,crop_width,crop_height,zoom)
  values(p_booking,d.storage_path,'ready',d.content_type,d.byte_size,d.width_px,d.height_px,(p->>'x')::numeric,(p->>'y')::numeric,(p->>'width')::numeric,(p->>'height')::numeric,(p->>'zoom')::numeric)
  on conflict(booking_id) do update set storage_path=excluded.storage_path,status='ready',content_type=excluded.content_type,byte_size=excluded.byte_size,width_px=excluded.width_px,height_px=excluded.height_px,crop_x=excluded.crop_x,crop_y=excluded.crop_y,crop_width=excluded.crop_width,crop_height=excluded.crop_height,zoom=excluded.zoom,review_status='pending',review_note=null,reviewed_at=null,reviewed_by=null,updated_at=now();
  update public.advertiser_artwork_drafts set status='applied' where id=d.id;
  perform set_config('inside914.advertiser_artwork_booking','',true);
 else raise exception 'Invalid action'; end if;
 return 'done';
end $$;
revoke all on function private.advertiser_manage(uuid,text,jsonb) from public,anon;
grant execute on function private.advertiser_manage(uuid,text,jsonb) to authenticated;
create function public.advertiser_manage(p_booking uuid,p_action text,p jsonb) returns text language sql security invoker set search_path='' as $$ select private.advertiser_manage(p_booking,p_action,p); $$;
revoke all on function public.advertiser_manage(uuid,text,jsonb) from public,anon;
grant execute on function public.advertiser_manage(uuid,text,jsonb) to authenticated;

create or replace function private.guard_cart_artwork() returns trigger
language plpgsql security invoker set search_path='' as $$
declare b public.bookings;
begin
 if tg_op='UPDATE' and row(new.storage_path,new.status,new.crop_x,new.crop_y,new.crop_width,new.crop_height,new.zoom)
 is not distinct from row(old.storage_path,old.status,old.crop_x,old.crop_y,old.crop_width,old.crop_height,old.zoom) then return new; end if;
 select * into b from public.bookings where id=case when tg_op='DELETE' then old.booking_id else new.booking_id end for update;
 if b.cart_id is not null and (b.status<>'pending' or b.hold_expires_at<=now()) then
  if current_setting('inside914.advertiser_artwork_booking',true) is distinct from b.id::text or not exists(select 1 from public.advertiser_bookings where booking_id=b.id and user_id=auth.uid()) then raise exception 'This area hold is no longer editable'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
notify pgrst,'reload schema';
