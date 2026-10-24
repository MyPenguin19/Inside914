-- Phase 6.15D, stage A. Additive hardening; never fabricate historical authorization.
alter table public.payment_consents add column reservation_deadline_at_consent timestamptz;
create function private.freeze_payment_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new is distinct from old then raise exception 'historic_consent_is_immutable'; end if;
 if tg_op='INSERT' then
  -- Capture the authoritative deadline while holding a shared campaign lock.
  select artwork_deadline into new.reservation_deadline_at_consent from public.editions where id=new.edition_id for share;
 end if;
 return new;
end $$;
revoke all on function private.freeze_payment_consent() from public,anon,authenticated,service_role;
create trigger freeze_payment_consent before insert or update on public.payment_consents for each row execute function private.freeze_payment_consent();

create function private.consent_review_reason(p_consent uuid) returns text language sql stable security definer set search_path='' as $$
 select case
  when c.terms_version not in ('square-zones-v1','2026-10-16-draft-1') then 'Draft or unrecognized terms require owner/counsel approval before collection'
  when c.reservation_deadline_at_consent is null then 'Legacy consent: original deadline requires review; collection blocked'
  when e.artwork_deadline>c.reservation_deadline_at_consent then 'Campaign deadline extended: renewed authorization required; collection blocked'
  when c.amount_cents<>b.price_cents or c.currency<>'usd' or c.edition_id<>b.edition_id then 'Consent does not match the reservation'
  else null end
 from public.payment_consents c join public.bookings b on b.id=c.booking_id join public.editions e on e.id=b.edition_id where c.id=p_consent
$$;
revoke all on function private.consent_review_reason(uuid) from public,anon,authenticated,service_role;

create function public.admin_consent_review(p_bookings uuid[]) returns table(booking_id uuid,reason text)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin();
 return query select b.id,coalesce(private.consent_review_reason(c.id),case when c.id is null then 'No saved consent' end)
 from public.bookings b left join lateral(select pc.id from public.payment_consents pc where pc.booking_id=b.id order by pc.consented_at desc,pc.id limit 1)c on true
 where b.id=any(p_bookings);
end $$;
revoke all on function public.admin_consent_review(uuid[]) from public,anon,service_role;
grant execute on function public.admin_consent_review(uuid[]) to authenticated;

create function public.assert_charge_consent(p_charge uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.zone_charges;
begin
 select * into c from public.zone_charges where id=p_charge;
 if not found or not exists(select 1 from public.payment_consents where id=c.consent_id) or private.consent_review_reason(c.consent_id) is not null then raise exception 'consent_review_required'; end if;
end $$;
revoke all on function public.assert_charge_consent(uuid) from public,anon,authenticated;
grant execute on function public.assert_charge_consent(uuid) to service_role;

-- Check before any ledger can authorize a new charge. Outcomes of existing payments remain recordable.
create function private.guard_collection_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.consent_review_reason(new.consent_id) is not null then raise exception 'consent_review_required'; end if;
 return new;
end $$;
revoke all on function private.guard_collection_consent() from public,anon,authenticated,service_role;
create trigger collection_consent_guard before insert on public.zone_charges for each row execute function private.guard_collection_consent();

create or replace function public.record_email_event(p_event_id text,p_delivery_id uuid,p_provider_id text,p_kind text,p_at timestamptz)
returns text language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries; affected integer;
begin
 if p_kind not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')
  then return 'ignored'; end if;
 select * into d from public.email_deliveries where id=p_delivery_id for update;
 if not found then return 'unknown'; end if;
 if d.provider_message_id is not null and d.provider_message_id<>p_provider_id then return 'mismatch'; end if;
 insert into public.email_delivery_events(id,delivery_id,provider_message_id,kind,occurred_at)
 values(p_event_id,p_delivery_id,p_provider_id,p_kind,p_at) on conflict do nothing;
 get diagnostics affected=row_count;
 if affected=0 then return 'duplicate'; end if;
 if d.provider_event_at is not null and d.provider_event_at>p_at then return 'older'; end if;
 -- Delivery success cannot regress to a later sent/delayed event.
 if d.provider_outcome='email.delivered' and p_kind in ('email.sent','email.delivery_delayed') then return 'older'; end if;
 -- Never let a delayed accepted event erase a definitive adverse outcome.
 if d.provider_outcome in ('email.bounced','email.complained','email.failed','email.suppressed')
    and p_kind in ('email.sent','email.delivered','email.delivery_delayed') then return 'older'; end if;
 update public.email_deliveries set provider_message_id=p_provider_id,provider_outcome=p_kind,provider_event_at=p_at,
 status=case when p_kind in ('email.bounced','email.complained','email.failed','email.suppressed') then 'failed' else 'accepted' end,
 accepted_at=coalesce(accepted_at,p_at),retry_safe=false,lease_id=null,lease_until=null,
 last_error=case when p_kind in ('email.bounced','email.complained','email.failed','email.suppressed') then 'provider_delivery_failed' else null end
 where id=d.id;
 update public.email_outbox set provider_message_id=p_provider_id,
 status=case when p_kind in ('email.bounced','email.complained','email.failed','email.suppressed') then 'failed' else 'sent' end,
 sent_at=coalesce(sent_at,p_at),last_error=case when p_kind in ('email.bounced','email.complained','email.failed','email.suppressed') then 'provider_delivery_failed' else null end
 where id=d.outbox_id;
 return 'recorded';
end $$;
revoke all on function public.record_email_event(text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_email_event(text,uuid,text,text,timestamptz) to service_role;


notify pgrst,'reload schema';

create or replace function private.check_zone_collection(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.check_zone_collection_before_house(p_id);
 if exists(select 1 from public.bookings b join public.payment_consents c on c.booking_id=b.id where b.edition_id=p_id and b.status='reserved' and private.consent_review_reason(c.id) is not null) then raise exception 'consent_review_required'; end if;
 if not exists(select 1 from public.house_artwork) then raise exception 'house_artwork_required'; end if;
 if not private.current_square_proof(p_id) then raise exception 'current_final_proof_required'; end if;
 if exists(select 1 from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=p_id and b.status='reserved'
 and not private.artwork_print_resolution(a)) then raise exception 'print_resolution_required'; end if;
end $$;
