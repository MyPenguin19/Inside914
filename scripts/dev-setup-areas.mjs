// Local-only, non-destructive area setup. Uses the administrator session and audited RPC.
// Usage: npm run dev:setup-areas -- --admin-file /absolute/path/to/local-admin.json
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { REGIONS } from "../src/lib/catalog/regions.ts";

export function assertLocalAreaSetup(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Area setup requires the isolated local Supabase URL."); }
  if (parsed.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Refusing area setup outside the isolated localhost:54321 Supabase environment.");
  }
}

export async function setupLocalAreas(url, publishableKey, credentials) {
  assertLocalAreaSetup(url);
  if (!publishableKey || !credentials.email || !credentials.password) throw new Error("Local publishable key and administrator credentials are required.");
  const db = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await db.auth.signInWithPassword(credentials);
  if (authError || !auth.user) throw new Error("Could not sign in to the local administrator account.");
  try {
    const { data: admin, error: adminError } = await db.from("admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (adminError || !admin) throw new Error("Area setup requires an existing local administrator.");
    const { data: existing, error } = await db.from("zones").select("id, name, slug, household_count");
    if (error) throw new Error("Could not read local zones; no area setup performed.");
    // Preflight ALL conflicts before inserting anything. Never overwrite a matching slug/name.
    for (const area of REGIONS) {
      const matches = existing.filter((zone) => zone.slug === area.slug || zone.name.trim().toLowerCase() === area.name.toLowerCase());
      if (matches.length > 1 || matches.some((zone) => zone.slug !== area.slug || zone.name !== area.name)) {
        throw new Error(`Conflicting zone for ${area.name}; resolve it in the administrator workflow first.`);
      }
    }
    const result = [];
    for (const area of REGIONS) {
      const found = existing.find((zone) => zone.slug === area.slug);
      if (found) { result.push({ ...area, id: found.id, created: false, household_count: found.household_count }); continue; }
      // 0 means estimate not supplied, not a claim that the geographic area has zero homes.
      const { data: id, error: createError } = await db.rpc("admin_save_zone", { p_id: null, p_name: area.name, p_slug: area.slug, p_household_count: 0 });
      if (createError) throw new Error(`Could not create ${area.name}; safely rerun after resolving the administrator error.`);
      result.push({ ...area, id, created: true, household_count: 0 });
    }
    return result;
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (existsSync(".env.local")) process.loadEnvFile(".env.local");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    assertLocalAreaSetup(url); // Refuse hosted URLs before reading any credential file.
    const index = process.argv.indexOf("--admin-file");
    if (index < 0 || !process.argv[index + 1]) throw new Error("Supply --admin-file with the existing local administrator JSON file. Never use production credentials.");
    const credentials = JSON.parse(readFileSync(process.argv[index + 1], "utf8"));
    const result = await setupLocalAreas(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { email: credentials.email, password: credentials.password });
    for (const area of result) console.log(`${area.name}: ${area.created ? "created" : "kept existing"}; provisional households ${area.household_count || "unset"}`);
    console.log("No campaign dates, campaigns, inventory or reservations were created or changed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local area setup failed.");
    process.exitCode = 1;
  }
}
