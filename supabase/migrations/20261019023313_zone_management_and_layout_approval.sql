-- No catalog records are inserted. Zone changes use the existing audited admin boundary.
alter table public.admin_events drop constraint admin_events_target_type_check;
alter table public.admin_events add constraint admin_events_target_type_check
  check (target_type in ('campaign', 'slot', 'booking', 'artwork', 'evidence', 'zone'));

-- Case/whitespace cannot create a second spelling of an existing geographic zone.
create unique index zones_normalized_name_unique on public.zones (lower(btrim(name)));

create function public.admin_save_zone(p_id uuid, p_name text, p_slug text, p_household_count integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_before public.zones;
begin
  perform private.require_admin();
  p_name := btrim(p_name);
  p_slug := lower(btrim(p_slug));
  if p_name is null or length(p_name) not between 1 and 120
     or p_slug is null or length(p_slug) not between 1 and 120
     or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or p_household_count is null or p_household_count not between 0 and 1000000 then
    raise exception using errcode = 'ADM03', message = 'invalid_zone';
  end if;
  if p_id is null then
    insert into public.zones (name, slug, household_count)
      values (p_name, p_slug, p_household_count) returning id into v_id;
    perform private.log_event('zone.created', 'zone', v_id::text,
      jsonb_build_object('name', p_name, 'slug', p_slug, 'household_count', p_household_count, 'quantity_status', 'provisional'));
  else
    select * into v_before from public.zones where id = p_id for update;
    if not found then raise exception using errcode = 'ADM02', message = 'zone_not_found'; end if;
    if (v_before.name, v_before.slug, v_before.household_count) = (p_name, p_slug, p_household_count) then return p_id; end if;
    -- Preserve published URLs once a campaign has been created for the zone.
    if v_before.slug <> p_slug and exists (select 1 from public.editions where zone_id = p_id) then
      raise exception using errcode = 'ADM04', message = 'zone_slug_in_use';
    end if;
    update public.zones set name = p_name, slug = p_slug, household_count = p_household_count where id = p_id;
    v_id := p_id;
    perform private.log_event('zone.updated', 'zone', v_id::text,
      jsonb_build_object('before', to_jsonb(v_before), 'name', p_name, 'slug', p_slug, 'household_count', p_household_count, 'quantity_status', 'provisional'));
  end if;
  return v_id;
exception when unique_violation then
  raise exception using errcode = 'ADM04', message = 'zone_exists';
end;
$$;
revoke all on function public.admin_save_zone(uuid, text, text, integer) from public, anon;
grant execute on function public.admin_save_zone(uuid, text, text, integer) to authenticated;
-- Preserve existing SELECT/RLS policies; mutations now require the audited function.
revoke insert, update, delete on public.zones from authenticated;

-- No template is approved yet. Only an explicitly reviewed future migration may register one.
-- This private registry is not writable through the Data API or administrator session.
create table private.approved_layout_templates (
  template_key text primary key,
  approval_reference text not null check (length(btrim(approval_reference)) > 0),
  approved_at timestamptz not null default now()
);
alter table private.approved_layout_templates enable row level security;
revoke all on private.approved_layout_templates from public, anon, authenticated;
create function private.guard_campaign_layout()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from new.status or old.layout_template is distinct from new.layout_template)
     and not exists (select 1 from private.approved_layout_templates where template_key = new.layout_template) then
    raise exception using errcode = 'ADM04', message = 'layout_not_approved';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_campaign_layout() from public, anon, authenticated;
create trigger campaign_layout_before_open before insert or update on public.editions
  for each row execute function private.guard_campaign_layout();
