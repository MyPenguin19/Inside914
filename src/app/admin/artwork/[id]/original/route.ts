import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { locateOriginals, ORIGINAL_HEADERS, signOriginal } from "@/lib/admin/originals";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const query = z.object({ version: z.string().regex(/^[a-f0-9]{64}$/).optional(), history: z.enum(["0", "1"]).default("0") }).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: ORIGINAL_HEADERS });
  if (!z.uuid().safeParse(id).success || !query.success) return json({ error: "Invalid original request." }, 400);
  try {
    const originals = await locateOriginals(supabase, id, query.data.history === "1");
    const located = originals?.find(o => query.data.version ? o.source.version === query.data.version : o.source.kind === "current");
    if (!located) return json({ error: "Original not found for this booking. Reload if artwork changed." }, 404);
    const result = await signOriginal(createAdminClient(), located);
    return json(result, result.url ? 200 : 409);
  } catch {
    console.error("admin original download preparation failed");
    return json({ error: "Could not prepare the original. Please retry." }, 503);
  }
}
