-- Phase 6.15A: durable envelopes, fenced sending leases and reconciled provider outcomes.
-- No existing reservation, consent, token or artwork is modified.
alter table public.email_outbox drop constraint email_outbox_status_check;
alter table public.email_outbox add constraint email_outbox_status_check
  check(status in ('pending','sending','sent','failed','investigation'));

create table public.email_deliveries (
 id uuid primary key default gen_random_uuid(),
 logical_key text not null unique,
 outbox_id uuid unique references public.email_outbox(id) on delete cascade,
 payload_ciphertext text not null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed','investigation')),
 is_test boolean not null default false,
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 retry_safe boolean not null default false,
 ambiguous boolean not null default false,
 provider_message_id text,
 provider_outcome text,
 provider_event_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 accepted_at timestamptz
);
create unique index email_deliveries_provider_id on public.email_deliveries(provider_message_id) where provider_message_id is not null and not is_test;
create index email_deliveries_due on public.email_deliveries(next_attempt_at) where status in ('pending','sending','failed');
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from anon, authenticated;
grant all on public.email_deliveries to service_role;
-- Admin metadata only; ciphertext (which contains private links) is never readable by clients.
grant select(id,logical_key,outbox_id,status,is_test,attempts,first_attempt_at,next_attempt_at,retry_safe,provider_message_id,provider_outcome,last_error,created_at,accepted_at) on public.email_deliveries to authenticated;
create policy "admins read delivery metadata" on public.email_deliveries for select to authenticated using ((select private.is_admin()));

create table public.email_delivery_events (
 id text primary key,
 delivery_id uuid not null references public.email_deliveries(id) on delete cascade,
 provider_message_id text not null,
 kind text not null,
 occurred_at timestamptz not null,
 received_at timestamptz not null default now()
);
alter table public.email_delivery_events enable row level security;
revoke all on public.email_delivery_events from anon,authenticated;
grant all on public.email_delivery_events to service_role;

create function public.claim_email_delivery(p_id uuid) returns setof public.email_deliveries
language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;
begin
 select * into d from public.email_deliveries where id=p_id for update;
 if not found or d.status in ('accepted','investigation')
    or d.next_attempt_at>now() or d.lease_until>now() then return; end if;
 if d.status='failed' and not d.retry_safe then return; end if;
 if d.attempts>=8 then
  update public.email_deliveries set status=case when d.retry_safe then 'failed' else 'investigation' end,last_error='retry_limit_reached' where id=p_id;
  return;
 end if;
 -- Leave an hour of safety before Resend's documented 24-hour retention boundary.
 if d.first_attempt_at is not null and d.first_attempt_at<=now()-interval '23 hours' and not d.retry_safe then
  update public.email_deliveries set status='investigation',last_error='idempotency_window_elapsed',lease_id=null,lease_until=null where id=p_id;
  update public.email_outbox set status='investigation',last_error='idempotency_window_elapsed' where id=d.outbox_id;
  return;
 end if;
 return query update public.email_deliveries set ambiguous=(ambiguous or status='sending'),status='sending',attempts=attempts+1,
  first_attempt_at=coalesce(first_attempt_at,now()),lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes',retry_safe=false
  where id=p_id returning *;
end $$;
revoke all on function public.claim_email_delivery(uuid) from public,anon,authenticated;
grant execute on function public.claim_email_delivery(uuid) to service_role;

create function public.record_email_event(p_event_id text,p_delivery_id uuid,p_provider_id text,p_kind text,p_at timestamptz)
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

create function public.admin_retry_email_delivery(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;
begin
 perform private.require_admin();
 select * into d from public.email_deliveries where id=p_id for update;
 if not found or d.status<>'failed' or not d.retry_safe or d.provider_message_id is not null
 then raise exception 'delivery_requires_investigation'; end if;
 update public.email_deliveries set status='pending',attempts=0,first_attempt_at=null,next_attempt_at=now(),last_error=null where id=p_id;
 update public.email_outbox set status='pending',attempts=0,next_attempt_at=now(),last_error=null where id=d.outbox_id;
 perform private.log_event('email.retry_requested','email_delivery',p_id::text,'{}'::jsonb);
end $$;
revoke all on function public.admin_retry_email_delivery(uuid) from public,anon;
grant execute on function public.admin_retry_email_delivery(uuid) to authenticated;
notify pgrst,'reload schema';

create function public.sync_email_delivery(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.email_deliveries;
begin
 select * into d from public.email_deliveries where id=p_id for update;
 if not found or d.outbox_id is null then return; end if;
 update public.email_outbox set status=case d.status when 'accepted' then 'sent' when 'sending' then 'failed' else d.status end,
 attempts=d.attempts,provider_message_id=d.provider_message_id,sent_at=d.accepted_at,last_error=d.last_error,next_attempt_at=d.next_attempt_at
 where id=d.outbox_id;
end $$;
revoke all on function public.sync_email_delivery(uuid) from public,anon,authenticated;
grant execute on function public.sync_email_delivery(uuid) to service_role;

-- Exact future displayed consent; historical rows intentionally remain null.
alter table public.payment_consents add column consent_text text;
