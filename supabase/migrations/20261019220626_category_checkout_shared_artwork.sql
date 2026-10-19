-- A cart keeps one logical artwork source. Storage copies remain independently owned
-- so replacing/deleting a reservation's file cannot delete another reservation's file.
alter table public.booking_artwork add column shared_source_id uuid;

create function public.share_square_cart_artwork(p_token_hash text,p_source_id uuid,p_version timestamptz,p_targets jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare c uuid; source public.booking_artwork; target jsonb; n integer;
begin
 select id into c from public.reservation_carts where token_hash=p_token_hash for update;
 if c is null then raise exception using errcode='ART01',message='no_hold'; end if;
 perform 1 from public.bookings where cart_id=c order by id for update;
 select count(*) into n from public.bookings where cart_id=c;
 if n not between 1 and 4 or exists(select 1 from public.bookings b join public.editions e on e.id=b.edition_id
   where b.cart_id=c and (b.status<>'pending' or b.hold_expires_at<=now() or e.product_model<>'square_v1')) then
  raise exception using errcode='ART01',message='hold_expired';
 end if;
 select a.* into source from public.booking_artwork a join public.bookings b on b.id=a.booking_id
 where a.id=p_source_id and b.cart_id=c and b.id=(select id from public.bookings where cart_id=c order by id limit 1) for update of a;
 if source.id is null or source.updated_at is distinct from p_version or source.status<>'ready'
  or source.crop_width is null or abs(source.crop_width-source.crop_height)>1 then
  raise exception using errcode='ART01',message='artwork_changed';
 end if;
 if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets)<>n-1
  or (select count(distinct t->>'booking_id') from jsonb_array_elements(p_targets)t)<>n-1 then
  raise exception using errcode='ART01',message='invalid_targets';
 end if;
 for target in select value from jsonb_array_elements(p_targets) loop
  if not exists(select 1 from public.bookings where id=(target->>'booking_id')::uuid and cart_id=c and id<>source.booking_id)
   or target->>'path' is null or target->>'path' !~ ('^'||(target->>'booking_id')||'/[a-f0-9-]{36}$') then
   raise exception using errcode='ART01',message='invalid_targets';
  end if;
  insert into public.booking_artwork(booking_id,storage_path,status,content_type,byte_size,width_px,height_px,crop_x,crop_y,crop_width,crop_height,zoom,shared_source_id,review_status)
   values((target->>'booking_id')::uuid,target->>'path','ready',source.content_type,source.byte_size,source.width_px,source.height_px,source.crop_x,source.crop_y,source.crop_width,source.crop_height,source.zoom,source.id,'pending')
   on conflict(booking_id) do update set storage_path=excluded.storage_path,status=excluded.status,content_type=excluded.content_type,
    byte_size=excluded.byte_size,width_px=excluded.width_px,height_px=excluded.height_px,crop_x=excluded.crop_x,crop_y=excluded.crop_y,
    crop_width=excluded.crop_width,crop_height=excluded.crop_height,zoom=excluded.zoom,shared_source_id=excluded.shared_source_id,review_status='pending',updated_at=now();
 end loop;
 update public.booking_artwork set shared_source_id=id,review_status='pending' where id=source.id;
end $$;
revoke all on function public.share_square_cart_artwork(text,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.share_square_cart_artwork(text,uuid,timestamptz,jsonb) to service_role;

create function private.square_cart_artwork_ready(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookings where cart_id=c)
 and not exists(
 select 1 from public.bookings b left join public.booking_artwork a on a.booking_id=b.id
 left join public.booking_artwork source on source.id=a.shared_source_id
 left join public.bookings owner on owner.id=source.booking_id
 where b.cart_id=c and (a.id is null or source.id is null or owner.cart_id is distinct from c
  or a.status<>'ready' or source.status<>'ready' or a.shared_source_id is distinct from source.shared_source_id
  or source.booking_id<>(select id from public.bookings where cart_id=c order by id limit 1)
  or a.crop_width is null or abs(a.crop_width-a.crop_height)>1
  or (a.crop_x,a.crop_y,a.crop_width,a.crop_height,a.zoom,a.width_px,a.height_px,a.byte_size)
    is distinct from (source.crop_x,source.crop_y,source.crop_width,source.crop_height,source.zoom,source.width_px,source.height_px,source.byte_size)))
$$;
revoke all on function private.square_cart_artwork_ready(uuid) from public,anon,authenticated;
grant execute on function private.square_cart_artwork_ready(uuid) to service_role;
create function private.guard_shared_artwork_confirmation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='reserved' and old.status='pending' and new.cart_id is not null
 and exists(select 1 from public.editions where id=new.edition_id and product_model='square_v1')
 and not private.square_cart_artwork_ready(new.cart_id) then
  raise exception using errcode='ART01',message='shared_artwork_required';
 end if;
 return new;
end $$;
create trigger guard_shared_artwork_confirmation before update on public.bookings for each row execute function private.guard_shared_artwork_confirmation();
revoke all on function private.guard_shared_artwork_confirmation() from public,anon,authenticated;
notify pgrst,'reload schema';

-- Serialize artwork changes with confirmation; a stale editor cannot alter a
-- confirmed square reservation while its setup completion is being processed.
create function private.guard_square_artwork_edit() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
 if tg_op='UPDATE' and (new.storage_path,new.status,new.crop_x,new.crop_y,new.crop_width,new.crop_height,new.zoom,new.shared_source_id)
  is not distinct from (old.storage_path,old.status,old.crop_x,old.crop_y,old.crop_width,old.crop_height,old.zoom,old.shared_source_id) then return new; end if;
 select bookings.* into b from public.bookings join public.editions e on e.id=bookings.edition_id
 where bookings.id=coalesce(new.booking_id,old.booking_id) and e.product_model='square_v1' for update of bookings;
 if found and b.status not in ('pending','released','cancelled') then raise exception using errcode='ART01',message='reservation_locked'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger guard_square_artwork_edit before insert or update or delete on public.booking_artwork for each row execute function private.guard_square_artwork_edit();
revoke all on function private.guard_square_artwork_edit() from public,anon,authenticated;
