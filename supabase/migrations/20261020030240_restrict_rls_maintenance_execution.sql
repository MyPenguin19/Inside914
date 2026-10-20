-- Supabase's automatic RLS hook is an event-trigger function, not a browser RPC.
-- Preserve its implementation and event trigger; remove only client execution grants.
-- Native/local stacks may not install this managed-platform helper.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and p.pronargs = 0 and p.prorettype = 'pg_catalog.event_trigger'::regtype
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
