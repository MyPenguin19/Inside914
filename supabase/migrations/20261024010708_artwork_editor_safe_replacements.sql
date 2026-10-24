-- Stage replacements without changing the active artwork. Retain every committed original.
-- Only abandoned, never-committed uploads are eligible for authenticated cleanup.
create table public.artwork_uploads (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid, -- Deliberately not cascaded: originals survive reservation deletion.
 bucket text not null check(bucket in ('artwork','house-artwork')),
 storage_path text not null,
 original_path text,
 status text not null default 'uploading' check(status in ('uploading','ready','retained','deleting')),
 base_updated_at timestamptz,
 content_type text check(content_type in ('image/png','image/jpeg')),
 byte_size integer check(byte_size>0),
 width_px integer check(width_px>0),
 height_px integer check(height_px>0),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp(),
 unique(bucket,storage_path),
 check((bucket='artwork' and booking_id is not null and original_path is null) or
       (bucket='house-artwork' and booking_id is null))
);
create index artwork_uploads_booking on public.artwork_uploads(booking_id);
create index artwork_uploads_cleanup on public.artwork_uploads(created_at) where status<>'retained';
alter table public.artwork_uploads enable row level security;
revoke all on public.artwork_uploads from public,anon,authenticated;
grant select on public.artwork_uploads to authenticated;
grant all on public.artwork_uploads to service_role;
create policy "admins read retained artwork" on public.artwork_uploads for select to authenticated
 using ((select private.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('house-artwork-originals','house-artwork-originals',false,3000000,array['image/png','image/jpeg']);
-- No client storage policies. Originals are private and never overwritten by the renderer.

-- Also retain pre-migration artwork as it is replaced/deleted, without changing active records.
create function private.retain_artwork_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb; b text; saved record;
begin
 b:=case when tg_table_name='house_artwork' then 'house-artwork' else 'artwork' end;
 for r in select v from unnest(case when tg_op='INSERT' then array[to_jsonb(new)]
   when tg_op='DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end) v loop
   if b='artwork' and r->>'status'<>'ready' then continue; end if;
   insert into public.artwork_uploads(booking_id,bucket,storage_path,status,width_px,height_px,content_type,byte_size,metadata)
    values((r->>'booking_id')::uuid,b,r->>'storage_path','retained',(r->>'width_px')::integer,
           (r->>'height_px')::integer,r->>'content_type',(r->>'byte_size')::integer,r)
    on conflict(bucket,storage_path) do update set status='retained'
      where artwork_uploads.status<>'deleting'
    returning * into saved;
   if not found then raise exception 'This abandoned upload is being cleaned up. Upload it again.'; end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.retain_artwork_source() from public,anon,authenticated;
create trigger retain_booking_artwork before insert or update or delete on public.booking_artwork
 for each row execute function private.retain_artwork_source();
create trigger retain_house_artwork before insert or update or delete on public.house_artwork
 for each row execute function private.retain_artwork_source();

-- Register the existing private originals without changing bookings, crops or approvals.
insert into public.artwork_uploads(id,booking_id,bucket,storage_path,status,width_px,height_px,content_type,byte_size,metadata)
 select id,booking_id,'artwork',storage_path,'retained',width_px,height_px,content_type,byte_size,to_jsonb(a)
 from public.booking_artwork a where status='ready';
insert into public.artwork_uploads(bucket,storage_path,status,width_px,height_px,metadata)
 select 'house-artwork',storage_path,'retained',width_px,height_px,to_jsonb(h) from public.house_artwork h;

-- The hold capability is checked again under a row lock at the commit boundary.
-- The existing cart/square guards and artwork validation remain in force.
create function public.save_staged_artwork(p_token_hash text,p_upload_id uuid,p_crop jsonb,p_zoom numeric,
 p_crop_approved boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.bookings; u public.artwork_uploads; a public.booking_artwork; e public.editions;
 x integer; y integer; w integer; h integer;
begin
 select * into b from public.bookings where hold_token_hash=p_token_hash;
 if not found then raise exception using errcode='INS05',message='no_hold'; end if;
 -- Match cart confirmation's stable lock order; expired siblings cannot commit artwork.
 perform 1 from public.bookings where id=b.id or (b.cart_id is not null and cart_id=b.cart_id) order by id for update;
 if exists(select 1 from public.bookings where (id=b.id or (b.cart_id is not null and cart_id=b.cart_id))
   and (status<>'pending' or hold_expires_at<=clock_timestamp())) then
   raise exception using errcode='INS06',message='hold_expired'; end if;
 select * into a from public.booking_artwork where booking_id=b.id for update;
 select * into u from public.artwork_uploads where id=p_upload_id and booking_id=b.id and bucket='artwork' for update;
 if not found or u.status not in ('ready','retained') then raise exception 'upload_not_ready'; end if;
 if u.status='retained' and a.storage_path is distinct from u.storage_path then
   raise exception using errcode='ART01',message='artwork_changed'; end if;
 if u.status='ready' and a.updated_at is distinct from u.base_updated_at then
   raise exception using errcode='ART01',message='artwork_changed'; end if;
 if u.width_px is null or u.height_px is null or u.content_type is null or u.byte_size is null or
   not exists(select 1 from storage.objects where bucket_id='artwork' and name=u.storage_path) then
   raise exception 'upload_missing'; end if;
 x:=(p_crop->>'x')::integer; y:=(p_crop->>'y')::integer;
 w:=(p_crop->>'width')::integer; h:=(p_crop->>'height')::integer;
 if x is null or y is null or w is null or h is null or x<0 or y<0 or w<=0 or h<=0 or
   x+w>u.width_px or y+h>u.height_px or p_zoom is null or p_zoom<1 or p_zoom>10 then
   raise exception 'invalid_crop'; end if;
 select * into e from public.editions where id=b.edition_id;
 if e.product_model='square_v1' and e.layout_template<>'amazingmail-9x6-v2' and abs(w-h)>1 then
   raise exception 'invalid_crop'; end if;
 if e.layout_template='amazingmail-9x6-v2' and (x>0 or y>0 or w<u.width_px or h<u.height_px)
   and not coalesce(p_crop_approved,false) then
   raise exception using errcode='ART02',message='crop_approval_required'; end if;
 insert into public.booking_artwork(id,booking_id,storage_path,status,content_type,byte_size,width_px,height_px,
   crop_x,crop_y,crop_width,crop_height,zoom)
 values(u.id,b.id,u.storage_path,'ready',u.content_type,u.byte_size,u.width_px,u.height_px,x,y,w,h,p_zoom)
 on conflict(booking_id) do update set storage_path=excluded.storage_path,status='ready',
   content_type=excluded.content_type,byte_size=excluded.byte_size,width_px=excluded.width_px,height_px=excluded.height_px,
   crop_x=x,crop_y=y,crop_width=w,crop_height=h,zoom=p_zoom,review_status='pending',
   reviewed_at=null,reviewed_by=null,review_note=null,shared_source_id=null,updated_at=clock_timestamp();
 update public.artwork_uploads set metadata=metadata||jsonb_build_object('crop',p_crop,'zoom',p_zoom,'crop_approved',p_crop_approved)
 where id=u.id;
end $$;
revoke all on function public.save_staged_artwork(text,uuid,jsonb,numeric,boolean) from public,anon,authenticated;
grant execute on function public.save_staged_artwork(text,uuid,jsonb,numeric,boolean) to service_role;

create function public.admin_activate_house_artwork(p_upload_id uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare u public.artwork_uploads; a public.house_artwork;
begin
 perform private.require_admin();
 -- Serializes first upload too, when no singleton exists yet.
 perform pg_advisory_xact_lock(hashtextextended('inside914-house-artwork',0));
 select * into a from public.house_artwork where singleton for update;
 select * into u from public.artwork_uploads where id=p_upload_id and bucket='house-artwork' for update;
 if not found or u.status not in ('ready','retained') then raise exception 'upload_not_ready'; end if;
 if a.storage_path=u.storage_path then return a.updated_at; end if;
 if a.updated_at is distinct from u.base_updated_at then
   raise exception using errcode='ART01',message='House artwork changed. Reload Settings before replacing it.'; end if;
 if u.original_path is null or not exists(select 1 from storage.objects where bucket_id='house-artwork-originals' and name=u.original_path)
   or not exists(select 1 from storage.objects where bucket_id='house-artwork' and name=u.storage_path) then
   raise exception 'house_file_missing'; end if;
 perform public.admin_set_house_artwork(u.storage_path,u.width_px,u.height_px);
 return (select updated_at from public.house_artwork where singleton);
end $$;
revoke all on function public.admin_activate_house_artwork(uuid) from public,anon;
grant execute on function public.admin_activate_house_artwork(uuid) to authenticated;

-- Claim before removing files: retaining a claimed path is rejected by the triggers above.
-- Wait 24h, longer than a signed upload URL's 2h validity. Retry incomplete deletions.
create function public.claim_abandoned_artwork() returns setof public.artwork_uploads
language plpgsql security invoker set search_path='' as $$
begin
 return query with candidates as (
   select u.id from public.artwork_uploads u where u.status<>'retained'
    and u.created_at<clock_timestamp()-interval '24 hours'
    and not exists(select 1 from public.booking_artwork a where a.storage_path=u.storage_path)
    and not exists(select 1 from public.house_artwork a where a.storage_path=u.storage_path)
    order by u.created_at limit 100 for update skip locked
 ) update public.artwork_uploads u set status='deleting' from candidates c where u.id=c.id returning u.*;
end $$;
revoke all on function public.claim_abandoned_artwork() from public,anon,authenticated;
grant execute on function public.claim_abandoned_artwork() to service_role;
notify pgrst, 'reload schema';
