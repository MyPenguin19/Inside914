// Deletes development TEST reservations (fake "devtest" Stripe ids) and their artwork files.
// Refuses to run against any database except the Inside914 DEV project or a local stack.
// Usage: npm run dev:clear-test-reservations
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const allowed = ["uobiwanrxifqwdnouzxj.supabase.co", "127.0.0.1", "localhost"];
let host = "";
try {
  host = new URL(url).hostname;
} catch {}
if (!allowed.includes(host)) {
  console.error(`Refusing: ${host || "no database"} is not the development database.`);
  process.exit(1);
}
if (!process.env.SUPABASE_SECRET_KEY) {
  console.error("SUPABASE_SECRET_KEY is required (in .env.local).");
  process.exit(1);
}

const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: bookings, error } = await admin.from("bookings").select("id").like("stripe_customer_id", "cus_devtest_%");
if (error) throw error;
const ids = (bookings ?? []).map((b) => b.id);
if (ids.length) {
  const { data: art } = await admin.from("booking_artwork").select("storage_path").in("booking_id", ids);
  if (art?.length) await admin.storage.from("artwork").remove(art.map((a) => a.storage_path));
  const { error: deleteError } = await admin.from("bookings").delete().in("id", ids);
  if (deleteError) throw deleteError;
}
console.log(`Removed ${ids.length} test reservation(s) from ${host}.`);
