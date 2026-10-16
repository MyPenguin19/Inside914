-- Fix Supabase security advisor findings on 20261016040006_catalog:
-- 0010 security_definer_view: slot_availability now runs as the caller, and anon reads
--      published rows through RLS policies instead of the view owner's rights.
-- 0029 authenticated_security_definer_function_executable: is_admin() moves to a schema
--      the REST API does not expose, so it is usable in policies but not callable via /rpc.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Policies reference the function by OID, so they keep working after the move.
alter function public.is_admin() set schema private;

-- Published = open or closed edition. Drafts, cancelled and past editions stay hidden.
grant select on public.zones, public.editions, public.slots to anon;

create policy "anon reads published editions" on public.editions
  for select to anon using (status in ('open', 'closed'));

create policy "anon reads zones with published editions" on public.zones
  for select to anon using (
    exists (
      select 1 from public.editions e
      where e.zone_id = zones.id and e.status in ('open', 'closed')
    )
  );

create policy "anon reads slots of published editions" on public.slots
  for select to anon using (
    exists (
      select 1 from public.editions e
      where e.id = slots.edition_id and e.status in ('open', 'closed')
    )
  );

alter view public.slot_availability set (security_invoker = true);
