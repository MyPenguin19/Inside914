-- Recurrence is a saved preference, never a charge or an automatic reservation.
create table public.recurring_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 100),
 source_booking_ids uuid[] not null check(cardinality(source_booking_ids) between 1 and 4),
 start_month date not null check(extract(day from start_month)=1),
 end_month date not null check(extract(day from end_month)=1 and end_month>=start_month and end_month<start_month+interval '2 years'),
 interval_months integer not null check(interval_months in (1,3)),
 status text not null default 'active' check(status in ('active','paused','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index recurring_plans_owner on public.recurring_plans(user_id);
create unique index recurring_plans_no_duplicate on public.recurring_plans(user_id,source_booking_ids) where status<>'cancelled';
alter table public.recurring_plans enable row level security;
revoke all on public.recurring_plans from anon,authenticated;
grant select on public.recurring_plans to authenticated;
grant all on public.recurring_plans to service_role;
create policy recurring_plans_owner on public.recurring_plans for select to authenticated using(user_id=(select auth.uid()));
create table public.recurring_occurrences (
 plan_id uuid not null references public.recurring_plans(id) on delete cascade,
 issue_month date not null,
 cart_id uuid not null references public.reservation_carts(id),
 nonce uuid not null,
 created_at timestamptz not null default now(),
 primary key(plan_id,issue_month)
);
create index recurring_occurrences_cart on public.recurring_occurrences(cart_id);
alter table public.recurring_occurrences enable row level security;
revoke all on public.recurring_occurrences from anon,authenticated;
grant select on public.recurring_occurrences to authenticated;
grant all on public.recurring_occurrences to service_role;
create policy recurring_occurrences_owner on public.recurring_occurrences for select to authenticated using(exists(select 1 from public.recurring_plans p where p.id=plan_id and p.user_id=(select auth.uid())));

create function private.recurring_plan_manage(p_id uuid,p_action text,p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; n integer; zones integer; latest date; result uuid;
begin
 if not exists(select 1 from auth.users u join public.advertiser_email_verifications v on v.user_id=u.id and v.verified_email=lower(u.email)
 where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false)) then raise exception 'Verified account required'; end if;
 if p_action='create' then
  select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p->'sources');
  if cardinality(ids) not between 1 and 4 or ids is null then raise exception 'Choose one to four reservations'; end if;
  select count(*),count(distinct e.zone_id),max(e.issue_month) into n,zones,latest from public.bookings b
   join public.advertiser_bookings a on a.booking_id=b.id and a.user_id=auth.uid() join public.editions e on e.id=b.edition_id
   where b.id=any(ids) and b.confirmed_at is not null and b.status not in ('pending','released','cancelled');
  if n<>cardinality(ids) or zones<>n then raise exception 'Choose an owned confirmed reservation for each distinct area'; end if;
  if (p->>'start_month')::date<=latest or (p->>'start_month')::date<date_trunc('month',now())::date then raise exception 'Start after the original campaigns'; end if;
  insert into public.recurring_plans(user_id,name,source_booking_ids,start_month,end_month,interval_months)
   values(auth.uid(),trim(p->>'name'),ids,(p->>'start_month')::date,(p->>'end_month')::date,(p->>'interval_months')::integer) returning id into result;
  return result;
 end if;
 perform 1 from public.recurring_plans where id=p_id and user_id=auth.uid() and status<>'cancelled' for update;
 if not found then raise exception 'Plan unavailable'; end if;
 if p_action not in ('active','paused','cancelled') then raise exception 'Invalid action'; end if;
 update public.recurring_plans set status=p_action,updated_at=now() where id=p_id;
 return p_id;
end $$;
revoke all on function private.recurring_plan_manage(uuid,text,jsonb) from public,anon;
grant execute on function private.recurring_plan_manage(uuid,text,jsonb) to authenticated;
create function public.recurring_plan_manage(p_id uuid,p_action text,p jsonb) returns uuid language sql security invoker set search_path='' as $$select private.recurring_plan_manage(p_id,p_action,p);$$;
revoke all on function public.recurring_plan_manage(uuid,text,jsonb) from public,anon;
grant execute on function public.recurring_plan_manage(uuid,text,jsonb) to authenticated;

-- Service-only: invoked after getUser + verified-email authorization. Serialize retries per plan.
create function public.hold_recurring_occurrence(p_user uuid,p_plan uuid,p_month date,p_nonce uuid,p_hash text,p_items jsonb,p_pricing_mode text,p_expected_total integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare plan public.recurring_plans; old public.recurring_occurrences; cart uuid; item jsonb; source public.bookings; target public.editions; source_zone uuid; seen uuid[]:='{}'; offset_months integer;
begin
 select * into plan from public.recurring_plans where id=p_plan and user_id=p_user for update;
 if not found or plan.status<>'active' then raise exception 'Plan is not active'; end if;
 if not exists(select 1 from auth.users u join public.advertiser_email_verifications v on v.user_id=u.id and v.verified_email=lower(u.email) where u.id=p_user and u.email_confirmed_at is not null and u.deleted_at is null) then raise exception 'Verified account required'; end if;
 offset_months := (extract(year from p_month)-extract(year from plan.start_month))*12+extract(month from p_month)-extract(month from plan.start_month);
 if p_month is null or extract(day from p_month)<>1 or p_month<plan.start_month or p_month>plan.end_month or p_month<date_trunc('month',now())::date or offset_months%plan.interval_months<>0 then raise exception 'Month is outside this schedule'; end if;
 select * into old from public.recurring_occurrences where plan_id=p_plan and issue_month=p_month;
 if found then
  if exists(select 1 from public.bookings where cart_id=old.cart_id and confirmed_at is not null) then raise exception 'This occurrence was already reserved'; end if;
  if exists(select 1 from public.bookings where cart_id=old.cart_id and status='pending' and hold_expires_at>now()) then
   return jsonb_build_object('cart_id',old.cart_id,'nonce',old.nonce,'created',false);
  end if;
  update public.bookings set status='released' where cart_id=old.cart_id and status='pending';
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<>cardinality(plan.source_booking_ids) then raise exception 'Missing areas'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if not ((item->>'source_id')::uuid=any(plan.source_booking_ids)) or (item->>'source_id')::uuid=any(seen) then raise exception 'Wrong source'; end if;
  seen:=array_append(seen,(item->>'source_id')::uuid);
  select b.* into source from public.bookings b join public.advertiser_bookings a on a.booking_id=b.id and a.user_id=p_user where b.id=(item->>'source_id')::uuid;
  if not found then raise exception 'Source unavailable'; end if;
  select zone_id into source_zone from public.editions where id=source.edition_id;
  select * into target from public.editions where id=(item->>'edition_id')::uuid;
  if not found or target.zone_id<>source_zone or target.issue_month<>p_month or item->>'mode'<>source.size then raise exception 'Campaign does not match the plan'; end if;
 end loop;
 cart:=public.hold_cart(p_hash,p_items,p_pricing_mode);
 if p_expected_total is null or (select sum(price_cents) from public.bookings where cart_id=cart)<>p_expected_total then raise exception 'Pricing changed; review again'; end if;
 insert into public.recurring_occurrences(plan_id,issue_month,cart_id,nonce) values(p_plan,p_month,cart,p_nonce)
 on conflict(plan_id,issue_month) do update set cart_id=excluded.cart_id,nonce=excluded.nonce,created_at=now();
 return jsonb_build_object('cart_id',cart,'nonce',p_nonce,'created',true);
end $$;
revoke all on function public.hold_recurring_occurrence(uuid,uuid,date,uuid,text,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.hold_recurring_occurrence(uuid,uuid,date,uuid,text,jsonb,text,integer) to service_role;
notify pgrst,'reload schema';
