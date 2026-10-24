-- Durable coordination. Lock order: campaign (when needed), booking, ledger,
-- control, request. No SQL transaction spans a provider call. No consent/prices
-- or campaign statuses are rewritten. Historical Stripe idempotency keys remain.
create table public.booking_payment_controls (
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 state text not null default 'not_started' check(state in ('not_started','in_progress','accepted','failed','canceled','reconciliation')),
 action text check(action in ('create','confirm','reconcile','cancel')),
 operation_token uuid, lease_until timestamptz, first_started_at timestamptz,
 revoked_at timestamptz, recovery_exposed_at timestamptz, provider_status text,
 updated_at timestamptz not null default now()
);
alter table public.booking_payment_controls enable row level security;
revoke all on public.booking_payment_controls from anon,authenticated;
grant select on public.booking_payment_controls to authenticated;
grant all on public.booking_payment_controls to service_role;
create policy "admins read payment controls" on public.booking_payment_controls for select to authenticated using((select private.is_admin()));

-- Existing ambiguous ledgers fail closed; absence of a local intent is not proof
-- that an older worker never dispatched one. No existing ledger is relabeled.
insert into public.booking_payment_controls(booking_id,state,first_started_at,provider_status)
 select booking_id,case when status='succeeded' then 'accepted' when status='canceled' then 'canceled' else 'reconciliation' end,created_at,status from public.zone_charges;
insert into public.booking_payment_controls(booking_id,revoked_at)
 select distinct booking_id,now() from public.customer_requests where kind='cancellation' and status='open'
 on conflict(booking_id) do update set revoked_at=excluded.revoked_at;

create function private.lock_payment_control(p_booking uuid) returns public.booking_payment_controls
language plpgsql security definer set search_path='' as $$
declare control public.booking_payment_controls;
begin
 perform 1 from public.bookings where id=p_booking for update;
 if not found then raise exception 'booking_missing'; end if;
 perform 1 from public.zone_charges where booking_id=p_booking for update;
 insert into public.booking_payment_controls(booking_id) values(p_booking) on conflict do nothing;
 select * into control from public.booking_payment_controls where booking_id=p_booking for update;
 return control;
end $$;
revoke all on function private.lock_payment_control(uuid) from public,anon,authenticated,service_role;

create function private.collection_cancellation_requested() returns trigger
language plpgsql security definer set search_path='' as $$
declare control public.booking_payment_controls;
begin
 if new.kind='cancellation' and new.status='open' then
  control:=private.lock_payment_control(new.booking_id);
  update public.booking_payment_controls set revoked_at=coalesce(revoked_at,now()),
   state=case when state in ('accepted','canceled') then state when first_started_at is not null or recovery_exposed_at is not null then 'reconciliation' else state end,updated_at=now()
   where booking_id=new.booking_id;
  update public.zone_charges set recovery_hash=null where booking_id=new.booking_id;
 end if;
 return new;
end $$;
create trigger collection_cancellation_requested before insert on public.customer_requests for each row execute function private.collection_cancellation_requested();
revoke all on function private.collection_cancellation_requested() from public,anon,authenticated,service_role;

create or replace function private.guard_collection_consent() returns trigger language plpgsql security definer set search_path='' as $$
declare control public.booking_payment_controls;
begin
 control:=private.lock_payment_control(new.booking_id);
 if control.revoked_at is not null or exists(select 1 from public.customer_requests where booking_id=new.booking_id and kind='cancellation' and status='open')
  or not exists(select 1 from public.bookings where id=new.booking_id and status='reserved') then raise exception 'collection_authorization_revoked'; end if;
 if not exists(select 1 from public.payment_consents where id=new.consent_id) or private.consent_review_reason(new.consent_id) is not null then raise exception 'consent_review_required'; end if;
 return new;
end $$;

create function public.begin_payment_operation(p_charge uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.zone_charges; control public.booking_payment_controls; token uuid;
begin
 select * into c from public.zone_charges where id=p_charge;
 if not found then raise exception 'charge_missing'; end if;
 control:=private.lock_payment_control(c.booking_id);
 select * into c from public.zone_charges where id=p_charge;
 if p_action is null or p_action not in ('create','confirm','reconcile','cancel','recovery') then raise exception 'invalid_operation'; end if;
 if p_action in ('create','confirm','recovery') then
  if control.revoked_at is not null or exists(select 1 from public.customer_requests where booking_id=c.booking_id and kind='cancellation' and status='open')
   or not exists(select 1 from public.bookings where id=c.booking_id and status in ('reserved','charge_failed')) then raise exception 'collection_authorization_revoked'; end if;
  perform public.assert_charge_consent(c.id);
  if c.status in ('succeeded','canceled') or control.state in ('accepted','canceled') then raise exception 'payment_terminal'; end if;
 end if;
 if control.lease_until>now() then return jsonb_build_object('decision','busy'); end if;
 if p_action='recovery' then
  if c.payment_intent_id is null or c.status not in ('requires_action','requires_payment_method','processing') or c.recovery_expires_at is null or c.recovery_expires_at<=now() then raise exception 'recovery_unavailable'; end if;
  update public.booking_payment_controls set recovery_exposed_at=coalesce(recovery_exposed_at,now()),state='in_progress',updated_at=now() where booking_id=c.booking_id;
  return jsonb_build_object('decision','allowed');
 end if;
 if p_action='create' then
  if c.payment_intent_id is not null then return jsonb_build_object('decision','reconcile'); end if;
  -- Only retry the SAME creation identity within Stripe's conservative replay
  -- window. An expired/unknown operation never creates a fresh intent identity.
  if coalesce(control.first_started_at,c.created_at)<now()-interval '23 hours' or (control.action is not null and control.action<>'create') then
   update public.booking_payment_controls set state='reconciliation',updated_at=now() where booking_id=c.booking_id;
   return jsonb_build_object('decision','reconcile');
  end if;
 elsif c.payment_intent_id is null then
  update public.booking_payment_controls set state='reconciliation',updated_at=now() where booking_id=c.booking_id;
  return jsonb_build_object('decision','reconcile');
 end if;
 if p_action='confirm' and control.provider_status is distinct from 'requires_confirmation' then return jsonb_build_object('decision','reconcile'); end if;
 if p_action='cancel' and control.revoked_at is null then raise exception 'cancellation_not_requested'; end if;
 token:=gen_random_uuid();
 update public.booking_payment_controls set state='in_progress',action=p_action,operation_token=token,lease_until=now()+interval '2 minutes',
 first_started_at=coalesce(first_started_at,now()),updated_at=now() where booking_id=c.booking_id;
 return jsonb_build_object('decision','allowed','token',token);
end $$;
revoke all on function public.begin_payment_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_payment_operation(uuid,text) to service_role;

-- The worker reports only verified provider observations, never browser claims.
-- A fenced/late worker cannot start the next stage. Webhooks may still record
-- actual outcomes independently, including success after a cancellation request.
create function public.finish_payment_operation(p_charge uuid,p_token uuid,p_intent text,p_status text) returns text
language plpgsql security definer set search_path='' as $$
declare c public.zone_charges; control public.booking_payment_controls; result text;
begin
 select * into c from public.zone_charges where id=p_charge;
 if not found then raise exception 'charge_missing'; end if;
 control:=private.lock_payment_control(c.booking_id);
 select * into c from public.zone_charges where id=p_charge;
 if p_token is null or control.operation_token is distinct from p_token then raise exception 'operation_fenced'; end if;
 if p_status is null or p_status not in ('unknown','requires_confirmation','requires_action','requires_payment_method','processing','succeeded','canceled','requires_capture') then raise exception 'invalid_provider_status'; end if;
 if p_status<>'unknown' and (p_intent is null or p_intent !~ '^pi_[A-Za-z0-9_]+$') then raise exception 'intent_required'; end if;
 if p_intent is not null and c.payment_intent_id is not null and c.payment_intent_id<>p_intent then raise exception 'intent_mismatch'; end if;
 result:=case when control.state='accepted' or c.status='succeeded' or p_status='succeeded' then 'accepted'
  when control.state='canceled' or p_status='canceled' then 'canceled'
  when p_status in ('unknown','requires_capture') or control.revoked_at is not null then 'reconciliation'
  when p_status='requires_payment_method' then 'failed'
  else 'in_progress' end;
 update public.zone_charges set payment_intent_id=coalesce(payment_intent_id,p_intent),
  recovery_hash=case when control.revoked_at is not null or p_status in ('succeeded','canceled') then null else recovery_hash end
  where id=c.id;
 update public.booking_payment_controls set state=result,provider_status=case when p_status='unknown' then provider_status else p_status end,
  lease_until=null,operation_token=null,updated_at=now() where booking_id=c.booking_id;
 if control.revoked_at is not null and result<>'canceled' then
  insert into public.operational_alerts(logical_key,kind,title,href) values('payment-conflict:'||c.id,'payment','Cancellation requires verified payment resolution','/admin/advertisers/'||c.booking_id) on conflict do nothing;
 end if;
 return result;
end $$;
revoke all on function public.finish_payment_operation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_payment_operation(uuid,uuid,text,text) to service_role;

create or replace function public.record_zone_payment(p_charge uuid,p_intent text,p_status text,p_event text,p_created bigint,p_failure text default null,p_mode text default 'test',p_account text default null) returns text
language plpgsql security definer set search_path='' as $$
declare c public.zone_charges; control public.booking_payment_controls; result text;
begin
 select * into c from public.zone_charges where id=p_charge;
 if not found then raise exception 'charge_missing'; end if;
 control:=private.lock_payment_control(c.booking_id);
 select * into c from public.zone_charges where id=p_charge;
 if p_mode is distinct from c.stripe_mode or p_account is distinct from c.stripe_account_id or (c.stripe_mode='live' and c.stripe_account_id is null) then raise exception 'payment_binding_mismatch'; end if;
 -- A canceled authorization is terminal; a stale failure cannot resurrect its booking.
 if control.state='canceled' and p_status not in ('succeeded','canceled') then return 'stale'; end if;
 if p_status='canceled' and exists(select 1 from public.bookings where id=c.booking_id and status='cancelled') then return 'stale'; end if;
 result:=private.record_zone_payment(p_charge,p_intent,p_status,p_event,p_created,p_failure);
 if result='recorded' then
  update public.booking_payment_controls set provider_status=p_status,
   state=case when p_status='succeeded' then 'accepted' when p_status='canceled' then 'canceled' when revoked_at is not null then 'reconciliation' when p_status='requires_payment_method' then 'failed' else 'in_progress' end,
   -- Keep active leases fenced until their worker reports or expires.
   first_started_at=coalesce(first_started_at,now()),updated_at=now() where booking_id=c.booking_id;
  if control.revoked_at is not null then
   update public.zone_charges set recovery_hash=null where id=c.id;
   insert into public.operational_alerts(logical_key,kind,title,href) values('payment-conflict:'||c.id,'payment','Cancellation requires verified payment resolution','/admin/advertisers/'||c.booking_id) on conflict do nothing;
  end if;
 end if;
 return result;
end $$;

create function private.payment_cancellation_safe(p_booking uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.booking_payment_controls where booking_id=p_booking and revoked_at is not null
  and (state='canceled' or (state='not_started' and first_started_at is null and recovery_exposed_at is null)))
  and not exists(select 1 from public.zone_charges where booking_id=p_booking and status='succeeded')
$$;
revoke all on function private.payment_cancellation_safe(uuid) from public,anon,authenticated,service_role;

create or replace function private.guard_collection_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.zone_charges where booking_id=old.id) then
  if tg_op='DELETE' then raise exception 'collection_requires_resolution'; end if;
  if (new.edition_id,new.price_cents,new.category_id,new.stripe_customer_id,new.stripe_payment_method_id) is distinct from (old.edition_id,old.price_cents,old.category_id,old.stripe_customer_id,old.stripe_payment_method_id)
   or new.status in ('released','pending') or (new.status='cancelled' and not private.payment_cancellation_safe(old.id)) then raise exception 'collection_requires_resolution'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create or replace function private.guard_collection_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.zone_charges where booking_id=coalesce(old.booking_id,new.booking_id)) then
  if tg_op<>'UPDATE' then raise exception 'collection_inventory_frozen'; end if;
  if not private.payment_cancellation_safe(old.booking_id) or old.released_at is not null or new.released_at is null
   or (to_jsonb(old)-'released_at') is distinct from (to_jsonb(new)-'released_at') then raise exception 'collection_inventory_frozen'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

-- Printer order events are evidence-backed, append-only admin records. The first
-- accepted/committed event is the commitment boundary; no external order is sent.
create table public.printer_order_events (
 id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.editions(id),
 stage text not null check(stage in ('submitted','committed','printed','mailing_submitted','mailed')),
 evidence_id uuid not null references public.mailing_evidence(id),notes text not null check(length(trim(notes)) between 1 and 1000),
 recorded_at timestamptz not null default now(),recorded_by uuid not null references auth.users(id),
 unique(edition_id,stage)
);
alter table public.printer_order_events enable row level security;
revoke all on public.printer_order_events from anon,authenticated;
grant select on public.printer_order_events to authenticated;
grant all on public.printer_order_events to service_role;
create policy "admins read printer events" on public.printer_order_events for select to authenticated using((select private.is_admin()));
create function public.admin_record_printer_stage(p_edition uuid,p_stage text,p_evidence uuid,p_notes text) returns uuid
language plpgsql security definer set search_path='' as $$
declare stages text[]:=array['submitted','committed','printed','mailing_submitted','mailed']; position integer; previous integer; result uuid;
begin
 perform private.require_admin();
 perform 1 from public.editions where id=p_edition for update;
 if not found then raise exception 'campaign_missing'; end if;
 position:=array_position(stages,p_stage);
 if position is null or length(trim(coalesce(p_notes,''))) not between 1 and 1000 then raise exception 'invalid_printer_record'; end if;
 if not exists(select 1 from public.mailing_evidence m join storage.objects o on o.bucket_id='mailing-evidence' and o.name=m.storage_path where m.id=p_evidence and m.edition_id=p_edition) then raise exception 'printer_evidence_required'; end if;
 select id into result from public.printer_order_events where edition_id=p_edition and stage=p_stage;
 if found then return result; end if;
 select coalesce(max(array_position(stages,stage)),0) into previous from public.printer_order_events where edition_id=p_edition;
 if position<>previous+1 then raise exception 'printer_stage_out_of_order'; end if;
 insert into public.printer_order_events(edition_id,stage,evidence_id,notes,recorded_by) values(p_edition,p_stage,p_evidence,trim(p_notes),auth.uid()) returning id into result;
 perform private.log_event('printer.'||p_stage,'campaign',p_edition::text,jsonb_build_object('evidence_id',p_evidence,'notes',trim(p_notes)));
 return result;
end $$;
revoke all on function public.admin_record_printer_stage(uuid,text,uuid,text) from public,anon,service_role;
grant execute on function public.admin_record_printer_stage(uuid,text,uuid,text) to authenticated;

create or replace function public.admin_cancel_booking(p_booking_id uuid,p_reason text) returns text
language plpgsql security definer set search_path='' as $$
declare b public.bookings; control public.booking_payment_controls; released integer;
begin
 perform private.require_admin();
 if length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'reason_required'; end if;
 -- Take the campaign lock before the booking so printer commitment cannot race.
 perform 1 from public.editions e join public.bookings booking on booking.edition_id=e.id where booking.id=p_booking_id for update of e;
 control:=private.lock_payment_control(p_booking_id);
 select * into b from public.bookings where id=p_booking_id;
 if b.status='cancelled' then return 'already'; end if;
 if b.status='released' then raise exception 'already_released'; end if;
 update public.booking_payment_controls set revoked_at=coalesce(revoked_at,now()),updated_at=now() where booking_id=b.id;
 update public.zone_charges set recovery_hash=null where booking_id=b.id;
 if b.status='charged' or (b.status='charge_failed' and not exists(select 1 from public.zone_charges where booking_id=b.id)) or exists(select 1 from public.printer_order_events where edition_id=b.edition_id and stage='committed')
  or not private.payment_cancellation_safe(b.id) then
  update public.booking_payment_controls set state=case when state='accepted' then state else 'reconciliation' end,updated_at=now() where booking_id=b.id;
  insert into public.operational_alerts(logical_key,kind,title,href) values('cancel-review:'||b.id,'cancellation','Cancellation requires payment or printer review','/admin/advertisers/'||b.id) on conflict do nothing;
  perform private.log_event('booking.cancellation_pending','booking',b.id::text,jsonb_build_object('reason',p_reason));
  return 'requires_resolution';
 end if;
 select count(*) into released from public.booking_slots where booking_id=b.id and released_at is null;
 update public.bookings set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=p_reason,updated_at=now() where id=b.id;
 update public.booking_payment_controls set state='canceled',updated_at=now() where booking_id=b.id;
 if b.status in ('reserved','charge_failed') then
  insert into public.email_outbox(booking_id,kind) values(b.id,'reservation_cancelled') on conflict(booking_id,kind) do nothing;
 end if;
 perform private.log_event('booking.cancelled','booking',b.id::text,jsonb_build_object('from',b.status,'reason',p_reason,'price_cents',b.price_cents,'slots_released',released,'size',b.size,'customer_notified',b.status in ('reserved','charge_failed')));
 return 'done';
end $$;

create or replace function public.admin_resolve_customer_request(p_id uuid,p_status text,p_response text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.customer_requests;
begin
 perform private.require_admin();
 if p_status is null or p_status not in ('resolved','declined') or length(trim(coalesce(p_response,''))) not between 1 and 1000 then raise exception 'invalid_resolution'; end if;
 select * into r from public.customer_requests where id=p_id;
 if not found then raise exception 'request_missing'; end if;
 perform private.lock_payment_control(r.booking_id);
 select * into r from public.customer_requests where id=p_id for update;
 if r.status<>'open' then return; end if;
 if r.kind='cancellation' and p_status='resolved' and not exists(select 1 from public.bookings where id=r.booking_id and status='cancelled') then raise exception 'cancellation_not_completed'; end if;
 update public.customer_requests set status=p_status,response=trim(p_response),resolved_at=now(),resolved_by=auth.uid() where id=p_id;
 update public.operational_alerts set resolved_at=now() where logical_key='request:'||p_id;
 -- Declining a request does not revive its previously revoked payment authority.
 perform private.log_event('customer_request.'||p_status,'booking',r.booking_id::text,jsonb_build_object('request_id',p_id,'response',trim(p_response)));
end $$;
create or replace function private.check_zone_collection(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.check_zone_collection_before_house(p_id);
 if exists(select 1 from public.bookings b where b.edition_id=p_id and b.status='reserved' and (
  exists(select 1 from public.booking_payment_controls c where c.booking_id=b.id and c.revoked_at is not null)
  or exists(select 1 from public.customer_requests r where r.booking_id=b.id and r.kind='cancellation' and r.status='open'))) then raise exception 'collection_authorization_revoked'; end if;
 if exists(select 1 from public.bookings b join public.payment_consents c on c.booking_id=b.id where b.edition_id=p_id and b.status='reserved' and private.consent_review_reason(c.id) is not null) then raise exception 'consent_review_required'; end if;
 if not exists(select 1 from public.house_artwork) then raise exception 'house_artwork_required'; end if;
 if not private.current_square_proof(p_id) then raise exception 'current_final_proof_required'; end if;
 if exists(select 1 from public.booking_artwork a join public.bookings b on b.id=a.booking_id where b.edition_id=p_id and b.status='reserved'
 and not private.artwork_print_resolution(a)) then raise exception 'print_resolution_required'; end if;
end $$;

notify pgrst,'reload schema';
