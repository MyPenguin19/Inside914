-- Historic ledgers are test-only and unbound; never relabel an existing intent.
alter table public.zone_charges add column stripe_mode text not null default 'test' check(stripe_mode in ('test','live'));
alter table public.zone_charges add column stripe_account_id text check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$');
create function private.guard_zone_payment_binding() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.stripe_mode,new.stripe_account_id) is distinct from (old.stripe_mode,old.stripe_account_id) and
 (old.stripe_account_id is not null or old.payment_intent_id is not null or old.status<>'pending') then raise exception 'payment_binding_immutable'; end if;
 return new;
end $$;
create trigger guard_zone_payment_binding before update on public.zone_charges for each row execute function private.guard_zone_payment_binding();
revoke all on function private.guard_zone_payment_binding() from public,anon,authenticated;
create function public.bind_zone_collection(p_id uuid,p_mode text,p_account text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_mode is null or p_mode not in ('test','live') or p_account is null or p_account !~ '^acct_[A-Za-z0-9]+$' then raise exception 'invalid_payment_binding'; end if;
 perform 1 from public.editions where id=p_id for update;
 if (select count(*) from public.zone_charges where edition_id=p_id)<>10 then raise exception 'missing_collection_ledger'; end if;
 if exists(select 1 from public.zone_charges where edition_id=p_id and
 ((stripe_account_id is not null and (stripe_mode<>p_mode or stripe_account_id<>p_account)) or
 (stripe_account_id is null and (payment_intent_id is not null or status<>'pending')))) then raise exception 'payment_binding_mismatch'; end if;
 if p_mode='live' and exists(select 1 from public.zone_charges c join public.bookings b on b.id=c.booking_id where c.edition_id=p_id and b.pricing_mode is distinct from 'launch') then raise exception 'live_requires_launch_consent'; end if;
 update public.zone_charges set stripe_mode=p_mode,stripe_account_id=p_account where edition_id=p_id and stripe_account_id is null;
end $$;
revoke all on function public.bind_zone_collection(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bind_zone_collection(uuid,text,text) to service_role;

-- Retain the transactional state machine privately; expose a scoped wrapper only.
alter function public.record_zone_payment(uuid,text,text,text,bigint,text) set schema private;
revoke all on function private.record_zone_payment(uuid,text,text,text,bigint,text) from public,anon,authenticated,service_role;
create function public.record_zone_payment(p_charge uuid,p_intent text,p_status text,p_event text,p_created bigint,p_failure text default null,p_mode text default 'test',p_account text default null) returns text language plpgsql security definer set search_path='' as $$
declare c public.zone_charges;
begin
 select * into c from public.zone_charges where id=p_charge for update;
 if not found or p_mode is distinct from c.stripe_mode or p_account is distinct from c.stripe_account_id then raise exception 'payment_binding_mismatch'; end if;
 if c.stripe_mode='live' and c.stripe_account_id is null then raise exception 'payment_binding_required'; end if;
 return private.record_zone_payment(p_charge,p_intent,p_status,p_event,p_created,p_failure);
end $$;
revoke all on function public.record_zone_payment(uuid,text,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.record_zone_payment(uuid,text,text,text,bigint,text,text,text) to service_role;
