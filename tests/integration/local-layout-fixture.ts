import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

function findPsql(dir: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === "psql") return path;
    if (entry.isDirectory()) { const found = findPsql(path); if (found) return found; }
  }
  return null;
}
export function localLayoutFixture(key: string, remove = false) {
  if (!/^test-approved-[a-f0-9-]+$/.test(key)) throw new Error("Invalid fixture key");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.SUPABASE_URL ?? "")) throw new Error("Fixture requires the isolated local stack");
  const psql = process.env.LOCAL_PSQL_PATH ?? findPsql(resolve("../supabase-runtime/cache")) ?? "psql";
  const sql = remove
    ? `delete from private.approved_layout_templates where template_key = '${key}';`
    : `insert into private.approved_layout_templates (template_key, approval_reference) values ('${key}', 'Synthetic isolated test fixture; never a print approval');`;
  execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: { ...process.env, PGHOST: "127.0.0.1", PGPORT: "54322", PGUSER: "postgres", PGDATABASE: "postgres", PGPASSWORD: "postgres" }, stdio: "pipe" });
}

// Open only UUID-scoped local test campaigns using the migrated approval registry.
export function openLocalSquareFixtures(ids: string[]) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Local stack required");
  if (!ids.length || ids.some(id=>! /^[a-f0-9-]{36}$/.test(id))) throw new Error("Invalid fixture IDs");
  const psql = process.env.LOCAL_PSQL_PATH ?? findPsql(resolve("../supabase-runtime/cache")) ?? "psql";
  execFileSync(psql,["-X","-v","ON_ERROR_STOP=1","-c",`begin;
    update public.editions set status='open' where id in (${ids.map(id=>`'${id}'`).join(",")}) and product_model='square_v1';
    commit;`], { env: {...process.env,PGHOST:"127.0.0.1",PGPORT:"54322",PGUSER:"postgres",PGDATABASE:"postgres",PGPASSWORD:"postgres"},stdio:"pipe" });
}
