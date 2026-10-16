import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

// Checks the generated Database types against the live schema through supabase-js.
test("typed publishable-key client reads the public catalog", async () => {
  const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("slot_availability")
    .select("slot_id, side, label, width_in, height_in, price_cents, available")
    .eq("zone_slug", "southern-westchester");

  expect(error).toBeNull();
  expect(data?.length).toBeGreaterThan(0);
  expect(data?.every((row) => row.side === "front" || row.side === "back")).toBe(true);

  const { data: admins } = await supabase.from("admins").select("user_id");
  expect(admins ?? []).toEqual([]);
});
