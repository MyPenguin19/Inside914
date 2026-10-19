-- Fail closed on partially missing crop metadata, including direct service calls.
create or replace function public.share_square_cart_artwork(p_token_hash text,p_source_id uuid,p_version timestamptz,p_targets jsonb)
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
  or source.crop_x is null or source.crop_y is null or source.crop_width is null or source.crop_height is null or source.zoom is null or abs(source.crop_width-source.crop_height)>1 then
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

create or replace function private.square_cart_artwork_ready(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookings where cart_id=c)
 and not exists(
 select 1 from public.bookings b left join public.booking_artwork a on a.booking_id=b.id
 left join public.booking_artwork source on source.id=a.shared_source_id
 left join public.bookings owner on owner.id=source.booking_id
 where b.cart_id=c and (a.id is null or source.id is null or owner.cart_id is distinct from c
  or a.status<>'ready' or source.status<>'ready' or a.shared_source_id is distinct from source.shared_source_id
  or source.booking_id<>(select id from public.bookings where cart_id=c order by id limit 1)
  or a.crop_x is null or a.crop_y is null or a.crop_width is null or a.crop_height is null or a.zoom is null or abs(a.crop_width-a.crop_height)>1
  or (a.crop_x,a.crop_y,a.crop_width,a.crop_height,a.zoom,a.width_px,a.height_px,a.byte_size)
    is distinct from (source.crop_x,source.crop_y,source.crop_width,source.crop_height,source.zoom,source.width_px,source.height_px,source.byte_size)))
$$;
