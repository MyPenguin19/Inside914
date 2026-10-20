import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("RLS maintenance stays intact but cannot be called by browser roles", () => {
  const migration = readFileSync("supabase/migrations/20261020030240_restrict_rls_maintenance_execution.sql", "utf8");
  const sql = `begin;
  do $$ begin
    if to_regprocedure('public.rls_auto_enable()') is null then
      execute 'create function public.rls_auto_enable() returns event_trigger language plpgsql security definer as $body$ begin end $body$';
    end if;
  end $$;
  create temporary table original_rls_hook as select pg_get_functiondef('public.rls_auto_enable()'::regprocedure) body;
  grant execute on function public.rls_auto_enable() to public, anon, authenticated;
  ${migration}
  ${migration}
  do $$ begin
    if has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') or
       has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') then
      raise exception 'Browser execution was not revoked';
    end if;
    if (select body from original_rls_hook) <> pg_get_functiondef('public.rls_auto_enable()'::regprocedure) then
      raise exception 'RLS maintenance implementation changed';
    end if;
  end $$;
  rollback;`;
  const output = execFileSync("python3", ["scripts/local-test-db.py", "-c", sql], { encoding: "utf8" });
  expect(output.trim()).toMatch(/ROLLBACK$/);
});
