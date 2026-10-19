-- Qualify the selected campaign ID; preserve the earlier applied migration.
create or replace function public.hold_category_cart(
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
    select 1 from unnest(v_editions) selected(edition_id) left join public.editions e on e.id = selected.edition_id
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
