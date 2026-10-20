-- Local MVP operations: one private house panel, current-state downloads and
-- separately guarded mailing readiness. No payment collection is enabled here.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('house-artwork','house-artwork',false,20000000,array['image/png']) on conflict(id) do nothing;
create table public.house_artwork (
 singleton boolean primary key default true check(singleton),
 storage_path text not null check(storage_path ~ '^house/[0-9a-f-]{36}\.png$'),
 width_px integer not null check(width_px>=1122),
 height_px integer not null check(height_px>=783),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references auth.users(id)
);
alter table public.house_artwork enable row level security;
revoke all on public.house_artwork from anon,authenticated;
grant select on public.house_artwork to authenticated;
grant all on public.house_artwork to service_role;
create policy "admins read house artwork" on public.house_artwork for select to authenticated using ((select private.is_admin()));
-- No client storage policies: all file access passes requireAdmin on the server.
create function public.admin_set_house_artwork(p_path text,p_width integer,p_height integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if not exists(select 1 from storage.objects where bucket_id='house-artwork' and name=p_path) then raise exception 'house_file_missing'; end if;
 insert into public.house_artwork(singleton,storage_path,width_px,height_px,updated_by)
 values(true,p_path,p_width,p_height,auth.uid()) on conflict(singleton) do update
 set storage_path=excluded.storage_path,width_px=excluded.width_px,height_px=excluded.height_px,updated_by=auth.uid(),updated_at=clock_timestamp();
 perform private.log_event('house_artwork.replaced','artwork','house-artwork',jsonb_build_object('storage_path',p_path));
end $$;
revoke all on function public.admin_set_house_artwork(text,integer,integer) from public,anon;
grant execute on function public.admin_set_house_artwork(text,integer,integer) to authenticated;

-- Proof approval is tied to the current house and advertiser content by time.
-- Replacing a house image invalidates old proofs; downloads remain available.
create function private.current_square_proof(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.house_artwork h join storage.objects o on o.bucket_id='house-artwork' and o.name=h.storage_path
 where exists(select 1 from public.mailing_evidence m where m.edition_id=p_id and m.kind='final_proof'
 and m.published_at is not null and m.storage_path is not null
 and m.uploaded_at>=h.updated_at
 and m.uploaded_at >= coalesce((select max(a.updated_at) from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=p_id and b.status not in('pending','released','cancelled')),'epoch'::timestamptz)))
$$;
revoke all on function private.current_square_proof(uuid) from public,anon,authenticated;
alter function private.check_zone_collection(uuid) rename to check_zone_collection_before_house;
create function private.check_zone_collection(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.check_zone_collection_before_house(p_id);
 if not exists(select 1 from public.house_artwork) then raise exception 'house_artwork_required'; end if;
 if not private.current_square_proof(p_id) then raise exception 'current_final_proof_required'; end if;
 if exists(select 1 from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=p_id and b.status='reserved'
 and (a.crop_width<750 or a.crop_height<750 or a.crop_x<0 or a.crop_y<0 or a.width_px is null or a.height_px is null or a.crop_x+a.crop_width>a.width_px or a.crop_y+a.crop_height>a.height_px)) then raise exception 'print_resolution_required'; end if;
end $$;
revoke all on function private.check_zone_collection(uuid) from public,anon,authenticated;

create function private.square_mail_ready(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.editions e join private.approved_layout_templates t on t.template_key=e.layout_template
 where e.id=p_id and e.product_model='square_v1' and e.status in('approved_to_print','printed','mailed','completed')
 and e.reservations_paused_at is null and e.mailing_window_start is not null and e.mailing_window_end>=e.mailing_window_start)
 and (select count(*)=10 from public.slots where edition_id=p_id and blocked_at is null)
 and (select count(*)=10 from public.bookings where edition_id=p_id and status not in('pending','released','cancelled'))
 and (select count(distinct bs.slot_id)=10 from public.bookings b join public.booking_slots bs on bs.booking_id=b.id and bs.released_at is null
 join public.slots s on s.id=bs.slot_id and s.edition_id=p_id and s.blocked_at is null
 join public.booking_artwork a on a.booking_id=b.id
 join public.zone_charges c on c.booking_id=b.id and c.edition_id=p_id
 where b.edition_id=p_id and b.status='charged' and b.price_cents=39900 and b.size='standard' and b.flagged_at is null
 and c.status='succeeded' and c.amount_cents=39900 and c.payment_intent_id is not null
 and a.status='ready' and a.review_status='approved' and a.crop_width>=750 and a.crop_height>=750 and abs(a.crop_width-a.crop_height)<=1
 and a.crop_x>=0 and a.crop_y>=0 and a.crop_x+a.crop_width<=a.width_px and a.crop_y+a.crop_height<=a.height_px
 and exists(select 1 from public.payment_consents pc where pc.id=c.consent_id and pc.booking_id=b.id and pc.amount_cents=39900 and pc.currency='usd' and pc.terms_version='square-zones-v1'))
 and private.current_square_proof(p_id)
$$;
revoke all on function private.square_mail_ready(uuid) from public,anon,authenticated;
create function public.admin_mail_readiness(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin perform private.require_admin(); return private.square_mail_ready(p_id); end $$;
revoke all on function public.admin_mail_readiness(uuid) from public,anon;
grant execute on function public.admin_mail_readiness(uuid) to authenticated;

create function public.admin_mark_square_mailed(p_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare e public.editions;
begin
 perform private.require_admin();
 select * into e from public.editions where id=p_id for update;
 if not found or e.product_model<>'square_v1' then raise exception 'square_campaign_required'; end if;
 if e.status='mailed' then return 'already'; end if;
 if e.status not in('approved_to_print','printed') then raise exception 'campaign_not_ready_to_mail'; end if;
 perform 1 from public.house_artwork for share;
 perform 1 from public.bookings where edition_id=p_id order by id for update;
 perform 1 from public.booking_artwork where booking_id in(select id from public.bookings where edition_id=p_id) for share;
 if not private.square_mail_ready(p_id) then raise exception 'campaign_not_ready_to_mail'; end if;
 update public.editions set status='mailed',updated_at=now() where id=p_id;
 perform private.log_event('campaign.mark_mailed','campaign',p_id::text,jsonb_build_object('from',e.status,'operator_confirmed_external_mailing',true));
 return 'done';
end $$;
revoke all on function public.admin_mark_square_mailed(uuid) from public,anon;
grant execute on function public.admin_mark_square_mailed(uuid) to authenticated;

-- Also protect the historical status action; hidden UI is not authorization.
create function private.guard_square_mailing() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.product_model='square_v1' and new.status is distinct from old.status and new.status in('printed','mailed','completed')
 and not private.square_mail_ready(old.id) then raise exception 'campaign_not_ready_to_mail'; end if;
 return new;
end $$;
revoke all on function private.guard_square_mailing() from public,anon,authenticated;
create trigger square_mailing_readiness before update of status on public.editions for each row execute function private.guard_square_mailing();

create or replace function public.admin_collection_preview(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin();
 if exists(select 1 from public.zone_charges where edition_id=p_id) then
  return jsonb_build_object('ready',exists(select 1 from public.zone_charges where edition_id=p_id and status<>'succeeded'),'existing',true);
 end if;
 begin perform private.check_zone_collection(p_id);
 exception when others then return jsonb_build_object('ready',false,'reason',sqlerrm); end;
 return jsonb_build_object('ready',true,'existing',false);
end $$;
notify pgrst,'reload schema';
