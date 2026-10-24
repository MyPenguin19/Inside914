-- Phase 6.15C. Published, current campaign evidence and opt-in individual invitations.
-- No existing evidence is published, no inventory is held and no campaign is changed.
alter table public.admin_events drop constraint admin_events_target_type_check;
alter table public.admin_events add constraint admin_events_target_type_check check(target_type in ('campaign','slot','booking','artwork','evidence','zone','email_delivery','operational_alert','invitation'));

create function private.customer_evidence_current(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mailing_evidence m join public.editions e on e.id=m.edition_id
 join storage.objects o on o.bucket_id='mailing-evidence' and o.name=m.storage_path
 where m.id=p_id and m.kind in ('printer_confirmation','final_proof','postal_acceptance','mailing_confirmation')
 and m.content_type in ('application/pdf','image/jpeg','image/png') and m.byte_size between 1 and 10485760
 and m.storage_path like e.id::text||'/%'
 and m.uploaded_at>=coalesce((select max(upgraded_at) from private.campaign_layout_history where edition_id=e.id),'epoch'::timestamptz)
 and not exists(select 1 from private.campaign_layout_history h,jsonb_array_elements(h.snapshot->'evidence') old_document where h.edition_id=e.id and old_document->>'id'=m.id::text)
 and m.uploaded_at>=coalesce((select max(a.updated_at) from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=e.id and b.status not in ('pending','released','cancelled')),'epoch'::timestamptz)
 and m.uploaded_at>=coalesce((select max(updated_at) from public.house_artwork),'epoch'::timestamptz)
 and (m.kind<>'final_proof' or e.product_model<>'square_v1' or exists(select 1 from public.house_artwork h join storage.objects ho on ho.bucket_id='house-artwork' and ho.name=h.storage_path)))
$$;
revoke all on function private.customer_evidence_current(uuid) from public,anon,authenticated,service_role;

-- Retains explicit admin publication and audit, adding fail-closed validation.
create or replace function public.admin_publish_evidence(p_id uuid,p_publish boolean) returns text
language plpgsql security definer set search_path='' as $$
declare m public.mailing_evidence;
begin
 perform private.require_admin();
 select * into m from public.mailing_evidence where id=p_id for update;
 if not found then raise exception using errcode='ADM02',message='not_found'; end if;
 if p_publish and not private.customer_evidence_current(p_id) then raise exception 'current_evidence_file_required'; end if;
 if p_publish=(m.published_at is not null) then return 'already'; end if;
 update public.mailing_evidence set published_at=case when p_publish then now() end,published_by=case when p_publish then auth.uid() end where id=p_id;
 perform private.log_event(case when p_publish then 'evidence.published' else 'evidence.unpublished' end,'evidence',p_id::text,jsonb_build_object('edition_id',m.edition_id,'kind',m.kind));
 return 'done';
end $$;

-- The server must first authorize the booking via its private cookie. No public RPC access.
create function public.customer_mailing_evidence(p_booking uuid)
returns table(id uuid,kind text,title text,event_date date,published_at timestamptz,storage_path text)
language sql stable security definer set search_path='' as $$
 select m.id,m.kind,m.title,m.event_date,m.published_at,m.storage_path from public.mailing_evidence m
 join public.bookings b on b.edition_id=m.edition_id
 where b.id=p_booking and b.confirmed_at is not null and m.published_at is not null
 and private.customer_evidence_current(m.id) order by m.event_date nulls last,m.published_at
$$;
revoke all on function public.customer_mailing_evidence(uuid) from public,anon,authenticated;
grant execute on function public.customer_mailing_evidence(uuid) to service_role;

create table public.advertiser_invitations (
 id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.editions(id) on delete restrict,
 slot_id uuid not null references public.slots(id) on delete restrict,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),expires_at timestamptz not null,
 recipient_email text check(recipient_email is null or (length(recipient_email)<=254 and recipient_email like '%@%')),
 business_name text check(business_name is null or length(business_name) between 1 and 120),
 delivery_id uuid unique references public.email_deliveries(id) on delete set null
);
create index advertiser_invitations_campaign on public.advertiser_invitations(edition_id);
alter table public.advertiser_invitations enable row level security;
revoke all on public.advertiser_invitations from anon,authenticated;
grant select on public.advertiser_invitations to authenticated;
grant all on public.advertiser_invitations to service_role;
create policy "admins read invitations" on public.advertiser_invitations for select to authenticated using((select private.is_admin()));

create function public.admin_create_invitation(p_edition uuid,p_slot uuid,p_email text default null,p_name text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; e public.editions; actor uuid;
begin
 actor:=private.require_admin();
 select * into e from public.editions where id=p_edition;
 if not found or e.product_model<>'square_v1' or not private.edition_is_bookable(e.id) then raise exception 'campaign_not_open'; end if;
 if not exists(select 1 from public.slot_availability where slot_id=p_slot and edition_id=e.id and occupancy='available') then raise exception 'position_unavailable'; end if;
 if (select count(*) from public.advertiser_invitations where created_by=actor and created_at>now()-interval '1 day')>=50 then raise exception 'invitation_limit'; end if;
 insert into public.advertiser_invitations(edition_id,slot_id,created_by,expires_at,recipient_email,business_name)
 values(e.id,p_slot,actor,least(now()+interval '7 days',e.artwork_deadline),nullif(lower(trim(p_email)),''),nullif(trim(p_name),'')) returning id into result;
 perform private.log_event('invitation.created','invitation',result::text,jsonb_build_object('edition_id',e.id,'slot_id',p_slot));
 return result;
end $$;
revoke all on function public.admin_create_invitation(uuid,uuid,text,text) from public,anon;
grant execute on function public.admin_create_invitation(uuid,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
