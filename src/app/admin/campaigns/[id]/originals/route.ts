import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { campaignOriginals, ORIGINAL_HEADERS } from "@/lib/admin/originals";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const query = z.object({ history: z.enum(["0", "1"]).default("0") }).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: ORIGINAL_HEADERS });
  if (!z.uuid().safeParse(id).success || !query.success) return json({ error: "Invalid campaign request." }, 400);
  try {
    const plan = await campaignOriginals(supabase, createAdminClient(), id, query.data.history === "1");
    return plan ? json(plan) : json({ error: "Campaign not found." }, 404);
  } catch (error) {
    console.error("admin original archive preparation failed");
    return json({ error: error instanceof Error ? error.message : "Could not prepare the artwork backup." }, 503);
  }
}
