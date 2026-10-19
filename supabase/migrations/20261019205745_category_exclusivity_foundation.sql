-- Category foundation only. No campaign/inventory creation, geometry, repricing or charges.
-- Existing campaigns opt out; existing bookings retain NULL categories and their original terms.
create table public.advertising_categories (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique check (length(btrim(name)) between 1 and 80)
);
alter table public.advertising_categories enable row level security;
revoke all on public.advertising_categories from public, anon, authenticated;
grant select on public.advertising_categories to anon, authenticated;
grant all on public.advertising_categories to service_role;
create policy "read category catalog" on public.advertising_categories
  for select to anon, authenticated using (true);

-- Product reference identifiers, not sample advertisers or production campaigns.
insert into public.advertising_categories (id, name) values
  ('plumbing', 'Plumbing'), ('hvac', 'HVAC'), ('landscaping', 'Landscaping'),
  ('real-estate', 'Real estate'), ('dental', 'Dental'), ('restaurant', 'Restaurant'),
  ('pet-care', 'Pet care'), ('auto-repair', 'Auto repair'), ('roofing', 'Roofing'),
  ('electrician', 'Electrician'), ('cleaning', 'Cleaning'), ('pest-control', 'Pest control');

alter table public.editions add column category_exclusivity boolean not null default false;
alter table public.bookings add column category_id text
  references public.advertising_categories(id) on update restrict on delete restrict;
create index bookings_category_id_idx on public.bookings(category_id) where category_id is not null;

-- Time is deliberately not an index predicate. Expired holds are released under locks by
-- hold_category_cart before reallocation. Cancellation/release frees this claim atomically.
create unique index bookings_one_active_category on public.bookings(edition_id, category_id)
  where category_id is not null and status not in ('released', 'cancelled');

create function private.guard_campaign_categories()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.category_exclusivity = new.category_exclusivity then return new; end if;
  if tg_op = 'UPDATE' and old.category_exclusivity then
    raise exception using errcode = 'CAT01', message = 'category_exclusivity_cannot_be_disabled';
  end if;
  if new.category_exclusivity and (new.status <> 'draft' or exists (
    select 1 from public.bookings where edition_id = new.id
  )) then
    raise exception using errcode = 'CAT01', message = 'categories_require_unused_draft';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_campaign_categories() from public, anon, authenticated;
create trigger guard_campaign_categories before insert or update of category_exclusivity
  on public.editions for each row execute function private.guard_campaign_categories();

create function private.enable_campaign_categories(p_edition_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.editions;
begin
  perform private.require_admin();
  select * into e from public.editions where id = p_edition_id for update;
  if not found then raise exception using errcode = 'ADM02', message = 'not_found'; end if;
  if e.category_exclusivity then return 'already'; end if;
  update public.editions set category_exclusivity = true, updated_at = now() where id = e.id;
  perform private.log_event('campaign.categories_enabled', 'campaign', e.id::text,
    jsonb_build_object('category_exclusivity', true));
  return 'done';
end;
$$;
revoke all on function private.enable_campaign_categories(uuid) from public, anon, authenticated;
grant execute on function private.enable_campaign_categories(uuid) to authenticated;
create function public.admin_enable_campaign_categories(p_edition_id uuid)
returns text language sql security invoker set search_path = '' as $$
  select private.enable_campaign_categories(p_edition_id);
$$;
revoke all on function public.admin_enable_campaign_categories(uuid) from public, anon, authenticated;
grant execute on function public.admin_enable_campaign_categories(uuid) to authenticated;

create function private.guard_booking_category_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.category_id is not null and
    (new.category_id is distinct from old.category_id or new.edition_id <> old.edition_id) then
    raise exception using errcode = 'CAT02', message = 'reservation_category_is_immutable';
  end if;
  if old.category_id is null and new.category_id is not null and old.status <> 'pending' then
    raise exception using errcode = 'CAT02', message = 'category_requires_pending_hold';
  end if;
  if old.category_id is not null and old.status in ('released', 'cancelled')
    and new.status not in ('released', 'cancelled') then
    raise exception using errcode = 'CAT02', message = 'ended_category_reservation_cannot_reopen';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_booking_category_identity() from public, anon, authenticated;
create trigger guard_booking_category_identity before update of category_id, edition_id, status
  on public.bookings for each row execute function private.guard_booking_category_identity();

-- The existing hold_cart can insert first and the new wrapper assigns its category second,
-- but nobody can commit an uncategorized active hold/reservation in an enabled campaign.
-- Re-read the final row: the NEW image from an earlier event can be stale at commit time.
create function private.require_booking_category()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare b public.bookings; required boolean;
begin
  select * into b from public.bookings where id = new.id;
  if not found then return null; end if;
  select category_exclusivity into required from public.editions where id = b.edition_id;
  if required and b.status not in ('released', 'cancelled') and b.category_id is null then
    raise exception using errcode = 'CAT03', message = 'category_required';
  end if;
  if not required and b.category_id is not null then
    raise exception using errcode = 'CAT03', message = 'campaign_categories_not_enabled';
  end if;
  return null;
end;
$$;
revoke all on function private.require_booking_category() from public, anon, authenticated;
create constraint trigger require_booking_category after insert or update on public.bookings
  deferrable initially deferred for each row execute function private.require_booking_category();

-- No anonymous/customer may acquire a claim directly. A server must authorize the cart's
-- token and apply the existing request rate limit before invoking this service-only RPC.
-- Reuses current pricing unchanged; the later $399 product revision remains separate.
create function public.hold_category_cart(
  p_category_id text, p_token_hash text, p_items jsonb, p_pricing_mode text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_editions uuid[]; v_edition uuid; v_cart uuid; v_constraint text;
begin
  if p_category_id is null or not exists (
    select 1 from public.advertising_categories where id = p_category_id
  ) then raise exception using errcode = 'CAT04', message = 'invalid_category'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
  end if;
  if jsonb_array_length(p_items) not between 1 and 4 then
    raise exception using errcode = 'INS04', message = 'invalid_selection';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where
    i->>'mode' is distinct from 'standard' or jsonb_typeof(i->'slot_ids') is distinct from 'array') then
    raise exception using errcode = 'INS04', message = 'category_holds_require_single_positions';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where jsonb_array_length(i->'slot_ids') <> 1) then
    raise exception using errcode = 'INS04', message = 'category_holds_require_single_positions';
  end if;
  select array_agg(distinct (i->>'edition_id')::uuid order by (i->>'edition_id')::uuid)
    into v_editions from jsonb_array_elements(p_items) i;
  if cardinality(v_editions) <> jsonb_array_length(p_items) or exists (
    select 1 from unnest(v_editions) id left join public.editions e on e.id = id
    where e.category_exclusivity is distinct from true
  ) then raise exception using errcode = 'CAT03', message = 'campaign_categories_not_enabled'; end if;

  -- Advisory locks serialize same-category attempts, including empty claim sets. The unique
  -- index is the final protection, including writes that do not take these advisory locks.
  foreach v_edition in array v_editions loop
    perform pg_advisory_xact_lock(hashtextextended('inside914-category:' || v_edition || ':' || p_category_id, 0));
  end loop;
  -- Match existing hold_cart's slot lock order BEFORE touching expired bookings. No new slot
  -- locks are needed after expiry cleanup, avoiding a booking -> slot lock-order inversion.
  perform 1 from public.slots s where s.id in (
    select value::uuid from jsonb_array_elements(p_items) i, jsonb_array_elements_text(i->'slot_ids')
  ) order by s.id for update;
  perform 1 from public.bookings b where b.edition_id = any(v_editions)
    and b.category_id = p_category_id and b.status = 'pending' and b.hold_expires_at <= now()
    order by b.id for update;
  update public.bookings set status = 'released', updated_at = now()
    where edition_id = any(v_editions) and category_id = p_category_id
      and status = 'pending' and hold_expires_at <= now();
  if exists (select 1 from public.bookings where edition_id = any(v_editions)
    and category_id = p_category_id and status not in ('released', 'cancelled')) then
    raise exception using errcode = 'CAT05', message = 'category_unavailable';
  end if;
  v_cart := public.hold_cart(p_token_hash, p_items, p_pricing_mode);
  update public.bookings set category_id = p_category_id where cart_id = v_cart;
  return v_cart;
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'bookings_one_active_category' then
    raise exception using errcode = 'CAT05', message = 'category_unavailable';
  end if;
  raise;
end;
$$;
revoke all on function public.hold_category_cart(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.hold_category_cart(text, text, jsonb, text) to service_role;

-- Anonymous visitors intentionally learn ONLY a public campaign's category availability,
-- never a booking ID, identity, contact, token, or payment details. Closed/private campaigns
-- return the same non-disclosing 'closed' result even if a caller guesses their UUID.
create function private.category_occupancy(p_edition_id uuid, p_category_id text)
returns text language sql stable security definer set search_path = '' as $$
  select case when not exists (
    select 1 from public.editions e where e.id = p_edition_id and e.category_exclusivity
      and private.edition_is_bookable(e.id)
  ) or not exists (select 1 from public.advertising_categories where id = p_category_id)
  then 'closed' else coalesce((
    select case when b.status = 'pending' then 'held' else 'reserved' end
    from public.bookings b where b.edition_id = p_edition_id and b.category_id = p_category_id
      and b.status not in ('released', 'cancelled')
      and not (b.status = 'pending' and b.hold_expires_at <= now())
  ), 'available') end;
$$;
revoke all on function private.category_occupancy(uuid, text) from public, anon, authenticated;
grant execute on function private.category_occupancy(uuid, text) to anon, authenticated, service_role;
create view public.category_availability with (security_invoker = true) as
  select e.id as edition_id, e.zone_id, c.id as category_id, c.name as category_name,
    private.category_occupancy(e.id, c.id) as occupancy
  from public.editions e cross join public.advertising_categories c
  where e.category_exclusivity and e.status in ('open', 'closed');
revoke all on public.category_availability from public, anon, authenticated;
grant select on public.category_availability to anon, authenticated, service_role;
